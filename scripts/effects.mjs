// Atlas — area-effect glue: lay/remove GM effects on a room (the flag write + the room retint).
// Effects STACK (web + fire + smoke together, lay order). The pure transforms are data.layEffect /
// removeEffect; definitions live in CONFIG.areaEffects (label/icon/tint/LOS-writes). Any game MECHANICS
// (movement costs, damage, blinding) are the host system's business, keyed by effect id.
// GM-only writes; every write fires updateScene, so the fog runtime + editor refresh themselves for free.
import { CONFIG } from "./config.mjs";
import { overlayStyle, blackoutStyle } from "./settings.mjs";
import { readAreaData, writeAreaData, layEffect, removeEffect, stackTint, isBlackedOut } from "./data.mjs";

// retint a room's outline drawing (tint = null → the colour/opacity settings). Cosmetic + persisted
// (a Drawing document), so every player sees the webbed / burning / smoky room.
export async function tintRoom(scene, label, tint) {
  scene = scene ?? canvas.scene;
  const d = scene.drawings.find(dr => dr.flags?.[CONFIG.flagScope]?.areaRoom === label);
  if (!d) return;
  // ⚠ BLACKOUT WINS over any effect tint. A hidden room that is also on fire is still hidden, and
  //   showing it in the fire colour would say the opposite.
  await d.update(isBlackedOut(readAreaData(scene), label) ? blackoutStyle() : overlayStyle(tint));
}

// Re-style every room outline on the scene from the CURRENT settings: a clean room takes the
// colour picker, a dressed one keeps its top effect's tint. Called when either overlay setting
// moves. GM-only; the Drawing updates replicate to everyone.
export async function restyleOutlines(scene) {
  scene = scene ?? canvas.scene;
  if (!game.user?.isGM || !scene) return;
  const scope = CONFIG.flagScope;
  const data = readAreaData(scene);
  const updates = [];
  for (const d of scene.drawings) {
    const label = d.flags?.[scope]?.areaRoom;
    if (!label) continue;
    updates.push({ _id: d.id, ...(data.areas?.[label]?.blackout
      ? blackoutStyle()
      : overlayStyle(stackTint(data.areas?.[label]?.effects, CONFIG.areaEffects))) });
  }
  if (updates.length) {
    await scene.updateEmbeddedDocuments("Drawing", updates)
      .catch((e) => console.warn("Atlas | overlay restyle failed", e));
  }
}

// retint from the CURRENT stack (most recently laid effect's tint wins; empty → stock)
export async function retintFromData(scene, label, data) {
  await tintRoom(scene, label, stackTint(data.areas?.[label]?.effects, CONFIG.areaEffects));
}

// Lay an effect onto an area's stack: ONE flag write (the effect + its LOS-writes together) + the retint.
// `effect` = an id string or { id, ...state }. Returns true when it landed.
export async function applyAreaEffect(scene, label, effect) {
  scene = scene ?? canvas.scene;
  if (!game.user?.isGM) { ui.notifications?.warn("Atlas: area effects are GM-only."); return false; }
  const eff = typeof effect === "string" ? { id: effect } : effect;
  const def = CONFIG.areaEffects?.[eff?.id];
  const data = readAreaData(scene);
  if (!def || !data.areas?.[label]) {
    ui.notifications?.warn(`Atlas: unknown area "${label}" or effect "${eff?.id ?? effect}".`);
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
  if (!game.user?.isGM) { ui.notifications?.warn("Atlas: area effects are GM-only."); return false; }
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
