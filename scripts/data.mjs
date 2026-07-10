// A.T.L.A.S. — the data layer. Per-SCENE area records live in scene flags under the configured scope.
//
// Split: the TRANSFORMS below are pure + immutable (return new data, never mutate) so they unit-test in
// Node; the Foundry I/O wrappers at the bottom are thin (read/write/clear scene flags, find live markers).
//
//   scene.flags.<scope>.areaData = {
//     areas: { "A": { label:"A", shape:[x0,y0,...], losIn:true, losOut:true, losThrough:true,
//                     effects:[ { id:"fire", ...state }, ... ] }, ... },   // GM-laid area EFFECTS, lay order,
//     connections: [ ["A","B"], ["B","C"] ]   // undirected, normalized pairs    they STACK (web + fire + smoke)
//   }

import { CONFIG } from "./config.mjs";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

// ---------------------------------------------------------------------------
// PURE TRANSFORMS (immutable)
// ---------------------------------------------------------------------------

export function emptyAreaData() {
  return { areas: {}, connections: [] };
}

export function defaultAreaRecord(label, shape = [], name = "") {
  return { label, name, shape: [...shape], losIn: true, losOut: true, losThrough: true };
}

// set a room's display name (the player-facing tag; the letter stays the internal handle)
export function setName(data, label, name) {
  if (!data.areas?.[label]) return data;
  return { ...data, areas: { ...data.areas, [label]: { ...data.areas[label], name: name ?? "" } } };
}

// next free letter, FILL-GAPS (delete B → the next one offered is B again). null when A–Z full.
export function nextLabel(data) {
  const placed = new Set(Object.keys(data?.areas ?? {}));
  return LETTERS.find(l => !placed.has(l)) ?? null;
}

// add or replace an area record
export function setArea(data, label, record) {
  return { ...data, areas: { ...data.areas, [label]: { ...record, label } } };
}

// remove an area AND any connection that referenced it
export function removeArea(data, label) {
  const areas = { ...data.areas };
  delete areas[label];
  const connections = (data.connections ?? []).filter(([a, b]) => a !== label && b !== label);
  return { ...data, areas, connections };
}

// normalized undirected pair (alphabetical)
export function normalizePair(a, b) {
  return [a, b].sort();
}

export function hasConnection(data, a, b) {
  const [x, y] = normalizePair(a, b);
  return (data.connections ?? []).some(([p, q]) => {
    const [s, t] = normalizePair(p, q);
    return s === x && t === y;
  });
}

// toggle a connection on/off (normalized, so B–A == A–B)
export function toggleConnection(data, a, b) {
  if (a === b) return data;
  const [x, y] = normalizePair(a, b);
  const before = data.connections ?? [];
  const connections = before.filter(([p, q]) => {
    const [s, t] = normalizePair(p, q);
    return !(s === x && t === y);
  });
  if (connections.length === before.length) connections.push([x, y]);   // wasn't present → add
  return { ...data, connections };
}

// set an explicit In/Out/Through boolean. ALWAYS store true/false — never delete the key
// (Foundry's setFlag merges and won't propagate a deletion, so a stale false would revert).
export function setLOS(data, label, field, value) {
  if (!data.areas?.[label]) return data;
  if (!["losIn", "losOut", "losThrough"].includes(field)) return data;
  return { ...data, areas: { ...data.areas, [label]: { ...data.areas[label], [field]: !!value } } };
}

// Add (or update-by-id) one EFFECT on an area's stack — `effect` is { id, ...state } (e.g. { id:"fire",
// count:3 }; the definition table CONFIG.areaEffects supplies label/icon/tint/LOS-writes by id). Effects
// STACK (web + fire + smoke together); re-laying an id replaces that entry (fresh state) at the stack's top.
export function addEffect(data, label, effect) {
  if (!data.areas?.[label] || !effect?.id) return data;
  const rest = (data.areas[label].effects ?? []).filter((e) => e?.id !== effect.id);
  return { ...data, areas: { ...data.areas, [label]: { ...data.areas[label], effects: [...rest, { ...effect }] } } };
}

// Remove ONE effect by id (or ALL when id is null/omitted). Arrays are merge-SAFE under setFlag (replaced
// wholesale, unlike object keys — the removeArea `-=` gotcha doesn't apply). LOS is left exactly as it
// stands: clearing Web does NOT restore In/Out — the GM re-toggles by hand (their ruling: full manual control).
export function removeEffect(data, label, id = null) {
  if (!data.areas?.[label]) return data;
  const effects = id == null ? [] : (data.areas[label].effects ?? []).filter((e) => e?.id !== id);
  return { ...data, areas: { ...data.areas, [label]: { ...data.areas[label], effects } } };
}

// Lay an effect on an area IN ONE PASS: stack { id, ...state } + apply the definition's LOS-writes (Web
// seals its room as it lands; Fire/Smoke carry none). `effect` may be a bare id string; `defs` = the
// effect-definition table (CONFIG.areaEffects — passed in so this stays pure). Unknown area/effect → the
// input unchanged. Removal stays removeEffect (never writes LOS).
export function layEffect(data, label, effect, defs = {}) {
  const eff = typeof effect === "string" ? { id: effect } : effect;
  const def = defs[eff?.id];
  if (!data.areas?.[label] || !def) return data;
  let next = addEffect(data, label, eff);
  for (const [field, value] of Object.entries(def.los ?? {})) next = setLOS(next, label, field, value);
  return next;
}

// The room's display tint under a stack: the MOST RECENTLY laid effect's tint wins; empty stack → null (stock).
export function stackTint(effects = [], defs = {}) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const t = defs[effects[i]?.id]?.tint;
    if (t) return t;
  }
  return null;
}

// set the polygon shape of an area
export function setShape(data, label, shape) {
  if (!data.areas?.[label]) return data;
  return { ...data, areas: { ...data.areas, [label]: { ...data.areas[label], shape: [...shape] } } };
}

// drop areas whose marker token is gone + strip dangling connections.
// `liveLabels` = the labels whose marker tokens still exist on the scene.
// returns { data, removed[] } (data is unchanged when there are no orphans).
export function sweepOrphans(data, liveLabels) {
  const live = new Set(liveLabels);
  const removed = Object.keys(data.areas ?? {}).filter(l => !live.has(l));
  if (removed.length === 0) return { data, removed };
  const orphan = new Set(removed);
  const areas = {};
  for (const [l, rec] of Object.entries(data.areas)) if (live.has(l)) areas[l] = rec;
  const connections = (data.connections ?? []).filter(([a, b]) => !orphan.has(a) && !orphan.has(b));
  return { data: { ...data, areas, connections }, removed };
}

// ---------------------------------------------------------------------------
// FOUNDRY I/O (thin; per-scene; not exercised by the Node tests)
// ---------------------------------------------------------------------------

export function readAreaData(scene) {
  const raw = scene?.getFlag?.(CONFIG.flagScope, "areaData");
  return raw ? foundry.utils.deepClone(raw) : emptyAreaData();
}

export async function writeAreaData(scene, data) {
  return scene.setFlag(CONFIG.flagScope, "areaData", data);
}

export async function clearAreaData(scene) {
  return scene.unsetFlag(CONFIG.flagScope, "areaData");
}

// the set of area labels whose marker tokens still exist on this scene
export function liveMarkerLabels(scene) {
  const scope = CONFIG.flagScope;
  const labels = new Set();
  for (const t of scene?.tokens ?? []) {
    const m = t.flags?.[scope]?.areaMarker;
    if (m?.label) labels.add(m.label);
  }
  return labels;
}
