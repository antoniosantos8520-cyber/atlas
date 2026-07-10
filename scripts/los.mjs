// A.T.L.A.S. — pure line-of-sight + geometry core. NO Foundry dependencies, so it unit-tests in Node.
// This is the load-bearing math; everything else (runtime, editor) builds on it.
//
// Per-scene data shape these functions operate on:
//   areas = {
//     "A": { shape:[x0,y0, x1,y1, ...], losIn:true, losOut:true, losThrough:true },
//     ...                                  // polygon points (flat); LOS flags default TRUE when missing
//   }
//   connections = [ ["A","B"], ["B","C"] ]  // undirected, normalized pairs

// Build an undirected adjacency map from connection pairs.
export function buildAdjacency(connections = []) {
  const adj = {};
  for (const [a, b] of connections) {
    (adj[a] ??= []).push(b);
    (adj[b] ??= []).push(a);
  }
  return adj;
}

// The areas directly connected (1 hop) to `from` — a single label, or a Set/array of labels (the open
// neighbourhood of a set). Returns a Set. Used by host "sense" effects that reach into adjacent areas
// regardless of LOS (e.g. Whispers' tremor sense). May include a seed if two seeds are adjacent — harmless.
export function neighbors(connections, from) {
  const adj = buildAdjacency(connections);
  const seeds = (from instanceof Set || Array.isArray(from)) ? [...from] : [from];
  const out = new Set();
  for (const s of seeds) for (const n of adj[s] || []) out.add(n);
  return out;
}

// Shortest hop distance between two areas (plain BFS, ignores LOS). 0 = same, -1 = unreachable.
export function distance(connections, from, to) {
  if (from === to) return 0;
  const adj = buildAdjacency(connections);
  const visited = new Set([from]);
  const queue = [[from, 0]];
  while (queue.length) {
    const [cur, d] = queue.shift();
    for (const n of adj[cur] || []) {
      if (n === to) return d + 1;
      if (!visited.has(n)) { visited.add(n); queue.push([n, d + 1]); }
    }
  }
  return -1;
}

// Line-of-sight from `from` to `to` under the In / Out / Through model.
//   - from.losOut !== false   (the source can see/shoot OUT)
//   - to.losIn   !== false     (the target can be seen INTO)
//   - every INTERMEDIATE area on the path has losThrough !== false (sight transits it)
// Any single valid path counts. All three flags default to true when absent.
export function hasLOS(connections, from, to, areas = {}) {
  if (from === to) return true;
  if (areas[from]?.losOut === false) return false;   // sealed source
  if (areas[to]?.losIn === false) return false;      // sealed target
  const adj = buildAdjacency(connections);
  // BFS; the target's In was already checked, so the target is never treated as a wall.
  const visited = new Set([from]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift();
    for (const n of adj[cur] || []) {
      if (n === to) return true;
      if (visited.has(n)) continue;
      if (areas[n]?.losThrough === false) continue;  // wall — sight stops here
      visited.add(n);
      queue.push(n);
    }
  }
  return false;
}

// Every area the viewer can see from a set of "own" areas: the own areas themselves
// plus every area reachable by hasLOS. (This is the per-player visible-area set.)
export function reachableAreas(connections, fromAreas, areas = {}) {
  const visible = new Set(fromAreas);
  const labels = Object.keys(areas);
  for (const p of fromAreas) {
    for (const target of labels) {
      if (!visible.has(target) && hasLOS(connections, p, target, areas)) visible.add(target);
    }
  }
  return visible;
}

// Ray-casting point-in-polygon. `points` is a flat [x0,y0, x1,y1, ...] with >= 3 vertices.
export function pointInPolygon(x, y, points) {
  if (!Array.isArray(points) || points.length < 6) return false;
  const n = points.length / 2;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = points[i * 2], yi = points[i * 2 + 1];
    const xj = points[j * 2], yj = points[j * 2 + 1];
    const intersect = ((yi > y) !== (yj > y)) &&
      (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// Which area's polygon contains the point? Returns the label, or null. First match wins.
// (Areas never overlap by design, so "first match" == "the match".)
export function areaAtPoint(x, y, areas = {}) {
  for (const [label, info] of Object.entries(areas)) {
    if (pointInPolygon(x, y, info.shape)) return label;
  }
  return null;
}

// shortest distance from a point to a line segment
export function pointToSegmentDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// The area whose BOUNDARY is nearest the point (used as a fallback when the point is in a gap
// between approximately-traced areas). Returns the label, or null if there are no areas.
export function nearestArea(x, y, areas = {}) {
  let best = null, bestD = Infinity;
  for (const [label, info] of Object.entries(areas)) {
    const p = info.shape;
    if (!Array.isArray(p) || p.length < 6) continue;
    const n = p.length / 2;
    let d = Infinity;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const dd = pointToSegmentDist(x, y, p[j * 2], p[j * 2 + 1], p[i * 2], p[i * 2 + 1]);
      if (dd < d) d = dd;
    }
    if (d < bestD) { bestD = d; best = label; }
  }
  return best;
}

// Which area is a TOKEN in? Strictly inside one, or — in a gap — the nearest. Never null when
// areas exist. (Combat tiles the whole space with discrete areas; no one is ever "outside" one.)
export function tokenArea(x, y, areas = {}) {
  return areaAtPoint(x, y, areas) ?? nearestArea(x, y, areas);
}

// Where does the ray from (cx,cy) toward (tx,ty) FIRST cross the polygon's boundary?
// Used to clip a connection line so it stops at the room's edge instead of piercing to its centre.
// Returns the crossing point, or {x:cx, y:cy} if it never crosses (degenerate / centre already outside).
export function clipToPolygon(cx, cy, tx, ty, points) {
  if (!Array.isArray(points) || points.length < 6) return { x: cx, y: cy };
  const dx = tx - cx, dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const n = points.length / 2;
  const EPS = 1e-6;
  let bestT = Infinity;
  for (let i = 0, j = n - 1; i < n; j = i++) {                 // each edge E(j)→E(i)
    const x1 = points[j * 2], y1 = points[j * 2 + 1];
    const x2 = points[i * 2], y2 = points[i * 2 + 1];
    const sx = x2 - x1, sy = y2 - y1;
    const denom = dx * sy - dy * sx;                           // cross(ray dir, edge dir)
    if (Math.abs(denom) < EPS) continue;                      // parallel
    const ex = x1 - cx, ey = y1 - cy;
    const t = (ex * sy - ey * sx) / denom;                    // distance along the ray
    const u = (ex * dy - ey * dx) / denom;                    // position along the edge
    if (t > EPS && u >= -EPS && u <= 1 + EPS) bestT = Math.min(bestT, t);
  }
  if (!isFinite(bestT)) return { x: cx, y: cy };
  return { x: cx + dx * bestT, y: cy + dy * bestT };
}
