// A.T.L.A.S. — the interactive click-to-trace tool (GM).
// Trace a room by clicking its corners; Enter/right-click finishes, Backspace undoes, Esc cancels.
// All canvas/PIXI glue (no Node tests); it just collects a polygon and hands it to placeRoom().
// No top-level Foundry calls (initTrace registers the cleanup hook) so the file imports cleanly in Node.
import { placeRoom, rectPoints } from "./marker.mjs";

let _trace = null;   // polygon trace: { points:[x,y,...], graphics, lastWorld }
let _box = null;     // box drag:      { graphics, startW, lastW, dragging }

const COLOR = 0x3d7bd0;

function snapW(e) {
  const w = e.getLocalPosition(canvas.stage);
  return canvas.grid.getSnappedPoint({ x: w.x, y: w.y }, { mode: CONST.GRID_SNAPPING_MODES.VERTEX });
}
function teardownAll() { teardown(); teardownBox(); }

function redraw() {
  if (!_trace) return;
  const g = _trace.graphics, p = _trace.points;
  g.clear();
  if (p.length >= 4) {
    g.lineStyle(3, COLOR, 0.9);
    g.moveTo(p[0], p[1]);
    for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]);
    if (p.length >= 6) { g.lineStyle(2, COLOR, 0.4); g.lineTo(p[0], p[1]); }   // closing hint
  }
  if (_trace.lastWorld && p.length >= 2) {                                      // rubber-band to cursor
    g.lineStyle(2, COLOR, 0.5);
    g.moveTo(p[p.length - 2], p[p.length - 1]);
    g.lineTo(_trace.lastWorld.x, _trace.lastWorld.y);
  }
  g.lineStyle(0);
  for (let i = 0; i < p.length; i += 2) g.beginFill(COLOR, 1).drawCircle(p[i], p[i + 1], 5).endFill();
}

function onDown(e) {
  if (!_trace) return;
  e.stopPropagation();                                    // capture phase → stops token drag-select
  const btn = e.button ?? 0;
  if (btn === 2) { finish(); return; }                    // right-click = finish
  const w = e.getLocalPosition(canvas.stage);
  const snap = canvas.grid.getSnappedPoint({ x: w.x, y: w.y }, { mode: CONST.GRID_SNAPPING_MODES.VERTEX });
  _trace.points.push(snap.x, snap.y);
  redraw();
}

function onMove(e) {
  if (!_trace) return;
  _trace.lastWorld = e.getLocalPosition(canvas.stage);
  redraw();
}

function onKey(ev) {
  if (!_trace) return;
  if (ev.key === "Enter") { ev.preventDefault(); finish(); }
  else if (ev.key === "Escape") { ev.preventDefault(); cancel(); }
  else if (ev.key === "Backspace") { ev.preventDefault(); _trace.points.splice(-2); redraw(); }
}

function teardown() {
  if (!_trace) return;
  try { canvas.stage.removeEventListener?.("pointerdown", onDown, { capture: true }); } catch (_) {}
  try { canvas.stage.off?.("pointermove", onMove); } catch (_) {}
  window.removeEventListener("keydown", onKey);
  try { _trace.graphics?.destroy?.(); } catch (_) {}
  _trace = null;
}

function cancel() { teardown(); ui.notifications?.info("A.T.L.A.S.: trace cancelled."); }

async function finish() {
  const pts = _trace ? [...(_trace.points)] : [];
  teardown();
  if (pts.length < 6) { ui.notifications?.warn("A.T.L.A.S.: a room needs at least 3 corners."); return; }
  const name = await promptRoomName();                // "" if left blank or dismissed (room still created)
  const label = await placeRoom(canvas.scene, pts, undefined, name);
  if (label) ui.notifications?.info(`A.T.L.A.S.: created room ${label}${name ? ` — ${name}` : ""}.`);
}

// ask for a player-facing room name; "" = unnamed (letter only)
async function promptRoomName() {
  try {
    const v = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Name this room" },
      content: `<p style="margin:0 0 6px">Name the room (players see this). Leave blank for just the letter.</p>`
        + `<input type="text" name="roomName" autofocus placeholder="e.g. Throne Room" style="width:100%">`,
      ok: { label: "Create room", callback: (_e, button) => (button.form.elements.roomName.value || "").trim() },
      rejectClose: false
    });
    return v ?? "";
  } catch (_) { return ""; }
}

export function startTrace() {
  if (!canvas?.ready) { ui.notifications?.warn("A.T.L.A.S.: no active canvas."); return; }
  if (!game.user?.isGM) return;
  teardownAll();
  const g = new PIXI.Graphics();
  (canvas.controls ?? canvas.stage).addChild(g);
  _trace = { points: [], graphics: g, lastWorld: null };
  canvas.stage.addEventListener?.("pointerdown", onDown, { capture: true });
  canvas.stage.on?.("pointermove", onMove);
  window.addEventListener("keydown", onKey);
  ui.notifications?.info("A.T.L.A.S.: click the room's corners · Enter / right-click = finish · Backspace = undo · Esc = cancel.");
}

// ---------- BOX mode: click-drag a rectangle room (fast) ----------
function redrawBox() {
  const g = _box?.graphics; if (!g) return;
  g.clear();
  if (!_box.startW || !_box.lastW) return;
  const x1 = Math.min(_box.startW.x, _box.lastW.x), y1 = Math.min(_box.startW.y, _box.lastW.y);
  const x2 = Math.max(_box.startW.x, _box.lastW.x), y2 = Math.max(_box.startW.y, _box.lastW.y);
  g.lineStyle(3, COLOR, 0.9).beginFill(COLOR, 0.1).drawRect(x1, y1, x2 - x1, y2 - y1).endFill();
}
function onBoxDown(e) {
  if (!_box) return;
  e.stopPropagation();
  if ((e.button ?? 0) === 2) { cancelBox(); return; }   // right-click cancels
  _box.startW = _box.lastW = snapW(e);
  _box.dragging = true;
  redrawBox();
}
function onBoxMove(e) {
  if (!_box?.dragging) return;
  _box.lastW = snapW(e);
  redrawBox();
}
async function onBoxUp(e) {
  if (!_box?.dragging) return;
  e.stopPropagation();
  const s = _box.startW, t = _box.lastW;
  teardownBox();
  if (!s || !t) return;
  const x1 = Math.min(s.x, t.x), y1 = Math.min(s.y, t.y);
  const w = Math.max(s.x, t.x) - x1, h = Math.max(s.y, t.y) - y1;
  if (w < 5 || h < 5) { ui.notifications?.warn("A.T.L.A.S.: box too small — drag a larger rectangle."); return; }
  const name = await promptRoomName();
  const label = await placeRoom(canvas.scene, rectPoints(x1, y1, w, h), undefined, name);
  if (label) ui.notifications?.info(`A.T.L.A.S.: created room ${label}${name ? ` — ${name}` : ""}.`);
}
function onBoxKey(ev) { if (_box && ev.key === "Escape") { ev.preventDefault(); cancelBox(); } }
function teardownBox() {
  if (!_box) return;
  try { canvas.stage.removeEventListener?.("pointerdown", onBoxDown, { capture: true }); } catch (_) {}
  try { canvas.stage.removeEventListener?.("pointerup", onBoxUp, { capture: true }); } catch (_) {}
  try { canvas.stage.off?.("pointermove", onBoxMove); } catch (_) {}
  window.removeEventListener("keydown", onBoxKey);
  try { _box.graphics?.destroy?.(); } catch (_) {}
  _box = null;
}
function cancelBox() { teardownBox(); ui.notifications?.info("A.T.L.A.S.: box cancelled."); }

export function startBox() {
  if (!canvas?.ready) { ui.notifications?.warn("A.T.L.A.S.: no active canvas."); return; }
  if (!game.user?.isGM) return;
  teardownAll();
  const g = new PIXI.Graphics();
  (canvas.controls ?? canvas.stage).addChild(g);
  _box = { graphics: g, startW: null, lastW: null, dragging: false };
  canvas.stage.addEventListener?.("pointerdown", onBoxDown, { capture: true });
  canvas.stage.addEventListener?.("pointerup", onBoxUp, { capture: true });
  canvas.stage.on?.("pointermove", onBoxMove);
  window.addEventListener("keydown", onBoxKey);
  ui.notifications?.info("A.T.L.A.S.: click-drag a rectangle room · Esc = cancel.");
}

// clean up an in-progress trace/box on scene change (registered from atlas.mjs setup)
export function initTrace() {
  Hooks.on("canvasReady", () => teardownAll());
}
