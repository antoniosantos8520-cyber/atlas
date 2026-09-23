// Atlas — the movement restrictor. A token may only move between rooms the map JOINS.
//
// Connections are DOORS, not adjacency. Two rooms can share a long wall and not be joined;
// two rooms at opposite corners of the map can be joined by a stair. The question is always
// "does the matrix link these two", never "are these two touching". A geometric version of
// this would either find no links at all or legalise moves straight through walls.
//
// ONE HOP, judged on the ENDPOINTS. See `data.mjs stepLegal` for why endpoints and not the
// path travelled.
//
// OFF BY DEFAULT. This is a published module, and an upgrade must never change how a table
// that already uses it moves.
//
// ⚠⚠ THIS HANDLER IS NEVER ASYNC, AND MUST NEVER BECOME ASYNC. Core calls it as
//     movementAllowed &&= (options.noHook || Hooks.call("preMoveToken", this, move, options))
// and `Hooks.call` is SYNCHRONOUS. An async function returns a Promise, a Promise is truthy,
// and the gate would then allow every move while looking entirely correct. The sibling call
// on the line above it in core IS awaited, which is what makes this easy to get wrong.
// `tests/movement.test.mjs` pins it.
//
// ⚠ It is a PURE READ. It writes nothing, fires no hook and forces no rebuild. It cannot know
// a move will actually happen even when it allows one, because a host system's own gates run
// after this and can still refuse. Anything recorded here would describe a move that never
// occurred, and a rebuild forced "to be safe" is how a host once announced every token on the
// map as newly arrived.
import { CONFIG } from "./config.mjs";
import { stepLegal, blackoutRefuses, anyBlackout } from "./data.mjs";
import { areaAtPoint } from "./los.mjs";
import { movementRestricted } from "./settings.mjs";

let _installed = false;

// The scene's map, RAW: a move is not a frame, but there is no reason to deep-clone it, and a
// raw read cannot throw the way getFlag does on a scope that is not installed.
//
// ⚠ A scene with no rooms traced has nothing to say. The "no connections" case is handled further
//   down rather than here, because a BLACKOUT still applies on a map that has not been wired yet.
function mapOf(scene) {
  const raw = scene?.flags?.[CONFIG.flagScope]?.areaData;
  if (!raw?.areas || !Object.keys(raw.areas).length) return null;
  return raw;
}

// ⚠ STRICT, and deliberately so. A point in a gap between two hand-traced polygons is in NO
// room, and stepLegal passes anything with a null end. The fuzzy reader (tokenArea, and
// ATLAS.areaOf on the public API) is for FOG, where a token must always be somewhere; this is
// an entry question and must not invent a room a token is not in. A token standing in a gap is
// therefore unrestricted, which is the accepted price of tracing rooms by hand over an image.
//
// ⚠ A movement position is a TOP-LEFT corner, not a centre, so feeding its raw x/y to a room
// lookup reads the wrong room for anything bigger than one square and the wrong side of a
// boundary for a small token near an edge. getCenterPoint is also what gets hex geometry right.
function roomAt(doc, position, areas) {
  if (!position) return null;
  const c = doc.getCenterPoint(position);
  return areaAtPoint(c.x, c.y, areas);
}

// Name a room the way the Keeper named it, falling back to its letter.
function nameOf(data, label) {
  const name = data.areas?.[label]?.name;
  return name ? `${label} (${name})` : label;
}

/**
 * The gate. `false` refuses the move and the token never leaves; `true` lets it through.
 *
 * ⚠ NEVER async. See the file header.
 *
 * @param {TokenDocument} doc       the token being moved
 * @param {object} movement         core's movement operation (origin, destination, method, ...)
 * @returns {boolean}
 */
export function gateMove(doc, movement) {
  try {
    if (game.user?.isGM) return true;                       // the Keeper is exempt from both rules

    // Undo must always work, or a refusal could strand a token; a paste is a placement.
    const method = movement?.method;
    if (method === "undo" || method === "paste") return true;

    // Room labels are furniture. They are dragged to reshape the map, never "moved", and
    // Redraw anchors each room's polygon to its label, so gating one would freeze the editor.
    // RAW flags, never getFlag, and never an actor-type test: a label wears a host actor type.
    const flags = doc?.flags?.[CONFIG.flagScope];
    if (flags?.areaMarker || flags?.markerActor) return true;

    // The host's own props: party markers, ward lamps, thrown weapons. Atlas cannot recognise
    // them and must not try, so the host says which tokens this rule was never meant for.
    if (CONFIG.skipMovementGate?.(doc, movement)) return true;

    // ⚠ The TOKEN's scene, not the viewed one. A move can be aimed at a scene nobody is looking
    // at, and judging it against the map on screen would be nonsense.
    const data = mapOf(doc?.parent);
    if (!data) return true;
    // nothing to enforce: the connection rule is off and no room is hidden
    if (!movementRestricted() && !anyBlackout(data)) return true;

    // ⚠ origin and destination, NEVER the token's current centre. At this point in the pipeline
    // both the document and the placeable still hold the ORIGIN, so a gate that compares centres
    // compares A to A and never refuses anything.
    const from = roomAt(doc, movement?.origin, data.areas);
    const to = roomAt(doc, movement?.destination, data.areas);

    // ⚠⚠ A BLACKOUT REFUSES WHATEVER ELSE IS TRUE, and does not wait on the connection setting: a
    //   table that never turns that on still expects its hidden rooms to be closed.
    // ⚠ The message must NOT name the room. Telling a player "there is no way into E, the Crypt"
    //   hands them the secret the blackout exists to keep.
    if (blackoutRefuses(data, from, to)) {
      ui.notifications?.warn("You cannot go that way.");
      return false;
    }

    if (!movementRestricted()) return true;                 // the CONNECTION rule is the optional one
    if (!data.connections?.length) return true;             // traced, but not yet wired
    if (stepLegal(data, from, to)) return true;

    ui.notifications?.warn(`${nameOf(data, from)} and ${nameOf(data, to)} are not connected.`);
    return false;
  } catch (e) {
    // A bug in here must never strand a token on the map. Allow the move, and be loud about it.
    console.warn("Atlas | movement gate error — move allowed", e);
    return true;
  }
}

export function installMovement() {
  if (_installed) return;
  _installed = true;
  Hooks.on("preMoveToken", gateMove);
}
