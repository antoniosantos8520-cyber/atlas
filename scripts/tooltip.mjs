// Atlas — the hover readout. Hover any room with a token SELECTED and its LABEL wears the
// range + LOS box (host ask 2026-09-02: the cursor-following tag was noise — the label already
// names the room, so nothing shows without a selection, and the info sits where the eye already
// is). Pure helpers (bucket) are unit-tested; the rest is canvas/DOM glue. No Foundry calls run
// at import (all inside functions).
import { CONFIG } from "./config.mjs";
import { areaAtPoint, tokenArea, distance, hasLOS } from "./los.mjs";
import { sightConnections } from "./data.mjs";
import { centroid } from "./marker.mjs";
import { hoverArea } from "./labels.mjs";

let _installed = false;
let _throttle = 0;
let _lastHover = null;
let _el = null;
let _hl = null;   // PIXI overlay that lifts + brightens the hovered room's outline

/**
 * Should this room refuse to answer the hover at all? PURE.
 *
 * The Keeper sees every room, hidden or not, because hiding one is their own doing. Everyone else
 * gets nothing: no highlight, no range, no sight verdict, no acknowledgement that a room is there.
 */
export function hoverHidden(area, isGM) {
  return !isGM && !!area?.blackout;
}

// distance → colour bucket (pure, tested)
export function bucket(dist) {
  if (dist < 0) return "none";
  if (dist === 0) return "same";
  if (dist <= 2) return "close";
  if (dist <= 4) return "mid";
  return "far";
}

/**
 * The readout itself: range as "R2", sight as a Font Awesome eye. Open + green is
 * clear, crossed + red is blocked. Two glyphs instead of "Range 2 · No LOS", which
 * is the same information in a third of the width.
 *
 * An unreachable room keeps the SAME two slots (R∞ and a shut eye) rather than
 * collapsing to a different shape, so the box never resizes as you sweep the map.
 * PURE.
 */
export function readout(dist, los) {
  const eye = (open) => `<i class="fa-solid fa-eye${open ? "" : "-slash"} atlas-los-${open ? "yes" : "no"}"></i>`;
  return dist < 0
    ? `<span class="atlas-tt-r">R∞</span>${eye(false)}`
    : `<span class="atlas-tt-r">R${dist}</span>${eye(!!los)}`;
}

function peekAreaData() {
  const raw = canvas?.scene?.getFlag(CONFIG.flagScope, "areaData");
  return (raw && raw.areas && Object.keys(raw.areas).length) ? raw : null;
}

function removeTooltip() { if (_el) { _el.remove(); _el = null; } }

// lift + bump the hovered room's outline: an offset shadow line, then a brighter, thicker line on top
function highlightArea(points) {
  if (!_hl) return;
  _hl.clear();
  if (!Array.isArray(points) || points.length < 6) return;
  const off = 5;
  const shadow = points.map(v => v + off);                 // offset down-right → reads as "lifted"
  _hl.lineStyle(5, 0x000000, 0.35); _hl.drawPolygon(shadow);
  _hl.lineStyle(4, 0xffd54a, 0.95); _hl.drawPolygon(points);   // bumped, bright amber outline
}
function clearHighlight() { if (_hl) _hl.clear(); }
function resetHover() { _lastHover = null; removeTooltip(); clearHighlight(); hoverArea(null); }

// The hovered room's LABEL anchor in screen pixels: the marker token's top-center (its texture IS
// the label box), the shape centroid when the marker is missing. Null hides the readout.
function labelScreenPoint(label, data) {
  const scope = CONFIG.flagScope;
  const doc = canvas.scene?.tokens?.find?.(t => t.flags?.[scope]?.areaMarker?.label === label);
  const tok = doc ? canvas.tokens?.get(doc.id) : null;
  let wx, wy;
  if (tok) { wx = tok.center?.x ?? tok.x; wy = tok.y; }
  else {
    const shape = data?.areas?.[label]?.shape;
    if (!Array.isArray(shape) || shape.length < 6) return null;
    ({ x: wx, y: wy } = centroid(shape));
  }
  const wt = canvas.stage.worldTransform;
  return { x: wt.a * wx + wt.c * wy + wt.tx, y: wt.b * wx + wt.d * wy + wt.ty };
}

function placeTooltip(label, data) {
  if (!_el) return;
  const p = labelScreenPoint(label, data);
  if (!p) return removeTooltip();
  _el.style.left = `${p.x}px`;
  _el.style.top = `${p.y}px`;
}

// The readout floats over the room's LABEL (never the cursor). No letter/name inside: the label
// under it already says who the room is.
function showTooltip(label, text, distClass, data) {
  removeTooltip();
  const el = document.createElement("div");
  el.id = "atlas-tooltip";
  el.className = `atlas-dist-${distClass}`;
  el.innerHTML = `<span>${text}</span>`;
  document.body.appendChild(el);
  _el = el;
  placeTooltip(label, data);
}

function onPointerMove(event) {
  const now = Date.now();
  if (now - _throttle < 80) return;          // throttle
  _throttle = now;

  const data = peekAreaData();
  if (!data) { if (_lastHover) resetHover(); return; }   // SELF-GATE

  const global = event.global ?? event.data?.global;
  if (!global) return;
  const sx = global.x, sy = global.y;

  // only when the cursor is over the board (not a sheet/sidebar/dialog)
  const overEl = document.elementFromPoint(sx, sy);
  if (!overEl || !overEl.closest("#board")) { if (_lastHover) resetHover(); return; }

  const world = event.getLocalPosition ? event.getLocalPosition(canvas.stage) : event.data.getLocalPosition(canvas.stage);
  const hovered = areaAtPoint(world.x, world.y, data.areas);
  // ⚠⚠ A HIDDEN ROOM IS HIDDEN HERE TOO. This file runs for EVERY client, and it draws its own
  //    highlight from the room's raw shape onto canvas.controls, which is nothing to do with the
  //    outline Drawing that blackout.mjs fades out. Without this test a player sweeping the cursor
  //    over apparently blank floor got the secret room's exact polygon in bright amber, with no
  //    token selected and nothing to click. Blackout's whole purpose leaked through the hover.
  // ⚠ Folded into the existing bail so the highlight and the readout die together: everything
  //   below is downstream of a hovered room, and a separate early return would strand the last one.
  if (!hovered || hoverHidden(data.areas[hovered], game.user?.isGM)) {
    if (_lastHover) resetHover();
    return;
  }
  if (hovered === _lastHover) {              // same room → keep the readout, re-pin it to the label
    placeTooltip(hovered, data);             // (a right-drag pan moves the label under a live readout)
    return;
  }
  _lastHover = hovered;
  hoverArea(hovered);                        // this room's LABEL comes up to full opacity
  highlightArea(data.areas[hovered]?.shape); // lift + brighten this room's outline

  const ctrl = canvas.tokens.controlled[0];
  if (!ctrl) { removeTooltip(); return; }    // nothing selected → highlight only; the label already names the room
  const myArea = tokenArea(ctrl.center.x, ctrl.center.y, data.areas);         // your token is always in an area
  if (!myArea || myArea === hovered) { removeTooltip(); return; }   // your own room → highlight only

  const dist = distance(data.connections || [], myArea, hovered);
  const los = hasLOS(sightConnections(data), myArea, hovered, data.areas);   // ⚠ SIGHT graph
  showTooltip(hovered, readout(dist, los), bucket(dist), data);
}

export function installTooltip() {
  if (_installed) return;
  _installed = true;

  const bind = () => {
    _lastHover = null; removeTooltip();
    try { _hl?.destroy?.(); } catch (_) {}
    _hl = new PIXI.Graphics();
    (canvas.controls ?? canvas.stage).addChild(_hl);
    canvas.stage.off("pointermove", onPointerMove);
    canvas.stage.off("pointerleave", resetHover);
    canvas.stage.on("pointermove", onPointerMove);
    canvas.stage.on("pointerleave", resetHover);
  };
  Hooks.on("canvasReady", bind);
  if (canvas?.ready) bind();                  // in case the canvas is already up when we install
  Hooks.on("controlToken", () => resetHover());
}
