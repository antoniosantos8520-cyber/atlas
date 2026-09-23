// Atlas — the room control panel: ONE window that follows whichever room you are working on.
//
// The difference from the marker sheet is not cosmetic. The sheet is opened per room, STAGES its
// edits and commits them on Apply, and never repaints when the room changes underneath it. This
// panel stays open, RE-TARGETS to another room (B3 wires the left click), writes each click
// straight through, and listens for data changes so two surfaces can never disagree about what a
// room currently is.
//
// The card's body comes from ⚓ room-card.mjs, shared with the sheet, so there is one definition of
// what a room's controls look like. `staging: false` is what makes this surface write-through:
// no amber, no Apply, nothing to discard.
//
// ⚠ GM ONLY. Every control here writes a scene flag, which a player cannot do; a panel that drew
// buttons a player could press and then failed silently would be worse than no panel.
import { CONFIG } from "./config.mjs";
import {
  readAreaData, writeAreaData, setLOS, layEffect, removeEffect, sortLabels, setBlackout, isBlackedOut,
} from "./data.mjs";
import { renameArea, removeMarker, reshapeRoom, drawConnections } from "./marker.mjs";
import { setMoveMode, moveModeOn } from "./move-area.mjs";
import { setPairMode, pairModeOn, pairPick } from "./pair.mjs";
import { movementRestricted, setMovementRestricted } from "./settings.mjs";
import { startTrace, startBox } from "./trace.mjs";
import { retintFromData } from "./effects.mjs";
import { roomCardHTML, mapRowHTML, cardTarget, committedEffects, esc } from "./room-card.mjs";
import { areaAtPoint } from "./los.mjs";
import { creatureAt } from "./hit.mjs";
import { tracing } from "./trace.mjs";

let _app = null;
let _label = null;       // the room the panel is currently showing, null when it has none
// ⚠ ONE QUESTION LIVE AT A TIME. Two things can claim your next click on the map: a PAIR MODE
//   (connect or doorway, both in pair.mjs, both sticky) and move mode. Each turns the other off as
//   it starts, because a GM who has armed two of them has no way to know which one their click just
//   answered. Pair mode holds a single slot, so connect and doorway cannot both be live either.
let _reshape = null;     // the room the next drawn shape REPLACES, or null: draw a NEW room

/** The room the panel is on, for anything that needs to know (B3's retarget, tests). */
export function panelLabel() { return _label; }

/** Is the panel open on screen? A left click only retargets an OPEN panel; it never opens one. */
export function panelOpen() { return !!_app?.rendered; }

// What the panel should show, given a scene and the label it is holding. Falls back rather than
// showing nothing: a panel opened from a macro with no argument still lands somewhere useful.
export function resolveLabel(scene, want) {
  const data = readAreaData(scene);
  const labels = sortLabels(Object.keys(data.areas ?? {}));
  if (want && data.areas?.[want]) return want;
  return labels[0] ?? null;
}

function roomContext(scene, label) {
  if (!scene || !label) return null;
  const area = readAreaData(scene).areas?.[label];
  if (!area) return null;
  return { scene, label, area, name: area.name || "" };
}

// The panel's own empty state. NOT the card's placeholder, which exists to tell a GM poking at the
// hidden marker actor in the sidebar to leave it alone: wrong audience, wrong advice.
function emptyHTML(scene) {
  const traced = Object.keys(readAreaData(scene ?? canvas?.scene).areas ?? {}).length;
  // ⚠⚠ THE DRAW TOOLS COME WITH IT. This card used to say "trace a room first" and hand you no
  //    way to do it, so opening the panel from a macro on a fresh scene was a dead end (user,
  //    2026-09-23). Square and Line need no room to exist, and neither does the traffic rule.
  //    New/Redraw is a pair with nothing to redraw, and Connect needs two rooms, so both stay off.
  return `<div class="atlas-marker-card atlas-los-card">
    <div class="atlas-mc-empty">
      <i class="fa-solid fa-draw-polygon"></i>
      <h3>${traced ? "No room" : "Empty map"}</h3>
      <p>${traced
        ? "Click any room on the map to bring its controls here."
        : "Draw the first room with Square or Line, then click inside it to bring its controls here."}</p>
    </div>
    ${mapRowHTML({ label: null, draw: false, traffic: movementRestricted() })}
  </div>`;
}

function paint(content) {
  const scene = canvas?.scene;
  _label = resolveLabel(scene, _label);
  const ctx = roomContext(scene, _label);
  // A rename writes the scene flag, which repaints this panel out from under the very field being
  // typed in. Remember where the caret was and put it back, exactly as the editor panel does.
  const active = document.activeElement;
  const keep = active?.dataset?.atlasName && content.contains(active) ? active.selectionStart : null;

  content.innerHTML = ctx
    ? roomCardHTML(ctx, {
      defs: CONFIG.areaEffects, staging: false, rename: true,
      blackout: !!ctx.area.blackout,
      doorway: pairModeOn("doorway"),
      connect: pairModeOn("connect"),
      draw: _reshape === ctx.label,
      traffic: movementRestricted(),
      move: moveModeOn(),
      remove: true,
    })
    : emptyHTML(scene);

  if (!content._atlasPanelBound) {
    content._atlasPanelBound = true;
    content.addEventListener("click", (ev) => onPanelClick(ev));
    // `change` fires on blur AND on Enter, so a rename commits once rather than per keystroke
    content.addEventListener("change", (ev) => onPanelChange(ev));
    content.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" && ev.target?.dataset?.atlasName) { ev.preventDefault(); ev.target.blur(); }
    });
  }

  if (keep === null) return;
  const field = content.querySelector("[data-atlas-name]");
  if (!field) return;
  field.focus();
  try { field.setSelectionRange(keep, keep); } catch (_) { /* not a text input */ }
}

// WRITE-THROUGH. Each click is its own committed change, exactly like the editor panel's cells.
// ⚠ No Apply on this surface, so an apply hit is swallowed rather than acted on: the shared builder
//   cannot emit one in this mode, but a stale DOM between renders could still be clicked.
// ⚠ Every write fires updateScene, and the listener below repaints. Nothing calls render() here, or
//   the panel would paint twice for one click.
async function onPanelClick(ev) {
  const hit = cardTarget(ev.target);
  if (!hit || hit.kind === "apply") return;
  ev.preventDefault();
  const scene = canvas?.scene;
  const label = _label;
  if (!game.user?.isGM || !scene) return;

  // ⚠ TWO CONTROLS NEED NO ROOM, and they are handled before the room is demanded: the traffic
  //   rule is the world's, and Square and Line are how you get your FIRST room. Everything below
  //   this line acts on a room and bails without one.
  if (hit.kind === "traffic") {
    // ⚠ Nothing repaints here: the setting's own onChange does it, so the GM who flipped it and
    //   the GM watching from the other end both see the same switch.
    await setMovementRestricted(!movementRestricted());
    return;
  }

  if (hit.kind === "draw" && (hit.how === "square" || hit.how === "line")) {
    // ⚠⚠ TWO MODAL TOOLS CANNOT BOTH OWN THE DRAG. Move mode captures every press inside a room
    //    and the draw tools capture every press full stop, so with both live the first corner of a
    //    trace would also pick a room up. Connect would eat the same presses. Drawing wins, and
    //    both buttons go out to say so.
    setMoveMode(false);
    setPairMode(null);
    // ⚠⚠ THE ARM IS SPENT THE MOMENT THE TOOL STARTS, and the room it named is captured here
    //    rather than read when the drawing finishes. Tracing a room takes as long as it takes, and
    //    the panel re-points itself when you click the map, so a target read at the end would be
    //    whichever room the GM happened to be looking at by then. That is the kind of bug that
    //    eats the wrong room's outline.
    // ⚠ THE SCENE IS CAPTURED BESIDE THE ROOM, for the same reason the room is. A letter means
    //   a different room on a different map, so reading canvas.scene when the shape lands would
    //   reshape whatever room happens to wear that letter wherever the GM has got to by then.
    //   trace.mjs already drops an unfinished drawing on canvasReady, so this is the belt to that
    //   brace rather than the only guard.
    const target = _reshape;
    const onScene = scene;
    _reshape = null;
    _app?.render();
    const onShape = target
      ? async (points) => {
        if (canvas?.scene?.id !== onScene.id) return;   // another map now: the redraw is abandoned
        if (await reshapeRoom(onScene, target, points)) {
          ui.notifications?.info(`Atlas: room ${target} redrawn.`);
        }
      }
      : null;
    if (hit.how === "square") startBox({ onShape });
    else startTrace({ onShape });
    return;
  }

  if (!label) return;
  let data = readAreaData(scene);
  const area = data.areas?.[label];
  if (!area) return;

  if (hit.kind === "delete") {
    const shown = area.name ? `${label} (${area.name})` : `room ${label}`;
    const ok = await foundry.applications?.api?.DialogV2?.confirm({
      window: { title: "Atlas — Delete room" },
      content: `<p>Delete <b>${esc(shown)}</b>?</p>
        <p>Its outline, its label, every connection to it and any doorway on those connections go with
        it. The letter <b>${esc(label)}</b> becomes free for the next room you trace.</p>`,
      yes: { label: "Delete", icon: "fa-solid fa-trash-can" },
      no: { label: "Keep" },
    });
    if (!ok) return;                                    // "No" is core's default button, deliberately
    await removeMarker(scene, label);
    // ⚠⚠ EVERY POINTER AT THIS ROOM DIES WITH IT. A pick left holding a deleted letter writes a
    //    connection to a room that is not there, which stays invisible until the letter is handed
    //    to the next room traced and a line nobody drew appears between them. A pending redraw
    //    left behind simply fails. Both are silent, because the card is showing a different room.
    _reshape = null;
    setPairMode(null);
    _label = null;                                      // it is gone: fall back to whatever remains
    const next = resolveLabel(scene, null);
    _label = next;
    _app?.render({ window: { title: titleFor(next) } });
    return;
  }

  if (hit.kind === "move") {
    const want = !moveModeOn();
    // ⚠⚠ MOVE MODE EATS THE CLICK THAT ANSWERS A QUESTION. Its pointerdown captures on the
    //    stage and stops the press dead for anything inside a room, so the panel's own picker never
    //    hears it: an armed doorway or a live Connect would simply stop working, with the card
    //    still saying "click a room" and the map doing nothing.
    if (want) setPairMode(null);
    setMoveMode(want);
    _app?.render();
    return;
  }

  // the two halves of the draw pair that DO need a room; square and line ran above
  if (hit.kind === "draw") {
    if (hit.how === "redraw") { _reshape = _reshape === label ? null : label; _app?.render(); return; }
    if (hit.how === "new") { _reshape = null; _app?.render(); return; }
    return;
  }

  // ⚠ IDENTICAL GESTURES, one implementation (user, 2026-09-23: "make the doorway tool work the
  //   same as the connection tool ... easier to do several doors in one go"). Pressing the live one
  //   stops it; pressing the other switches which question the map is asking.
  if (hit.kind === "connect" || hit.kind === "doorway") {
    const want = pairModeOn(hit.kind) ? null : hit.kind;
    if (want) setMoveMode(false);                       // two modes cannot both own the drag
    setPairMode(want, label);                           // seeded with this room, so pair one is one click
    _app?.render();
    return;
  }

  if (hit.kind === "blackout") {
    // ⚠ retint AFTER the write, so the outline picks up the hatch (or loses it) in the same beat.
    //   Every client's own blackout.mjs then decides whether to paint it at all.
    data = setBlackout(data, label, !isBlackedOut(data, label));
    await writeAreaData(scene, data);
    await retintFromData(scene, label, data);
    // ⚠ AND REBUILD THE LINES. Not because they moved, but because a line drawn before this
    //   version carries no record of which rooms it joins, and blackout.mjs cannot hide what it
    //   cannot identify. Rebuilding here means a scene made on an older build repairs itself the
    //   first time a room is hidden, which is exactly when it matters.
    await drawConnections(scene);
    return;
  }

  if (hit.kind === "los") {
    data = setLOS(data, label, hit.field, !(area[hit.field] !== false));
    await writeAreaData(scene, data);
    return;
  }

  // effects STACK, so a click toggles ONE of them; the None chip clears the lot
  const laid = committedEffects(area);
  if (hit.id === null) {
    if (!laid.size) return;                                  // nothing to clear, so no write
    for (const id of laid) data = removeEffect(data, label, id);
  } else {
    data = laid.has(hit.id)
      ? removeEffect(data, label, hit.id)
      : layEffect(data, label, hit.id, CONFIG.areaEffects);
  }
  await writeAreaData(scene, data);
  await retintFromData(scene, label, data);
}

// ⚠ The label comes from the FIELD, not from _label, so a repaint that retargeted mid-edit can
//   never write the draft onto a different room.
async function onPanelChange(ev) {
  const field = ev.target?.closest?.("[data-atlas-name]");
  if (!field || !game.user?.isGM) return;
  const scene = canvas?.scene;
  if (!scene) return;
  await renameArea(scene, field.dataset.atlasName, field.value);
}

function PanelApp() {
  const { ApplicationV2 } = foundry.applications.api;
  return class AtlasRoomPanel extends ApplicationV2 {
    static DEFAULT_OPTIONS = {
      id: "atlas-room-panel",
      classes: ["atlas-room-panel"],
      window: { title: "Atlas — Room", icon: "fa-solid fa-draw-polygon", resizable: true },
      position: { width: 400, height: "auto" }
    };
    async _renderHTML() { return ""; }
    _replaceHTML(_result, content) { paint(content); }

    // ⚠ A MODE MUST NOT OUTLIVE THE WINDOW THAT TURNS IT ON. Closing the panel with move mode
    //   running would leave every drag inside a room hijacked, with nothing on screen lit to say
    //   why or any way back except guessing at Escape. Same for a half-placed doorway.
    _onClose(options) {
      setMoveMode(false);
      setPairMode(null);
      _reshape = null;
      return super._onClose?.(options);
    }
  };
}

/** The window title for a room, so the taskbar says which one you are on. */
function titleFor(label) {
  if (!label) return "Atlas — Room";
  const area = readAreaData(canvas?.scene).areas?.[label];
  const name = area?.name ? ` · ${area.name}` : "";
  return `Room ${label}${name}`;
}

/** Give up on everything that is waiting for your next click. */
export function cancelArming() {
  if (_reshape === null && !pairModeOn()) return;
  _reshape = null;
  setPairMode(null);
  if (panelOpen()) _app.render();
}

/**
 * Point the panel at a room. Does nothing when the panel is closed: a left click on the map should
 * never conjure a window the GM did not ask for.
 *
 * ⚠ While a pair mode is live this does NOT retarget: the click is one half of a pair, whether
 *   that is two rooms to join or the two sides of a doorway.
 *
 * ⚠ The title is passed to render() rather than set on the instance, because ApplicationV2 reads
 *   its window title when the frame is built and not on every repaint.
 */
export function retargetPanel(label) {
  if (!panelOpen() || !label) return;
  if (pairModeOn()) { pairPick(label); return; }
  if (label === _label) return;
  // ⚠⚠ AN ARMED REDRAW DIES WITH THE ROOM IT NAMED. It is shown on that room's card, so a panel
  //    that moved on while it was still held would draw the pair back at New and then, on the next
  //    press of Square, quietly eat the outline of a room the GM had stopped looking at.
  _reshape = null;
  _label = label;
  _app.render({ window: { title: titleFor(label) } });
}

/**
 * Repaint the panel from outside.
 *
 * ⚠ The traffic switch reads a WORLD SETTING, not a scene flag, so the updateScene listener that
 *   keeps every other control honest never hears about it. This is wired to that setting's own
 *   onChange, which fires for the GM who flipped it and for anyone watching.
 */
export function refreshRoomPanel() {
  if (panelOpen()) _app.render({ window: { title: titleFor(_label) } });
}

/** Open the panel, optionally straight onto a room. GM only. */
export function openRoomPanel(label = null) {
  if (!game.user?.isGM) { ui.notifications?.warn("Atlas is GM-only."); return; }
  const next = resolveLabel(canvas?.scene, label ?? _label);
  if (next !== _label) _reshape = null;               // same reason as retargetPanel: the arm names a room
  _label = next;
  _app = _app ?? new (PanelApp())();
  _app.render(true, { window: { title: titleFor(_label) } });
}

// A click anywhere INSIDE a room points the panel at it, not just a click on the label. Passive:
// it reads the event and never consumes it, so selection, dragging, panning and the drawing tools
// all behave exactly as before.
//
// ⚠ A PAN ENDS IN A POINTERUP TOO. Without a distance check, dragging the map across a room would
//   retarget on release. 8px is the threshold, a little above core's own 5px double-click slop.
// ⚠ STRICT point-in-polygon: a click in the gap between two rooms means no room, and the panel
//   stays where it is rather than guessing at the nearest.
// ⚠ Raw flag read, no clone: this runs on every click on the canvas.
const PICK_SLOP_PX = 8;

// A DOUBLE click anywhere inside a room OPENS the panel on that room, not just a double click on
// its label (user, 2026-09-23). The label was the only way in while it was the room's grab handle;
// it is not that any more, and an unnamed room has no label to aim at in the first place.
//
// ⚠⚠ A CREATURE COMES FIRST. A double click that lands on a token is that token's: its sheet
//    opens and the panel stays where it is. Rooms cover the whole battlemap, so without this every
//    double click meant for an actor would also throw a window at the GM ("so were not accidentaly
//    opening stuff we don't want to be").
// ⚠ TOKEN LAYER ONLY. On the walls, lighting or drawings layers a double click already means
//   something, and a room outline IS a Drawing, so two windows would open at once.
// ⚠ We detect the double click ourselves, on core's own numbers, because core reports one only
//   to the placeable under it or to the active LAYER, and a room is neither.
const DBL_MS = 250;      // MouseInteractionManager.DOUBLE_CLICK_TIME_MS
const DBL_PX = 5;        // MouseInteractionManager.DOUBLE_CLICK_DISTANCE_PX

let _down = null;        // where the last left press landed, for the pan check
let _last = null;        // { t, x, y } of the press before this one, for the double-click test

function onPickDown(e) {
  _down = (e.button ?? 0) === 0 ? { x: e.global?.x ?? 0, y: e.global?.y ?? 0 } : null;
}

function onPickUp(e) {
  const from = _down;
  _down = null;
  if (!from || !panelOpen() || !game.user?.isGM || tracing()) return;
  const dx = (e.global?.x ?? 0) - from.x;
  const dy = (e.global?.y ?? 0) - from.y;
  if ((dx * dx) + (dy * dy) > PICK_SLOP_PX * PICK_SLOP_PX) return;
  const w = e.getLocalPosition?.(canvas.stage);
  const areas = canvas?.scene?.flags?.[CONFIG.flagScope]?.areaData?.areas;
  if (!w || !areas) return;
  const label = areaAtPoint(w.x, w.y, areas);
  if (label) retargetPanel(label);
}

function onOpenDown(e) {
  if ((e.button ?? 0) !== 0) return;
  const now = e.timeStamp ?? 0;
  const x = e.global?.x ?? 0, y = e.global?.y ?? 0;
  const prev = _last;
  _last = { t: now, x, y };
  if (!prev || (now - prev.t) > DBL_MS) return;
  if (Math.hypot(x - prev.x, y - prev.y) > DBL_PX) return;
  _last = null;                               // a third press starts again, exactly as in core
  if (!game.user?.isGM || !canvas?.tokens?.active || tracing()) return;
  if (pairModeOn()) return;                     // a question is live: the click is its answer
  const w = e.getLocalPosition?.(canvas.stage);
  if (!w || creatureAt(w.x, w.y)) return;
  const areas = canvas?.scene?.flags?.[CONFIG.flagScope]?.areaData?.areas;
  const label = areas ? areaAtPoint(w.x, w.y, areas) : null;
  if (label) openRoomPanel(label);
}

/**
 * Bind both canvas gestures to the stage, every time a scene draws.
 *
 * ⚠⚠ THE STAGE IS NOT REBUILT PER SCENE, and believing it was is what broke this. Foundry
 *    defines `canvas.stage` once per SESSION (board.mjs #createApplication, a non-writable
 *    property on the PIXI Application's own stage) and then, on every scene draw, calls
 *    `this.stage.removeAllListeners()` as the first line of #addListeners, two lines before it
 *    fires canvasReady. So the object survives and every listener on it is wiped.
 *
 *    Guarding on a marker set on the stage therefore does exactly the wrong thing: the marker
 *    survives with the object, the guard returns early, and nothing is ever bound again. Scene one
 *    works and every scene after it is dead, with no error anywhere. What that costs is every
 *    canvas gesture the panel has: click a room to point the panel at it, double click to open it,
 *    and the click that answers an armed doorway or a live Connect.
 *
 *    REMOVE THEN ADD, unconditionally, exactly as tooltip.mjs has always done for the same stage.
 *    Removing a listener that is not there is a no-op, so this is safe on the first scene too.
 * ⚠ The remove must carry the same `capture` flag as the add, or it matches nothing.
 */
function bindCanvas() {
  const stage = canvas?.stage;
  if (!stage) return;
  _down = null;
  _last = null;
  stage.removeEventListener?.("pointerdown", onPickDown);
  stage.removeEventListener?.("pointerup", onPickUp);
  stage.removeEventListener?.("pointerdown", onOpenDown, { capture: true });
  stage.addEventListener?.("pointerdown", onPickDown);
  stage.addEventListener?.("pointerup", onPickUp);
  // ⚠ CAPTURE, so this is asked before the token under the cursor is. PASSIVE all the same: the
  //   event is read and never consumed, so a creature's own double click still opens its sheet.
  stage.addEventListener?.("pointerdown", onOpenDown, { capture: true });
}

// A click anywhere INSIDE a room points the panel at it, not just a click on the label. Passive:
// it reads the event and never consumes it, so selection, dragging, panning and the drawing tools
// all behave exactly as before.
//
// ⚠ A PAN ENDS IN A POINTERUP TOO. Without a distance check, dragging the map across a room would
//   retarget on release. 8px is the threshold, a little above core's own 5px double-click slop.
// ⚠ STRICT point-in-polygon: a click in the gap between two rooms means no room, and the panel
//   stays where it is rather than guessing at the nearest.
// ⚠ Raw flag read, no clone: this runs on every click on the canvas.
function installCanvasGestures() {
  Hooks.on("canvasReady", bindCanvas);
  if (canvas?.ready) bindCanvas();          // in case the canvas is already up when we install
}

export function installRoomPanel() {
  installCanvasGestures();

  // Escape gives up on everything waiting for your next click. Bound on the window rather than the
  // panel, because the click that answers any of them lands on the CANVAS and the panel never has
  // focus.
  window.addEventListener("keydown", (ev) => {
    // ⚠ NOT preventDefault'd when a drawing tool is up: Escape is that tool's cancel, and an
    //   armed redraw should die with the drawing it was going to become.
    if (ev.key !== "Escape") return;
    if (_reshape === null && !pairModeOn()) return;
    if (!tracing()) ev.preventDefault();
    cancelArming();
  });


  // ⚠ THE THING THE MARKER CARD NEVER HAD. A room can change from the editor, from the trace tool,
  //   from an effect laid by a host system, or from another GM. A surface that edits a room and does
  //   not watch it is how two surfaces come to disagree about what that room is.
  Hooks.on("updateScene", (scene, changes) => {
    if (!panelOpen() || scene?.id !== canvas?.scene?.id) return;
    const fk = changes?.flags;
    if (!fk || (!(CONFIG.flagScope in fk) && !(("-=" + CONFIG.flagScope) in fk))) return;
    _app.render({ window: { title: titleFor(_label) } });
  });

  // a new scene has its own rooms, and the label we were holding means nothing there
  Hooks.on("canvasReady", () => {
    _label = null;
    _reshape = null;                                    // another scene, another set of rooms
    setMoveMode(false);
    setPairMode(null);
    if (panelOpen()) _app.render({ window: { title: titleFor(null) } });
  });
}
