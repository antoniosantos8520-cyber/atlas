// A.T.L.A.S. — area-effect glue: lay/remove GM effects on a room (the flag write + the room retint).
// Effects STACK (web + fire + smoke together, lay order). The pure transforms are data.layEffect /
// removeEffect; definitions live in CONFIG.areaEffects (label/icon/tint/LOS-writes). Any game MECHANICS
// (movement costs, damage, blinding) are the host system's business, keyed by effect id.
// GM-only writes; every write fires updateScene, so the fog runtime + editor refresh themselves for free.
import { CONFIG } from "./config.mjs";
import { readAreaData, writeAreaData, layEffect, removeEffect, stackTint } from "./data.mjs";

// the stock room-outline colors (drawRoomOutline's defaults) — restored when the stack empties
const STOCK = { strokeColor: "#3d7bd0", strokeAlpha: 0.7, fillColor: "#3d7bd0", fillAlpha: 0.08 };

// retint a room's outline drawing (tint = null → stock colors). Cosmetic + persisted (a Drawing document),
// so every player sees the webbed / burning / smoky room.
export async function tintRoom(scene, label, tint) {
  scene = scene ?? canvas.scene;
  const d = scene.drawings.find(dr => dr.flags?.[CONFIG.flagScope]?.areaRoom === label);
  if (!d) return;
  await d.update(tint
    ? { strokeColor: tint, strokeAlpha: 0.9, fillColor: tint, fillAlpha: 0.15 }
    : { ...STOCK });
}

// retint from the CURRENT stack (most recently laid effect's tint wins; empty → stock)
export async function retintFromData(scene, label, data) {
  await tintRoom(scene, label, stackTint(data.areas?.[label]?.effects, CONFIG.areaEffects));
}

// Lay an effect onto an area's stack: ONE flag write (the effect + its LOS-writes together) + the retint.
// `effect` = an id string or { id, ...state }. Returns true when it landed.
export async function applyAreaEffect(scene, label, effect) {
  scene = scene ?? canvas.scene;
  if (!game.user?.isGM) { ui.notifications?.warn("A.T.L.A.S.: area effects are GM-only."); return false; }
  const eff = typeof effect === "string" ? { id: effect } : effect;
  const def = CONFIG.areaEffects?.[eff?.id];
  const data = readAreaData(scene);
  if (!def || !data.areas?.[label]) {
    ui.notifications?.warn(`A.T.L.A.S.: unknown area "${label}" or effect "${eff?.id ?? effect}".`);
    return false;
  }
  const next = layEffect(data, label, eff, CONFIG.areaEffects);
  await writeAreaData(scene, next);
  await retintFromData(scene, label, next);
  return true;
}

// Remove ONE effect by id (or ALL when id is null/omitted): the stack shrinks, the room retints to the
// remaining top effect (or stock). LOS stays EXACTLY as it stands — removing Web does not restore In/Out;
// the GM re-toggles by hand.
export async function removeAreaEffect(scene, label, id = null) {
  scene = scene ?? canvas.scene;
  if (!game.user?.isGM) { ui.notifications?.warn("A.T.L.A.S.: area effects are GM-only."); return false; }
  const data = readAreaData(scene);
  if (!data.areas?.[label]) return false;
  const next = removeEffect(data, label, id);
  await writeAreaData(scene, next);
  await retintFromData(scene, label, next);
  return true;
}

// The effects stacked on an area — [ { id, ...state }, ... ] in lay order ([] when the room is clean).
export function readAreaEffects(scene, label) {
  return readAreaData(scene ?? canvas.scene).areas?.[label]?.effects ?? [];
}
