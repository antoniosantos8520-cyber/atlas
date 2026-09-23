// Atlas — a blacked-out room, as seen (or not) on the canvas.
//
// The RULES already live elsewhere: `data.mjs` holds the switch and the movement refusal, and
// `los.mjs` seals a blacked-out room's sight on all three counts. This file is only the part you
// look at: the room's outline is black and hatched for the Keeper, and simply not drawn for anyone
// else, and its label is gone for them too.
//
// ⚠ PER CLIENT, exactly like the fog itself. The outline is a real Drawing document that every
//   client receives; what differs is whether a given client paints it. Using the document's own
//   `hidden` flag instead would be ONE SHARED SWITCH, and it would also grey the room out for the
//   Keeper, who is the one person who needs to see it clearly.
// ⚠ THE LINES AND DOORS GO TOO (user, 2026-09-23). A hidden room with white lines still running
//   to it is barely hidden: converging lines on an empty patch of map say "something is here" as
//   loudly as an outline would. Every line, and any door icon riding it, is taken away from the
//   table for as long as either room it touches is dark, and comes back with the room.
import { CONFIG } from "./config.mjs";
import { refreshLabels } from "./labels.mjs";

/** Is this room hidden from the table? Raw read: this runs on every drawing refresh. */
function isDark(scene, label) {
  return !!scene?.flags?.[CONFIG.flagScope]?.areaData?.areas?.[label]?.blackout;
}

/** The two rooms a connection line (or the door icon on it) joins, or null if it is not one. PURE. */
export function pairOf(flags) {
  const raw = flags?.areaPair;
  if (!raw) return null;
  const pair = String(raw).split("|");
  return pair.length === 2 ? pair : null;
}

/**
 * Is this drawing taken away from the table? PURE, and the whole rule in one place.
 *
 * `dark` is a predicate: a room label in, true if that room is hidden.
 *
 * ⚠ EITHER END darkens a line. A line is only meaningful when both rooms are on the map, and from
 *   the visible side it would otherwise point straight at the hidden one.
 */
export function hiddenFromTable(room, pair, dark) {
  if (room) return !!dark(room);
  if (pair) return !!dark(pair[0]) || !!dark(pair[1]);
  return false;
}

function applyTo(drawing) {
  const doc = drawing?.document;
  const flags = doc?.flags?.[CONFIG.flagScope];
  const label = flags?.areaRoom;
  const pair = pairOf(flags);
  // ⚠ NOT OURS, NOT TOUCHED. A scene is full of drawings other people put there.
  if (!label && !pair) return;
  // The Keeper sees every room, hatched when it is hidden, and every line into it.
  if (game.user?.isGM) { drawing.alpha = 1; return; }
  const scene = doc.parent;
  // ⚠ EITHER END darkens the line. A line is only meaningful when both rooms are on the map,
  //   and it would otherwise point straight at the hidden one from the visible side.
  drawing.alpha = hiddenFromTable(label, pair, (l) => isDark(scene, l)) ? 0 : 1;
}

/** Re-assert every room outline's visibility on this client. */
export function refreshBlackout() {
  for (const d of canvas?.drawings?.placeables ?? []) {
    try { applyTo(d); } catch (_) { /* mid-draw: the next refresh catches it */ }
  }
}

export function installBlackout() {
  // Foundry re-derives a placeable's alpha on every refresh, so ours is re-asserted after it,
  // the same ordering the label alpha relies on.
  Hooks.on("refreshDrawing", (d) => { try { applyTo(d); } catch (_) {} });
  Hooks.on("drawDrawing", (d) => { try { applyTo(d); } catch (_) {} });

  // Blacking a room out has to reach every viewer at once, with nothing for them to click and no
  // reload: the Keeper's write replicates, and each client re-reads it here.
  Hooks.on("updateScene", (scene, changes) => {
    if (scene?.id !== canvas?.scene?.id) return;
    const fk = changes?.flags;
    if (!fk || (!(CONFIG.flagScope in fk) && !(("-=" + CONFIG.flagScope) in fk))) return;
    refreshBlackout();
    refreshLabels();                                    // the room's label goes with its outline
  });

  Hooks.on("canvasReady", () => refreshBlackout());
}
