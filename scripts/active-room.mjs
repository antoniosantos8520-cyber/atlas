// Atlas — WHICH ROOM THE PANEL IS ON, drawn on the map.
//
// The room panel re-points itself on a click inside any room, and until now the only sign of where
// it had landed was a letter on the card and a word in the title bar. Every control on that card
// writes straight through, so "which room am I about to change" is the question the surface most
// needs to answer, and it was answering it in the corner of a window (user, 2026-09-24: "the active
// room make it highlight").
//
// ⚠ IT IS THE HOVER LIFT, the same one (user, 2026-09-24: "just use the already existing mouseover
//   outline"). The lift is DEFINED here and tooltip.mjs imports it, so the two cannot drift into
//   almost-the-same look. What differs is only how long it stays: the hover's follows the cursor
//   and clears the moment you leave a room, this one holds until the panel moves or closes.
//
// ⚠ PER CLIENT, and the GM's alone: the panel is GM only, so nothing here ever runs for a player.
//   Nothing is written to the scene, so a player's screen cannot pick it up even by accident.
import { CONFIG } from "./config.mjs";

const LIFT_OFFSET = 5;      // how far the shadow sits down and right, which is what reads as "lifted"
const LIFT_SHADOW = 0x000000;
const LIFT_EDGE = 0xffd54a;

let _g = null;              // the halo
let _label = null;          // the room it is drawn around, so a repaint of the same room is cheap

/** The polygon of a room, or null. PURE, and tolerant of every shape of missing. */
export function outlineOf(areas, label) {
  if (!label) return null;
  const shape = areas?.[label]?.shape;
  return (Array.isArray(shape) && shape.length >= 6) ? shape : null;
}

function layer() {
  return canvas?.controls ?? canvas?.stage ?? null;
}

function ensure() {
  if (_g && !_g.destroyed) return _g;
  const host = layer();
  if (!host) return null;
  _g = new PIXI.Graphics();
  // ⚠ Above the room outlines but below the cursor readout, which is a DOM node and always wins.
  host.addChild(_g);
  return _g;
}

/**
 * THE LIFT: an offset shadow with a bright edge on top, so a room reads as picked up off the map.
 *
 * ⚠ ONE DEFINITION, TWO USERS. tooltip.mjs draws it under the cursor and this file draws it around
 *   the room the panel is holding. Two copies of a look this specific would drift, and a reader
 *   would have no way to tell whether the difference was meant.
 *
 * @param {PIXI.Graphics} g       cleared by the caller, not here
 * @param {number[]} points       a flat polygon
 */
export function drawLift(g, points) {
  if (!g || !Array.isArray(points) || points.length < 6) return false;
  const shadow = points.map((v) => v + LIFT_OFFSET);       // down and right, so it reads as lifted
  g.lineStyle(5, LIFT_SHADOW, 0.35).drawPolygon(shadow);
  g.lineStyle(4, LIFT_EDGE, 0.95).drawPolygon(points);
  return true;
}

function paint(points) {
  const g = ensure();
  if (!g) return;
  g.clear();
  if (!points) return;
  drawLift(g, points);
}

/**
 * Draw the halo around `label`, or clear it with null.
 *
 * ⚠ Reads the RAW scene flag rather than a clone: this runs on every panel repaint, and a repaint
 *   happens on every scene-flag write.
 */
export function showActiveRoom(label = null) {
  if (!game.user?.isGM) return null;
  const areas = canvas?.scene?.flags?.[CONFIG.flagScope]?.areaData?.areas;
  const points = outlineOf(areas, label);
  _label = points ? label : null;
  paint(points);
  return _label;
}

/** The room the halo is on, for tests and for anything that needs to know. */
export function activeRoom() { return _label; }

/** Redraw from the current room, after its shape has changed under us. */
export function refreshActiveRoom() { return showActiveRoom(_label); }

export function installActiveRoom() {
  // ⚠⚠ The stage is ONE OBJECT PER SESSION but its CHILDREN are not: canvas.controls is rebuilt with
  //    each scene, taking our Graphics with it. Dropping the reference here means the next draw
  //    makes a fresh one on the new layer, rather than painting into an orphan nobody displays.
  Hooks.on("canvasReady", () => { _g = null; _label = null; });
}
