// Atlas — PAIR MODE: point at two rooms and do something to the pair.
//
// Two tools want exactly this gesture, and the user asked for them to behave identically (2026-09-23:
// "make the doorway tool work the same as the connection tool they are very similar and it may be
// easier to do several doors in one go than to come back to the door tool every time"):
//
//   CONNECT  joins two rooms, or cuts them if they are already joined.
//   DOORWAY  puts a sight block on the connection between them, or takes one off.
//
// So there is ONE mode here with a kind, rather than two copies of a cursor readout, a pan-safe
// right click and a pick-reset. What differs is three lines: the icon, the verb, and the write.
//
// IT STAYS ON. A map is wired in runs, usually out from one hub, and doors go in runs too. A mode
// that disarmed after every pair would mean a press of the button per door.
//
// THE READOUT IS THE STATE. Two slots and a dash:
//
//   slot 1 is the room you have PICKED   (? until you pick one; the next click fills it)
//   slot 2 is the room under the CURSOR  (? when the cursor is on no room)
//
// and when both are filled the verb says what the click would DO, because both kinds TOGGLE. A tool
// whose one gesture does opposite things without saying which is how a GM cuts a corridor they meant
// to add, or opens a door they meant to close.
//
// ⚠ ONE WRITE PER PAIR. The pick resets the instant a pair completes, so a double click on the second
//   room cannot toggle the same thing twice and land back where it started.
//
// ⚠ RIGHT CLICK CLEARS BOTH SLOTS. Turning a mode on seeds the first slot with the room the panel is
//   showing, which saves a click when that IS the room you want and is in the way when it is not.
import { CONFIG } from "./config.mjs";
import {
  readAreaData, writeAreaData, toggleConnection, hasConnection, toggleDoorway, hasDoorway,
} from "./data.mjs";
import { areaAtPoint } from "./los.mjs";
import { drawConnections } from "./marker.mjs";

let _kind = null;        // "connect" | "doorway" | null
let _from = null;        // the room picked as one end, or null: the next click picks it
let _el = null;          // the floating readout
let _hover = null;       // the room under the cursor, as last seen
let _busy = false;       // a write is in flight; ignore clicks until it lands
let _rdown = null;       // where a right press landed, so a right-DRAG is not read as a right-CLICK

// ⚠ A right DRAG is how you pan the map, and these modes stay on for as long as it takes to wire a
//   map, so panning has to keep working. A right press that travels is a pan and is ignored; one
//   that stays put is a click and clears.
const RCLICK_SLOP_PX = 8;

const ICON = { connect: "fa-link", doorway: "fa-door-closed" };

/** Is a pair mode running? With a kind, is THAT one running. */
export function pairModeOn(kind = null) {
  return kind ? _kind === kind : _kind !== null;
}

/** The room picked as one end, or null. */
export function pairFrom() { return _from; }

/**
 * What the readout should say. PURE, and the only place the two kinds differ in words.
 *
 * `pair` describes the two rooms as they stand: { connected, doored }.
 *
 * ⚠ A DOORWAY NEEDS A CONNECTION. It is a rule ON one, so a pair with nothing between them says so
 *   BEFORE you click, rather than after. That was the one piece of feedback the old one-shot doorway
 *   could not give: you found out by clicking and reading a warning.
 */
export function readoutParts(kind, from, hover, pair = {}) {
  const out = { a: from ?? "?", b: hover ?? "?", verb: "", tone: "" };
  if (!from || !hover || from === hover) return out;
  if (kind === "connect") {
    out.verb = pair.connected ? "cut" : "join";
    out.tone = pair.connected ? "cut" : "join";
    return out;
  }
  if (!pair.connected) { out.verb = "no link"; out.tone = "warn"; return out; }
  // ⚠ Taking a doorway off may reveal actors to every viewer with a sight route, which is the more
  //   consequential half of the toggle. It wears the same red as a cut for that reason.
  out.verb = pair.doored ? "open" : "door";
  out.tone = pair.doored ? "cut" : "join";
  return out;
}

function pairState(from, hover) {
  const data = canvas?.scene?.flags?.[CONFIG.flagScope]?.areaData ?? {};
  if (!from || !hover) return {};
  return { connected: hasConnection(data, from, hover), doored: hasDoorway(data, from, hover) };
}

function paint() {
  if (!_el) return;
  const { a, b, verb, tone } = readoutParts(_kind, _from, _hover, pairState(_from, _hover));
  _el.className = tone ? `atlas-${tone}` : "";
  _el.innerHTML = `<i class="fa-solid ${ICON[_kind] ?? "fa-link"}"></i>`
    + `<span class="atlas-cn-a">${a}</span><span class="atlas-cn-d">–</span><span class="atlas-cn-b">${b}</span>`
    + (verb ? `<span class="atlas-cn-v">${verb}</span>` : "");
}

function place(sx, sy) {
  if (!_el) return;
  _el.style.left = `${sx}px`;
  _el.style.top = `${sy}px`;
}

// ⚠ NOT THROTTLED, unlike the distance readout. That one runs a graph search and rebuilds a DOM node
//   per room change; this one moves an existing node and swaps two letters, and a readout that lags
//   the cursor by 80ms while you are aiming at a room reads as a broken tool.
function onMove(event) {
  if (!_kind) return;
  const g = event.global ?? event.data?.global;
  if (!g) return;
  place(g.x, g.y);
  const areas = canvas?.scene?.flags?.[CONFIG.flagScope]?.areaData?.areas;
  const w = event.getLocalPosition?.(canvas.stage);
  const now = (w && areas) ? areaAtPoint(w.x, w.y, areas) : null;
  if (now === _hover) return;
  _hover = now;
  paint();
}

/**
 * Put both slots back to "?" and wait for a fresh pair.
 *
 * ⚠ _hover is cleared too, so the readout says `? - ?` the instant you press rather than keeping the
 *   room you are still pointing at. The next pointermove fills the right slot back in, which is the
 *   moment you start aiming at something else.
 */
export function clearSlots() {
  if (!_kind) return false;
  _from = null;
  _hover = null;
  paint();
  return true;
}

function onRightDown(e) {
  if (!_kind || (e.button ?? 0) !== 2) return;
  _rdown = { x: e.global?.x ?? 0, y: e.global?.y ?? 0 };
}

function onRightUp(e) {
  if (!_kind || (e.button ?? 0) !== 2) return;
  const from = _rdown;
  _rdown = null;
  if (!from) return;
  const dx = (e.global?.x ?? 0) - from.x;
  const dy = (e.global?.y ?? 0) - from.y;
  if ((dx * dx) + (dy * dy) > RCLICK_SLOP_PX * RCLICK_SLOP_PX) return;   // that was a pan
  // ⚠ PASSIVE. The event is not consumed, so Foundry's own right click still does whatever it does.
  clearSlots();
}

/**
 * A room was clicked. Fills the empty slot, or completes the pair and writes.
 *
 * ⚠ Called from the panel's ONE interception point (retargetPanel), so every route that would
 *   otherwise move the panel answers this instead: a click inside a room, and a click on a label.
 */
export async function pairPick(label) {
  if (!_kind || !label || _busy) return;
  if (!_from) { _from = label; paint(); return; }
  if (_from === label) { _from = null; paint(); return; }   // the picked room again: let it go

  const scene = canvas?.scene;
  if (!scene || !game.user?.isGM) { _from = null; paint(); return; }
  const from = _from;
  const kind = _kind;
  const data = readAreaData(scene);

  // ⚠ A DOORWAY ON NOTHING. The pick is KEPT, because the likely mistake is the second room and not
  //   the first: the next click can be the room actually meant, with no need to start again.
  if (kind === "doorway" && !hasConnection(data, from, label)) {
    ui.notifications?.warn(`${from} and ${label} are not connected, so there is no doorway to put there.`);
    return;
  }

  _from = null;                                             // reset BEFORE the await, not after
  paint();
  _busy = true;
  try {
    if (kind === "connect") {
      const had = hasConnection(data, from, label);
      // ⚠ toggleConnection takes any doorway on the connection with it when it cuts one: a sight
      //   block on a connection that does not exist is invisible, and would come back to life the
      //   moment the two rooms were rejoined.
      await writeAreaData(scene, toggleConnection(data, from, label));
      await drawConnections(scene);
      ui.notifications?.info(had
        ? `${from} and ${label} are no longer connected.`
        : `${from} and ${label} are connected: tokens may travel between them.`);
    } else {
      const had = hasDoorway(data, from, label);
      await writeAreaData(scene, toggleDoorway(data, from, label));
      await drawConnections(scene);                          // the icon appears on, or leaves, the line
      ui.notifications?.info(had
        ? `The doorway between ${from} and ${label} is gone: sight crosses again.`
        : `Doorway between ${from} and ${label}: sight stops here, movement does not.`);
    }
  } finally {
    _busy = false;
    paint();
  }
}

function arm() {
  if (_el || !canvas?.ready) return;
  const el = document.createElement("div");
  el.id = "atlas-connect-readout";
  document.body.appendChild(el);
  _el = el;
  _hover = null;
  canvas.stage.on?.("pointermove", onMove);
  canvas.stage.addEventListener?.("pointerdown", onRightDown);
  canvas.stage.addEventListener?.("pointerup", onRightUp);
  paint();
}

function disarm() {
  _rdown = null;
  try { canvas?.stage?.off?.("pointermove", onMove); } catch (_) { /* stage may be gone */ }
  try { canvas?.stage?.removeEventListener?.("pointerdown", onRightDown); } catch (_) { /* gone */ }
  try { canvas?.stage?.removeEventListener?.("pointerup", onRightUp); } catch (_) { /* gone */ }
  try { _el?.remove?.(); } catch (_) { /* already detached */ }
  _el = null;
  _hover = null;
  _from = null;
}

/**
 * Turn a pair mode on, switch to the other one, or turn it off with null. GM only: both write.
 *
 * ⚠ ONE AT A TIME BY CONSTRUCTION. There is a single slot, so arming one kind cannot leave the other
 *   live, and a click on the map can never be answering a question the GM did not mean to ask.
 *
 * @param {?string} kind   "connect", "doorway", or null to stop
 * @param {?string} start  the room to seed as the first end, so the first pair is one click
 */
export function setPairMode(kind, start = null) {
  const want = (kind && game.user?.isGM) ? kind : null;
  if (want === _kind) return _kind;
  const wasOff = _kind === null;
  _kind = want;
  if (!_kind) { disarm(); return _kind; }
  if (wasOff) arm();                    // switching kinds keeps the readout, and only swaps the icon
  _from = start ?? null;
  paint();
  return _kind;
}

export function installPairMode() {
  // ⚠⚠ The stage is NOT rebuilt per scene: Foundry keeps one for the session and calls
  //    removeAllListeners() on it two lines before canvasReady. A mode left on across a scene change
  //    would be lit with nothing listening. Drop it, as move mode does.
  Hooks.on("canvasReady", () => { if (_kind) { _kind = null; disarm(); } });
}
