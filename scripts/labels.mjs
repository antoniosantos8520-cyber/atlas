// A.T.L.A.S. — how room labels LOOK. Two sliders drive it (settings.mjs):
//
//   OPACITY is per-client display only. It sets the resting alpha of a label's
//   mesh; hovering the ROOM (not the label) takes it to full. Nothing here ever
//   writes a document, so a player's view can differ from the GM's for free.
//
//   FONT SIZE is a document property: the label texture is drawn at that size and
//   the token's width/height in grid units are derived from the drawn pixel box.
//   Changing it therefore rewrites the marker tokens (rebuildLabels below).
//
// ⚠ rebuildLabels preserves each marker's CENTRE to the pixel. Redraw anchors a
//   room's polygon to its marker centre (marker.mjs redrawAreas), so a resize
//   that shifted the centre would drag every zone on the next Redraw.
//
// The LETTER is authoring plumbing, and lock is the "done building" signal. While
// unlocked the GM sees every letter, since a label is a room's only grab handle.
// Once locked, named rooms shed the letter and keep the name, unnamed rooms show
// nothing at all, and players never saw a bare letter in the first place. The
// connection matrix is where letters live permanently.
import { CONFIG } from "./config.mjs";
import { labelOpacity, labelFontSize } from "./settings.mjs";
import { labelTokenData, labelSig } from "./marker.mjs";

let _hovered = null;      // the room label the cursor is currently over (from tooltip.mjs)

const markerOf = (doc) => doc?.flags?.[CONFIG.flagScope]?.areaMarker ?? null;
const isNamed = (m) => !!(m?.name && String(m.name).trim());
const isLocked = (scene) => !!scene?.getFlag?.(CONFIG.flagScope, "areasLocked");

/**
 * The alpha this label should be wearing right now, or null if it isn't a label.
 *
 * An unnamed room is nothing BUT its letter, which is authoring plumbing: players
 * never see one, and once the map is locked nobody does. That costs the GM nothing,
 * because a locked marker cannot be grabbed anyway. Unlock and the letters return.
 */
export function targetAlpha(marker, { hovered = null, isGM = false, opacity = 1, locked = false } = {}) {
  if (!marker) return null;
  if (!isNamed(marker) && (locked || !isGM)) return 0;
  return marker.label && marker.label === hovered ? 1 : opacity;
}

function applyTo(token) {
  // refreshToken fires every frame for every token during movement, so bail on
  // the overwhelmingly common case before touching settings or the mesh.
  const marker = markerOf(token?.document);
  if (!marker || !token.mesh) return;
  token.mesh.alpha = targetAlpha(marker, {
    hovered: _hovered,
    isGM: !!game.user?.isGM,
    opacity: labelOpacity(),
    locked: isLocked(token.document.parent)
  });
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
      .catch((e) => console.warn("ATLAS | label rebuild failed", e));
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
