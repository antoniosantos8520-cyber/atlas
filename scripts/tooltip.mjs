// A.T.L.A.S. — the hover readout. Hover any room and see, from YOUR selected token's room,
// the distance in rooms + whether you have line of sight. Pure helpers (bucket) are unit-tested;
// the rest is canvas/DOM glue. No Foundry calls run at import (all inside functions).
import { CONFIG } from "./config.mjs";
import { areaAtPoint, tokenArea, distance, hasLOS } from "./los.mjs";

let _installed = false;
let _throttle = 0;
let _lastHover = null;
let _el = null;
let _hl = null;   // PIXI overlay that lifts + brightens the hovered room's outline

// distance → colour bucket (pure, tested)
export function bucket(dist) {
  if (dist < 0) return "none";
  if (dist === 0) return "same";
  if (dist <= 2) return "close";
  if (dist <= 4) return "mid";
  return "far";
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
function resetHover() { _lastHover = null; removeTooltip(); clearHighlight(); }

function showTooltip(x, y, label, text, distClass) {
  removeTooltip();
  const el = document.createElement("div");
  el.id = "atlas-tooltip";
  el.className = `atlas-dist-${distClass}`;
  el.innerHTML = `<span class="atlas-tt-letter">${label}.</span>${text ? `<span>${text}</span>` : ""}`;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  document.body.appendChild(el);
  _el = el;
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
  if (!hovered) { if (_lastHover) resetHover(); return; }
  if (hovered === _lastHover) return;        // same room → keep the current readout + highlight
  _lastHover = hovered;
  highlightArea(data.areas[hovered]?.shape); // lift + brighten this room's outline

  const ctrl = canvas.tokens.controlled[0];
  if (!ctrl) { showTooltip(sx, sy, hovered, "", "none"); return; }            // nothing selected → just the letter
  const myArea = tokenArea(ctrl.center.x, ctrl.center.y, data.areas);         // your token is always in an area
  if (!myArea) { showTooltip(sx, sy, hovered, "", "none"); return; }
  if (myArea === hovered) { removeTooltip(); return; }   // your own room → highlight only, no "You are here" tooltip

  const dist = distance(data.connections || [], myArea, hovered);
  const los = hasLOS(data.connections || [], myArea, hovered, data.areas);
  // colour the LOS word by clear/blocked so "No LOS" reads red (green never falsely reads "all good")
  const text = dist < 0
    ? `<span class="atlas-los-no">No path</span>`
    : `Range ${dist} · ${los ? `<span class="atlas-los-yes">LOS</span>` : `<span class="atlas-los-no">No LOS</span>`}`;
  showTooltip(sx, sy, hovered, text, bucket(dist));
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
