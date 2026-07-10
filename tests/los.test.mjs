import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAdjacency, distance, hasLOS, reachableAreas, pointInPolygon, areaAtPoint, clipToPolygon, pointToSegmentDist, nearestArea, tokenArea, neighbors } from "../scripts/los.mjs";

// A—B—C—D linear graph used across LOS/distance tests
const LINE = [["A", "B"], ["B", "C"], ["C", "D"]];

// ---------- adjacency ----------
test("buildAdjacency makes an undirected map", () => {
  const adj = buildAdjacency([["A", "B"], ["B", "C"]]);
  assert.deepEqual(adj.A, ["B"]);
  assert.deepEqual(adj.B.sort(), ["A", "C"]);
  assert.deepEqual(adj.C, ["B"]);
});

// ---------- neighbors (1-hop, ignores LOS — for host sense effects) ----------
test("neighbors: directly-connected areas of a single label, and of a set", () => {
  // A—B—C—D, plus a branch A—E
  const conn = [["A", "B"], ["B", "C"], ["C", "D"], ["A", "E"]];
  assert.deepEqual([...neighbors(conn, "A")].sort(), ["B", "E"]);
  assert.deepEqual([...neighbors(conn, "B")].sort(), ["A", "C"]);
  assert.deepEqual([...neighbors(conn, "Z")], []);              // not in the graph
  // open neighbourhood of a set: union of each seed's neighbours
  assert.deepEqual([...neighbors(conn, new Set(["A", "C"]))].sort(), ["B", "D", "E"]);
});

// ---------- distance (plain BFS) ----------
test("distance: same=0, adjacent=1, two hops=2, unreachable=-1", () => {
  assert.equal(distance(LINE, "A", "A"), 0);
  assert.equal(distance(LINE, "A", "B"), 1);
  assert.equal(distance(LINE, "A", "C"), 2);
  assert.equal(distance(LINE, "A", "Z"), -1);   // not in the graph
});

// ---------- hasLOS: In / Out / Through ----------
test("LOS: same area and open adjacent path are visible", () => {
  assert.equal(hasLOS(LINE, "A", "A", {}), true);
  assert.equal(hasLOS(LINE, "A", "B", {}), true);
  assert.equal(hasLOS(LINE, "A", "C", {}), true);   // A→B→C, B open
});

test("LOS: a sealed target (In:false) can't be seen into", () => {
  const areas = { C: { losIn: false } };
  assert.equal(hasLOS(LINE, "A", "C", areas), false);
  assert.equal(hasLOS(LINE, "B", "C", areas), false);
});

test("LOS: Out:false seals the source but NOT being seen (asymmetry)", () => {
  const areas = { A: { losOut: false } };
  assert.equal(hasLOS(LINE, "A", "B", areas), false);  // A can't see out
  assert.equal(hasLOS(LINE, "B", "A", areas), true);   // but B can still see A (A.losIn true)
});

test("LOS: Through:false on an intermediate is a wall, but the wall room itself is still visible", () => {
  const areas = { B: { losThrough: false } };
  assert.equal(hasLOS(LINE, "A", "C", areas), false);  // B blocks A→C
  assert.equal(hasLOS(LINE, "A", "B", areas), true);   // A still sees into B (target, not transited)
});

test("SEE THROUGH a sealed room: A→C with B In:no/Out:no/Through:yes (user's scenario)", () => {
  const conn = [["A", "B"], ["B", "C"]];
  const areas = {
    A: { losIn: true, losOut: true, losThrough: true },
    B: { losIn: false, losOut: false, losThrough: true },   // can't see INTO/OUT of B, but sight passes THROUGH
    C: { losIn: true, losOut: true, losThrough: true }
  };
  assert.equal(hasLOS(conn, "A", "C", areas), true);    // ✓ see through B to C
  assert.equal(hasLOS(conn, "A", "B", areas), false);   // ✓ but NOT into B itself
  const vis = reachableAreas(conn, ["A"], areas);
  assert.equal(vis.has("C"), true);                     // a player in A sees C
  assert.equal(vis.has("B"), false);                    // …but not B
});

test("LOS: a wall is bypassed if another open path exists", () => {
  // diamond: A→B→D and A→C→D
  const conn = [["A", "B"], ["A", "C"], ["B", "D"], ["C", "D"]];
  const areas = { B: { losThrough: false } };  // close the B route
  assert.equal(hasLOS(conn, "A", "D", areas), true);   // still reachable via C
});

test("LOS: disconnected areas have no sight", () => {
  const conn = [["A", "B"]];
  assert.equal(hasLOS(conn, "A", "X", { X: {} }), false);
});

// ---------- reachableAreas (the per-player visible set) ----------
test("reachableAreas expands from the player's areas via LOS, respecting seals", () => {
  // A—B—C—D, D sealed (In:false). Player in A sees A,B,C but NOT D.
  const areas = { A: {}, B: {}, C: {}, D: { losIn: false } };
  const vis = reachableAreas(LINE, ["A"], areas);
  assert.equal(vis.has("A"), true);
  assert.equal(vis.has("B"), true);
  assert.equal(vis.has("C"), true);
  assert.equal(vis.has("D"), false);   // sealed room hidden unless you're standing in it
});

test("reachableAreas: standing INSIDE a sealed room still sees it (it's in your own set)", () => {
  const areas = { A: {}, B: {}, C: {}, D: { losIn: false } };
  const vis = reachableAreas(LINE, ["D"], areas);
  assert.equal(vis.has("D"), true);    // your own area is always visible to you
});

// ---------- point-in-polygon ----------
const SQUARE = [0, 0, 10, 0, 10, 10, 0, 10];               // simple rectangle
// L-shape: full bottom band (y0–5) + left column (x0–5, y5–10); top-right is the notch (outside)
const LSHAPE = [0, 0, 10, 0, 10, 5, 5, 5, 5, 10, 0, 10];

test("pointInPolygon: rectangle inside/outside", () => {
  assert.equal(pointInPolygon(5, 5, SQUARE), true);
  assert.equal(pointInPolygon(15, 5, SQUARE), false);
  assert.equal(pointInPolygon(-1, 5, SQUARE), false);
});

test("pointInPolygon: concave L-shape — the bend reads inside, the notch reads outside", () => {
  assert.equal(pointInPolygon(2, 2, LSHAPE), true);    // bottom band
  assert.equal(pointInPolygon(8, 2, LSHAPE), true);    // bottom band (right side)
  assert.equal(pointInPolygon(2, 8, LSHAPE), true);    // the bend — left column, up high
  assert.equal(pointInPolygon(8, 8, LSHAPE), false);   // the notch — cut-out top-right
});

test("pointInPolygon: degenerate input is not inside", () => {
  assert.equal(pointInPolygon(1, 1, [0, 0, 1, 1]), false);  // < 3 vertices
  assert.equal(pointInPolygon(1, 1, null), false);
});

// ---------- areaAtPoint ----------
test("clipToPolygon stops a line at the room edge (not the centre)", () => {
  const sq = [0, 0, 10, 0, 10, 10, 0, 10];                 // 10×10 box, centre (5,5)
  assert.deepEqual(clipToPolygon(5, 5, 15, 5, sq), { x: 10, y: 5 });   // ray right → right edge
  assert.deepEqual(clipToPolygon(5, 5, 5, -5, sq), { x: 5, y: 0 });    // ray up → top edge
  assert.deepEqual(clipToPolygon(5, 5, -5, 5, sq), { x: 0, y: 5 });    // ray left → left edge
  // diagonal toward the bottom-right corner exits at (10,10)
  assert.deepEqual(clipToPolygon(5, 5, 20, 20, sq), { x: 10, y: 10 });
});

test("clipToPolygon falls back to the start point on degenerate input", () => {
  assert.deepEqual(clipToPolygon(5, 5, 5, 5, [0, 0, 10, 0, 10, 10, 0, 10]), { x: 5, y: 5 });  // zero-length ray
  assert.deepEqual(clipToPolygon(5, 5, 9, 9, [0, 0, 1, 1]), { x: 5, y: 5 });                  // < 3 vertices
});

test("pointToSegmentDist measures to the segment, clamping to its ends", () => {
  assert.equal(pointToSegmentDist(5, 5, 0, 0, 10, 0), 5);     // straight down to the segment
  assert.equal(pointToSegmentDist(-3, 0, 0, 0, 10, 0), 3);    // past the left end → distance to (0,0)
  assert.equal(pointToSegmentDist(13, 0, 0, 0, 10, 0), 3);    // past the right end → distance to (10,0)
});

test("nearestArea picks the area whose edge is closest (gap fallback)", () => {
  const areas = {
    A: { shape: [0, 0, 10, 0, 10, 10, 0, 10] },        // x 0..10
    B: { shape: [20, 0, 30, 0, 30, 10, 20, 10] }       // x 20..30
  };
  assert.equal(nearestArea(13, 5, areas), "A");        // in the gap, closer to A's right edge
  assert.equal(nearestArea(17, 5, areas), "B");        // in the gap, closer to B's left edge
  assert.equal(nearestArea(5, 5, areas), "A");
  assert.equal(nearestArea(0, 0, {}), null);           // no areas
});

test("tokenArea = inside, else nearest — never null when areas exist", () => {
  const areas = {
    A: { shape: [0, 0, 10, 0, 10, 10, 0, 10] },
    B: { shape: [20, 0, 30, 0, 30, 10, 20, 10] }
  };
  assert.equal(tokenArea(5, 5, areas), "A");           // strictly inside A
  assert.equal(tokenArea(25, 5, areas), "B");          // strictly inside B
  assert.equal(tokenArea(14, 5, areas), "A");          // in the gap → nearest (A)
  assert.equal(tokenArea(16, 5, areas), "B");          // in the gap → nearest (B)
});

test("areaAtPoint returns the containing area or null (works for L-shapes)", () => {
  const areas = {
    A: { shape: SQUARE },
    B: { shape: [20, 0, 30, 0, 30, 10, 20, 10] },   // separate square to the right
    L: { shape: LSHAPE.map(v => v + 40) }            // L-shape shifted to (40,40)+
  };
  assert.equal(areaAtPoint(5, 5, areas), "A");
  assert.equal(areaAtPoint(25, 5, areas), "B");
  assert.equal(areaAtPoint(42, 48, areas), "L");    // inside the shifted L's bend
  assert.equal(areaAtPoint(48, 48, areas), null);   // the L's notch → no area
  assert.equal(areaAtPoint(100, 100, areas), null); // empty space
});

// Movement cost is GRAPH distance, not geometry — a bent A–B–C–D corridor still costs C→A = 2 even
// though a straight drag from C to A cuts the corner and never overlaps B's polygon.
test("distance gives room-graph hops (bent corridors cost by zones traversed, not straight-line)", () => {
  const LINE = [["A", "B"], ["B", "C"], ["C", "D"]];
  assert.equal(distance(LINE, "C", "A"), 2);            // C → B → A
  assert.equal(distance(LINE, "C", "D"), 1);            // adjacent
  assert.equal(distance(LINE, "A", "A"), 0);            // same room
  assert.equal(distance(LINE, "A", "Z"), -1);           // unreachable
  // a shortcut door makes the long way cheap — graph distance picks the fewest zones
  assert.equal(distance([...LINE, ["A", "D"]], "A", "D"), 1);
});
