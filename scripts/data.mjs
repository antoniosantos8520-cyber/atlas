// Atlas — the data layer. Per-SCENE area records live in scene flags under the configured scope.
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

// Labels run like spreadsheet columns: A..Z, then AA..AZ, BA.., ZZ, AAA.. There is no
// ceiling, so a big map never runs out of rooms.
export function labelAt(n) {
  let s = "";
  n = Math.max(0, Math.floor(n || 0));
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

// Sort labels the way they were HANDED OUT, not lexicographically: a plain .sort()
// files AA between A and B, which scrambles every rail and matrix on a big map.
export function compareLabels(a, b) {
  const x = String(a), y = String(b);
  return x.length - y.length || (x < y ? -1 : x > y ? 1 : 0);
}

export function sortLabels(labels) {
  return [...labels].sort(compareLabels);
}

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

// next free label, FILL-GAPS (delete B → the next one offered is B again). With N rooms
// placed, one of the first N+1 labels must be free, so this always terminates and never
// runs out.
export function nextLabel(data) {
  const placed = new Set(Object.keys(data?.areas ?? {}));
  for (let i = 0; i <= placed.size; i++) {
    const l = labelAt(i);
    if (!placed.has(l)) return l;
  }
  return null;                                    // unreachable by the pigeonhole above
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
  const out = { ...data, areas, connections };
  // a doorway on a connection that no longer exists would sit in the data forever, invisible
  if (data.doorways?.length) out.doorways = data.doorways.filter(([a, b]) => a !== label && b !== label);
  return out;
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
  if (connections.length === before.length) {
    connections.push([x, y]);                                          // wasn't present → add
    return { ...data, connections };
  }
  // ⚠ CUT: a doorway is a rule ON a connection, so it cannot outlive one. Left behind it would
  //   sit in the data forever, invisible (nothing draws a door on a line that is not there) and
  //   ready to block sight again the moment the two rooms were rejoined. removeArea already prunes
  //   for the same reason; this is the other way a connection can end.
  const out = { ...data, connections };
  if (data.doorways?.length) {
    out.doorways = data.doorways.filter(([p, q]) => {
      const [s, t] = normalizePair(p, q);
      return !(s === x && t === y);
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// DOORWAYS: a sight block on ONE connection
// ---------------------------------------------------------------------------
//
// A doorway is a rule on a single connection: sight cannot cross it, in EITHER direction. It does
// NOT disconnect the two rooms, so travel, hop distance and the movement rule are all untouched,
// and a token walking through never opens it. Turning one off is a deliberate editor change that
// may reveal actors to everyone with a sight route, so it is never a move-time action.
//
// ⚠ Stored in its OWN array beside `connections`, never as a third element on each pair, so every
//   scene traced before doorways existed reads correctly with nothing to migrate. Arrays replace
//   wholesale under a setFlag merge, which object keys do not.
// ⚠ PRESENT MEANS BLOCKED. There is no stored "open doorway", because an open door and no door are
//   the same thing to sight. Removing the entry IS turning it off.

export function hasDoorway(data, a, b) {
  const [x, y] = normalizePair(a, b);
  return (data?.doorways ?? []).some(([p, q]) => {
    const [s, t] = normalizePair(p, q);
    return s === x && t === y;
  });
}

export function toggleDoorway(data, a, b) {
  if (a === b) return data;
  const [x, y] = normalizePair(a, b);
  const before = data.doorways ?? [];
  const doorways = before.filter(([p, q]) => {
    const [s, t] = normalizePair(p, q);
    return !(s === x && t === y);
  });
  if (doorways.length === before.length) doorways.push([x, y]);   // wasn't there → add it, blocking
  return { ...data, doorways };
}

/**
 * The graph SIGHT travels on: every connection except the ones a doorway seals.
 *
 * ⚠⚠ TRAVEL, hop distance and the movement rule read `data.connections` and must NEVER read this.
 *    A doorway that started blocking movement would be the one thing it is specified not to do.
 */
export function sightConnections(data) {
  const doors = data?.doorways ?? [];
  const links = data?.connections ?? [];
  if (!doors.length) return links;
  const key = (a, b) => normalizePair(a, b).join("|");
  const blocked = new Set(doors.map(([a, b]) => key(a, b)));
  return links.filter(([a, b]) => !blocked.has(key(a, b)));
}

// ---------------------------------------------------------------------------
// BLACKOUT: a room that, as far as the table is concerned, is not there
// ---------------------------------------------------------------------------
//
// Hidden from players entirely: no outline, no label, nothing inside it seen, and sight neither
// enters it, leaves it, nor crosses it. Movement into it is refused whatever else is true, because
// it is a secret rather than a route.
//
// ⚠ It does NOT write losIn/losOut/losThrough. The GM's own switches are left exactly as they were,
//   so lifting a blackout restores the room to what it was, not to a default.

export function setBlackout(data, label, on) {
  if (!data.areas?.[label]) return data;
  return { ...data, areas: { ...data.areas, [label]: { ...data.areas[label], blackout: !!on } } };
}

export function isBlackedOut(data, label) { return !!data?.areas?.[label]?.blackout; }

/** Is any room on this map blacked out? The movement gate's cheap way to stay out of the way. */
export function anyBlackout(data) {
  return Object.values(data?.areas ?? {}).some((a) => a?.blackout);
}

/** Movement INTO a blacked-out room is refused, independent of the connection rule. */
export function blackoutRefuses(data, from, to) {
  return !!to && to !== from && isBlackedOut(data, to);
}

// Is a single move from one room to another allowed by the map?
//
// ONE HOP, judged on the ENDPOINTS: where a move starts and where it ends must be the
// same room, or two rooms the map joins. A drag from A to C is refused even when it
// physically sweeps across B, because reaching C is two moves.
//
// Endpoints rather than the path travelled, deliberately. Foundry only hands a gate the
// intermediate steps of a move on a GRIDDED scene; on a gridless one it hands over the
// two ends and nothing else. Rooms are traced by hand over a map image, and those scenes
// are usually gridless, so judging the path would quietly mean one thing on one map and
// something else on the next.
//
// A null end is a token in no room at all: in a gap between polygons, or off the traced
// part of the map. That is not the map refusing, so it passes. This never invents a room
// a token was not in. Callers self-gate on a scene with no areas before asking.
export function stepLegal(data, from, to) {
  if (from == null || to == null) return true;
  if (from === to) return true;
  return hasConnection(data, from, to);
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
/** Slide a polygon by a delta. Flat [x,y,x,y,...], the same shape every room is stored in. */
export function translateShape(points = [], dx = 0, dy = 0) {
  const out = [];
  for (let i = 0; i < points.length; i += 2) out.push(points[i] + dx, points[i + 1] + dy);
  return out;
}

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
