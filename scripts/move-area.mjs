// Atlas — MOVE MODE: pick a room up anywhere inside it and put it down somewhere else.
//
// Until now the only way to move a room was to drag its LABEL and then press Redraw, which
// re-anchors every polygon to its label's centre. This is the direct version: while move mode is
// on, a left-drag anywhere inside a room moves that room, and letting go puts it down.
//
// ⚠⚠ MODAL, exactly like Trace and Box, and for the same reason: it CONSUMES the drag. While it is
//   on you cannot pan by dragging inside a room, and you cannot drag a token standing in one,
//   because the gesture has been taken over. That is what a mode IS, and it is why the panel keeps
//   the button lit the whole time it is on.
// ⚠ A drag that STARTS outside every room is left alone entirely, so the map still pans from empty
//   ground without switching the mode off.
// ⚠ A LABEL SITS ABOVE THE ROOM'S INTERIOR. A press that lands on a name plate is the plate's,
//   not the room's, so a label lying inside its own room can still be nudged on its own.
import { CONFIG } from "./config.mjs";
import { readAreaData, translateShape } from "./data.mjs";
import { areaAtPoint } from "./los.mjs";
import { labelAt } from "./hit.mjs";
import { moveArea, setLock } from "./marker.mjs";
import { labelsMovable } from "./labels.mjs";

const EDGE = 0x5b9bff;
const CLICK_SLOP = 4;          // under this it was a click, not a move, and nothing should shift

let _on = false;
let _g = null;                 // the preview outline
let _drag = null;              // { label, shape, startW, lastW }

export function moveModeOn() { return _on; }

function worldOf(e) { return e.getLocalPosition?.(canvas.stage); }

function paint() {
  if (!_g) return;
  _g.clear();
  if (!_drag) return;
  const dx = _drag.lastW.x - _drag.startW.x;
  const dy = _drag.lastW.y - _drag.startW.y;
  _g.lineStyle(3, EDGE, 0.95).beginFill(EDGE, 0.12);
  _g.drawPolygon(translateShape(_drag.shape, dx, dy));
  _g.endFill();
}

function onDown(e) {
  if (!_on || (e.button ?? 0) !== 0) return;
  const w = worldOf(e);
  if (!w) return;
  // ⚠⚠ THE LABEL WINS (user, 2026-09-23: "rool lables should sit on the layer above the rooms
  //    interior, right now i cannot move a room lable unless i first move the room until the lable
  //    sits outside the room"). This is not a z-order: the room is a polygon in a scene flag and
  //    the label is a token, and the two never share a sorting layer. What decides is who is asked
  //    first, and this mode is asked first because it captures. So it asks about labels itself and
  //    lets the press fall through when one is there, to Foundry's ordinary token drag: the label
  //    moves and the room does not.
  if (labelAt(w.x, w.y)) return;
  const data = readAreaData(canvas?.scene);
  const label = areaAtPoint(w.x, w.y, data.areas ?? {});
  if (!label) return;                               // empty ground: let Foundry pan as usual
  e.stopPropagation();                              // ours now, so nothing else drags
  _drag = { label, shape: [...(data.areas[label].shape ?? [])], startW: w, lastW: w };
  paint();
}

function onMove(e) {
  if (!_drag) return;
  const w = worldOf(e);
  if (!w) return;
  _drag.lastW = w;
  paint();
}

async function onUp(e) {
  const d = _drag;
  if (!d) return;
  e.stopPropagation();
  _drag = null;
  paint();
  const dx = d.lastW.x - d.startW.x;
  const dy = d.lastW.y - d.startW.y;
  if (Math.hypot(dx, dy) < CLICK_SLOP) return;      // a click inside a room moves nothing
  await moveArea(canvas.scene, d.label, dx, dy);
}

// Escape lets go of a room in mid-air; pressed again, it leaves the mode.
function onKey(ev) {
  if (ev.key !== "Escape" || !_on) return;
  ev.preventDefault();
  if (_drag) { _drag = null; paint(); return; }
  setMoveMode(false);
  ui.notifications?.info("Atlas: move mode off.");
}

function arm() {
  if (_g || !canvas?.ready) return;
  _g = new PIXI.Graphics();
  (canvas.controls ?? canvas.stage).addChild(_g);
  canvas.stage.addEventListener?.("pointerdown", onDown, { capture: true });
  canvas.stage.addEventListener?.("pointerup", onUp, { capture: true });
  canvas.stage.on?.("pointermove", onMove);
  window.addEventListener("keydown", onKey);
}

function disarm() {
  _drag = null;
  try { canvas?.stage?.removeEventListener?.("pointerdown", onDown, { capture: true }); } catch (_) {}
  try { canvas?.stage?.removeEventListener?.("pointerup", onUp, { capture: true }); } catch (_) {}
  try { canvas?.stage?.off?.("pointermove", onMove); } catch (_) {}
  window.removeEventListener("keydown", onKey);
  try { _g?.destroy?.(); } catch (_) {}
  _g = null;
}

// While move mode is on, EVERYTHING is loose: the rooms by dragging inside them, and their labels
// too, so a label can still be nudged on its own without leaving the mode. The map's own lock is
// remembered and put back when the mode ends, so a Keeper who had locked the map keeps it locked.
let _wasLocked = null;
async function syncLock() {
  const scene = canvas?.scene;
  if (!scene || !game.user?.isGM) return;
  if (_on) {
    if (_wasLocked === null) _wasLocked = !!scene.getFlag(CONFIG.flagScope, "areasLocked");
    if (_wasLocked) await setLock(scene, false);
  } else if (_wasLocked !== null) {
    const putBack = _wasLocked;
    _wasLocked = null;
    if (putBack) await setLock(scene, true);
  }
}

/** Turn move mode on or off. GM only: moving a room is a scene write. */
export function setMoveMode(on) {
  const want = !!on && !!game.user?.isGM;
  if (want === _on) return _on;
  _on = want;
  if (_on) arm(); else disarm();
  // ⚠ Labels light up under the cursor only while this is on, so they have to hear both edges.
  labelsMovable(_on);
  // not awaited: the mode itself is live immediately, and the lock is a scene write that catches up
  syncLock().catch((e) => console.warn("Atlas | move mode could not change the map lock", e));
  return _on;
}

export function installMoveArea() {
  // the stage is rebuilt per scene, so listeners bound to the old one are dead: drop the mode
  // rather than leave a button lit over a tool that no longer hears anything
  Hooks.on("canvasReady", () => { if (_on) { _on = false; disarm(); } });
}
