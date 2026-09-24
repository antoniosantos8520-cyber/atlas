// Atlas — how room labels LOOK. Two sliders drive it (settings.mjs):
//
//   OPACITY is per-client display only. It sets the resting alpha of a label's
//   mesh; hovering the ROOM (not the label) takes it to full. Nothing here ever
//   writes a document, so a player's view can differ from the GM's for free.
//
//   FONT SIZE is a document property: the label texture is drawn at that size and
//   the token's width/height in grid units are derived from the drawn pixel box.
//   Changing it therefore rewrites the marker tokens (rebuildLabels below).
//
// ⚠ rebuildLabels preserves each marker's CENTRE to the pixel. A label is put
//   where it reads best and stays there, so a resize that shifted the centre would
//   shuffle every name plate on the map the next time the size slider moved.
//
// A label is a NAME PLATE. An unnamed room has none at all, for anybody, at any
// time (targetAlpha below), and the LETTER lives in the room's data rather than on
// the map: the connection matrix shows it, and so does any host system's own node
// map. Lock no longer has anything to say about any of it.
import { CONFIG } from "./config.mjs";
import { labelOpacity, labelFontSize } from "./settings.mjs";
import { labelTokenData, labelSig } from "./marker.mjs";

let _hovered = null;      // the room label the cursor is currently over (from tooltip.mjs)
let _movable = false;     // is move mode running? (pushed in by move-area.mjs)
let _authoring = false;   // is the room panel open? (pushed in by room-panel.mjs)

/**
 * Move mode started or stopped. Labels answer the pointer only while it is on.
 *
 * ⚠ PUSHED IN rather than imported. move-area.mjs already reaches marker.mjs and hit.mjs, and
 *   hit.mjs reads isNamed from here, so importing move mode INTO this file would close a cycle.
 */
export function labelsMovable(on) {
  const next = !!on;
  if (next === _movable) return _movable;
  _movable = next;
  refreshLabels();
  return _movable;
}

/**
 * The room panel opened or closed. While it is open, EVERY room shows its letter, named or not.
 *
 * ⚠⚠ THIS IS THE AUTHORING VIEW, and it is per client and GM only by construction: the panel is
 *    GM only, and this state lives in one browser. A player never sees a letter appear because you
 *    opened a window. Without it the pair tools were unusable on a map of unnamed rooms: the readout
 *    names rooms by letter and the map showed none of them (user, 2026-09-24).
 */
export function labelsAuthoring(on) {
  const next = !!on;
  if (next === _authoring) return _authoring;
  _authoring = next;
  refreshLabels();
  return _authoring;
}

const markerOf = (doc) => doc?.flags?.[CONFIG.flagScope]?.areaMarker ?? null;

/** Has this room been given a name? The one definition, shared with hit.mjs's label pick. */
export const isNamed = (m) => !!(m?.name && String(m.name).trim());
const isLocked = (scene) => !!scene?.getFlag?.(CONFIG.flagScope, "areasLocked");

/**
 * The alpha this label should be wearing right now, or null if it isn't a label.
 *
 * ⚠ AN UNNAMED ROOM HAS NO LABEL AT PLAY (user, 2026-09-23: "anytime i draw a room and do not name
 *   it we do not need a lable box for it"). A battlemap traced into a dozen rooms should not be
 *   carpeted in letters nobody needs, and the letter is not lost: it still lives in the room's data.
 *
 * ⚠ UNLESS YOU ARE AUTHORING. With the room panel open the letters all come back, unnamed rooms
 *   included, because that is when you need them: Connect and Doorway name rooms by letter, and a
 *   map that shows none of them makes both tools guesswork (user, 2026-09-24). Close the panel and
 *   the map goes quiet again.
 *
 * ⚠ The letter used to double as the GM's grab handle for moving a room. It no longer needs to:
 *   move mode picks a room up from anywhere inside it, and clicking anywhere inside one points the
 *   panel at it. The token itself still exists and is still clickable, because this writes
 *   mesh.alpha rather than the token's own, so nothing structural depends on it being visible.
 *
 * ⚠ HOVER ONLY LIFTS A LABEL WHILE MOVE MODE IS ON (user, 2026-09-23: "when i am in a normal game
 *   those lables and hidden letters still highlight and it makes the map still seem cluttered").
 *   Brightening a name plate answers the question "which one am I about to grab", and outside move
 *   mode nobody is grabbing anything: it is just the map twitching as the cursor crosses it.
 */
export function targetAlpha(marker, { hovered = null, isGM = false, opacity = 1, blackout = false, movable = false, authoring = false } = {}) {
  if (!marker) return null;
  // ⚠ A hidden room has no label at the table, named or not, hovered or not. This is the FIRST
  //   test on purpose: every rule below it is about how prominent a label should be, and a blacked
  //   out room's label should not be there at all.
  if (blackout && !isGM) return 0;
  // ⚠ THE AUTHORING VIEW IS THE KEEPER'S ALONE. isGM is required as well as the flag, so that a
  //   future caller cannot hand this to a player's client by accident.
  const lettered = authoring && isGM;
  if (!isNamed(marker) && !lettered) return 0;
  return (movable && marker.label && marker.label === hovered) ? 1 : opacity;
}

function applyTo(token) {
  // refreshToken fires every frame for every token during movement, so bail on
  // the overwhelmingly common case before touching settings or the mesh.
  const marker = markerOf(token?.document);
  if (!marker || !token.mesh) return;
  const scene = token.document.parent;
  token.mesh.alpha = targetAlpha(marker, {
    hovered: _hovered,
    isGM: !!game.user?.isGM,
    opacity: labelOpacity(),
    movable: _movable,
    authoring: _authoring,
    blackout: !!scene?.flags?.[CONFIG.flagScope]?.areaData?.areas?.[marker.label]?.blackout
  });
  // ⚠ ⚠ AND THE BORDER FOUNDRY DRAWS FOR US. Token#_refreshState sets border.visible from
  //    `controlled || hover`, and it knows nothing about mesh.alpha, so an UNNAMED room's label,
  //    invisible in every other respect, still flashed a white box as the cursor crossed it. That
  //    is the "hidden letters" a Keeper sees twitching all over a busy map. Outside move mode a
  //    label is furniture and answers the pointer with nothing at all.
  if (token.border) token.border.visible = _movable && token.border.visible;
}

/** Re-apply resting/hover alpha to every label on the canvas. */
export function refreshLabels() {
  for (const t of canvas?.tokens?.placeables ?? []) {
    try { applyTo(t); } catch (_) { /* a token mid-draw: the next refresh catches it */ }
  }
}

/** tooltip.mjs calls this as the cursor crosses room boundaries. */
export function hoverArea(label) {
  if (label === _hovered) return;
  _hovered = label ?? null;
  refreshLabels();
}

/**
 * Redraw every marker token on `scene` for the current font size and lock state,
 * keeping each one centred exactly where it already sits. Self-limiting: a marker
 * already stamped with the current signature is skipped, so this is cheap to call
 * on every canvasReady and doubles as the migration for labels made before this.
 */
export async function rebuildLabels(scene) {
  scene = scene ?? canvas?.scene;
  if (!game.user?.isGM || !scene || !canvas?.ready) return;
  const scope = CONFIG.flagScope;
  const g = canvas.grid.size;
  const fs = labelFontSize();
  const locked = isLocked(scene);
  const sig = labelSig(fs, locked);
  const updates = [];

  for (const t of scene.tokens) {
    const m = markerOf(t);
    if (!m || m.sig === sig) continue;
    // the centre Redraw will anchor this room to, which must come out unchanged
    const cx = t.x + ((t.width || 1) * g) / 2;
    const cy = t.y + ((t.height || 1) * g) / 2;
    updates.push({
      _id: t.id,
      ...labelTokenData(m.label, m.name, { cx, cy, g, fs, locked }),
      [`flags.${scope}.areaMarker.sig`]: sig
    });
  }
  if (updates.length) {
    await scene.updateEmbeddedDocuments("Token", updates)
      .catch((e) => console.warn("Atlas | label rebuild failed", e));
  }
  refreshLabels();
}

export function installLabels() {
  // Foundry re-derives mesh alpha from the document on every mesh refresh, so we
  // re-assert ours after it (same ordering the sense-silhouette relies on).
  Hooks.on("refreshToken", (token) => { try { applyTo(token); } catch (_) {} });
  Hooks.on("drawToken", (token) => { try { applyTo(token); } catch (_) {} });
  // resize labels made at a different font size (also the pre-slider migration)
  Hooks.on("canvasReady", () => { rebuildLabels(canvas.scene); });
  // Locking the map is the "done building" signal: named labels shed their letter
  // (a GM-side texture rewrite that replicates) and unnamed ones wink out entirely
  // (per-client alpha, so every viewer needs the nudge, not just the GM).
  Hooks.on("updateScene", (scene, changes) => {
    if (scene?.id !== canvas?.scene?.id) return;
    if (!(CONFIG.flagScope in (changes?.flags ?? {}))) return;
    if (!("areasLocked" in changes.flags[CONFIG.flagScope])) return;
    rebuildLabels(scene);
    refreshLabels();
  });
}
