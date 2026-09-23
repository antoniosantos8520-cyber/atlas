import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyAreaData, defaultAreaRecord, nextLabel, setArea, removeArea,
  normalizePair, hasConnection, toggleConnection, setLOS, setShape, sweepOrphans,
  addEffect, removeEffect, layEffect, stackTint, labelAt, compareLabels, sortLabels
} from "../scripts/data.mjs";
import { CONFIG } from "../scripts/config.mjs";

// a small fixture: areas A, B, C with A–B and B–C
const fixture = () => {
  let d = emptyAreaData();
  d = setArea(d, "A", defaultAreaRecord("A", [0, 0, 10, 0, 10, 10, 0, 10]));
  d = setArea(d, "B", defaultAreaRecord("B"));
  d = setArea(d, "C", defaultAreaRecord("C"));
  d = toggleConnection(d, "A", "B");
  d = toggleConnection(d, "B", "C");
  return d;
};

test("emptyAreaData + defaultAreaRecord shapes", () => {
  assert.deepEqual(emptyAreaData(), { areas: {}, connections: [] });
  const r = defaultAreaRecord("A", [1, 2, 3, 4, 5, 6], "Throne Room");
  assert.deepEqual(r, { label: "A", name: "Throne Room", shape: [1, 2, 3, 4, 5, 6], losIn: true, losOut: true, losThrough: true });
  assert.equal(defaultAreaRecord("B").name, "");   // name defaults to empty
});

test("nextLabel fills gaps (A, then B…, and refills a deleted middle letter)", () => {
  let d = emptyAreaData();
  assert.equal(nextLabel(d), "A");
  d = setArea(d, "A", defaultAreaRecord("A"));
  assert.equal(nextLabel(d), "B");
  d = setArea(d, "B", defaultAreaRecord("B"));
  d = setArea(d, "C", defaultAreaRecord("C"));
  assert.equal(nextLabel(d), "D");
  d = removeArea(d, "B");                 // delete the middle one
  assert.equal(nextLabel(d), "B");        // next drop refills B, not D
});

test("labelAt runs like spreadsheet columns past Z", () => {
  assert.equal(labelAt(0), "A");
  assert.equal(labelAt(25), "Z");
  assert.equal(labelAt(26), "AA");
  assert.equal(labelAt(27), "AB");
  assert.equal(labelAt(51), "AZ");
  assert.equal(labelAt(52), "BA");
  assert.equal(labelAt(701), "ZZ");
  assert.equal(labelAt(702), "AAA");
});

test("labelAt never repeats a label", () => {
  const seen = new Set();
  for (let i = 0; i < 800; i++) {
    const l = labelAt(i);
    assert.ok(!seen.has(l), `duplicate ${l} at ${i}`);
    seen.add(l);
  }
});

test("nextLabel carries on past Z instead of running out", () => {
  let d = emptyAreaData();
  for (let i = 0; i < 26; i++) d = setArea(d, labelAt(i), defaultAreaRecord(labelAt(i)));
  assert.equal(nextLabel(d), "AA");
  d = setArea(d, "AA", defaultAreaRecord("AA"));
  assert.equal(nextLabel(d), "AB");
  d = removeArea(d, "Q");                  // a gap anywhere still refills first
  assert.equal(nextLabel(d), "Q");
});

test("compareLabels files AA after Z, not between A and B", () => {
  assert.ok(compareLabels("Z", "AA") < 0);
  assert.ok(compareLabels("AA", "B") > 0);
  assert.ok(compareLabels("AA", "AB") < 0);
  assert.equal(compareLabels("C", "C"), 0);
  // the plain sort this replaces gets it wrong, which is the whole point
  assert.deepEqual(sortLabels(["B", "AA", "A", "Z", "AB"]), ["A", "B", "Z", "AA", "AB"]);
  assert.notDeepEqual(["B", "AA", "A", "Z", "AB"].sort(), ["A", "B", "Z", "AA", "AB"]);
});

test("setArea adds; removeArea deletes the area AND strips its connections", () => {
  const d = fixture();
  assert.equal(Object.keys(d.areas).length, 3);
  assert.equal(d.connections.length, 2);
  const d2 = removeArea(d, "B");
  assert.equal(d2.areas.B, undefined);
  assert.equal(d2.connections.length, 0);  // both A–B and B–C referenced B → gone
});

test("connections are normalized and undirected", () => {
  assert.deepEqual(normalizePair("B", "A"), ["A", "B"]);
  const d = fixture();
  assert.equal(hasConnection(d, "A", "B"), true);
  assert.equal(hasConnection(d, "B", "A"), true);   // same link, either order
  assert.equal(hasConnection(d, "A", "C"), false);
});

test("toggleConnection adds then removes; ignores self-links", () => {
  let d = emptyAreaData();
  d = setArea(d, "A", defaultAreaRecord("A"));
  d = setArea(d, "B", defaultAreaRecord("B"));
  d = toggleConnection(d, "A", "B");
  assert.equal(hasConnection(d, "A", "B"), true);
  d = toggleConnection(d, "B", "A");                 // reverse order toggles the SAME link off
  assert.equal(hasConnection(d, "A", "B"), false);
  const same = toggleConnection(d, "A", "A");         // self-link is a no-op
  assert.equal(same.connections.length, 0);
});

test("setLOS stores an explicit boolean and never deletes the key", () => {
  let d = fixture();
  d = setLOS(d, "C", "losIn", false);
  assert.equal(d.areas.C.losIn, false);
  d = setLOS(d, "C", "losIn", true);                  // toggling back stores explicit true
  assert.equal(d.areas.C.losIn, true);
  assert.ok("losIn" in d.areas.C);                    // key persists (mergeObject safety)
});

test("setLOS ignores unknown fields and missing areas", () => {
  const d = fixture();
  assert.equal(setLOS(d, "C", "bogus", false), d);    // unknown field → unchanged
  assert.equal(setLOS(d, "Z", "losIn", false), d);    // missing area → unchanged
});

test("setShape updates an area's polygon", () => {
  let d = fixture();
  d = setShape(d, "B", [0, 0, 5, 0, 5, 5, 0, 5]);
  assert.deepEqual(d.areas.B.shape, [0, 0, 5, 0, 5, 5, 0, 5]);
});

test("sweepOrphans drops dead areas + their connections, reports what it removed", () => {
  const d = fixture();
  const { data, removed } = sweepOrphans(d, ["A", "C"]);   // B's marker token is gone
  assert.deepEqual(removed, ["B"]);
  assert.equal(data.areas.B, undefined);
  assert.equal(data.connections.length, 0);                // A–B and B–C both referenced B
  assert.deepEqual(Object.keys(data.areas).sort(), ["A", "C"]);
});

test("sweepOrphans is a no-op (same object) when everything is live", () => {
  const d = fixture();
  const { data, removed } = sweepOrphans(d, ["A", "B", "C"]);
  assert.equal(removed.length, 0);
  assert.equal(data, d);   // unchanged reference
});

test("addEffect STACKS effects in lay order; re-laying an id replaces its entry (fresh state) at the top", () => {
  let d = fixture();
  d = addEffect(d, "B", { id: "web" });
  d = addEffect(d, "B", { id: "fire", count: 1 });
  assert.deepEqual(d.areas.B.effects, [{ id: "web" }, { id: "fire", count: 1 }]);   // both hold — they stack
  d = addEffect(d, "B", { id: "web" });                 // re-lay web → moves to the top, one entry only
  assert.deepEqual(d.areas.B.effects, [{ id: "fire", count: 1 }, { id: "web" }]);
  assert.equal(d.areas.A.effects, undefined);           // other areas untouched
});

test("addEffect ignores a missing area and an id-less effect", () => {
  const d = fixture();
  assert.equal(addEffect(d, "Z", { id: "web" }), d);    // missing area → unchanged
  assert.equal(addEffect(d, "B", {}), d);               // no id → unchanged
  assert.equal(addEffect(d, "B", null), d);
});

test("removeEffect: one by id, or ALL with no id (arrays are setFlag-merge-safe); never touches LOS", () => {
  let d = fixture();
  d = layEffect(d, "B", "web", CONFIG.areaEffects);     // web laid + its LOS writes
  d = addEffect(d, "B", { id: "fire", count: 2 });
  d = removeEffect(d, "B", "web");
  assert.deepEqual(d.areas.B.effects, [{ id: "fire", count: 2 }]);   // only web left the stack
  assert.equal(d.areas.B.losIn, false);                 // removing NEVER restores LOS — the GM re-toggles by hand
  d = removeEffect(d, "B");                             // no id → clear the whole stack
  assert.deepEqual(d.areas.B.effects, []);
  assert.equal(removeEffect(d, "Z"), d);                // missing area → unchanged
});

test("layEffect: one pass — stacks the effect AND applies the def's LOS-writes (Web seals In/Out, Through untouched)", () => {
  let d = fixture();
  d = layEffect(d, "B", "web", CONFIG.areaEffects);     // a bare id string works
  assert.deepEqual(d.areas.B.effects, [{ id: "web" }]);
  assert.equal(d.areas.B.losIn, false);
  assert.equal(d.areas.B.losOut, false);
  assert.equal(d.areas.B.losThrough, true);             // Through untouched — sight may still cross
});

test("layEffect: fire/smoke never touch LOS; effect state rides along; junk is a no-op", () => {
  let d = fixture();
  d = layEffect(d, "C", { id: "fire", count: 4 }, CONFIG.areaEffects);
  assert.deepEqual(d.areas.C.effects, [{ id: "fire", count: 4 }]);
  assert.equal(d.areas.C.losIn, true);                  // untouched
  assert.equal(d.areas.C.losOut, true);
  const same = fixture();
  assert.equal(layEffect(same, "B", "lava", CONFIG.areaEffects), same);   // unknown effect → unchanged
  assert.equal(layEffect(same, "Z", "web", CONFIG.areaEffects), same);    // unknown area → unchanged
});

test("stackTint: the most recently laid effect's tint wins; empty stack → null (stock colors)", () => {
  const fx = CONFIG.areaEffects;
  assert.equal(stackTint([], fx), null);
  assert.equal(stackTint([{ id: "web" }], fx), fx.web.tint);
  assert.equal(stackTint([{ id: "web" }, { id: "fire", count: 2 }], fx), fx.fire.tint);   // fire laid last
  assert.equal(stackTint([{ id: "fire" }, { id: "web" }], fx), fx.web.tint);              // web laid last
  assert.equal(stackTint([{ id: "bogus" }], fx), null);   // unknown id → stock
});

test("CONFIG.areaEffects ships web/fire/smoke — only Web carries LOS writes (In/Out off, Through untouched)", () => {
  const fx = CONFIG.areaEffects;
  assert.deepEqual(Object.keys(fx).sort(), ["fire", "smoke", "web"]);
  assert.deepEqual(fx.web.los, { losIn: false, losOut: false });   // Through deliberately absent
  assert.equal(fx.fire.los, undefined);                // fire/smoke never touch LOS (GM toggles by hand)
  assert.equal(fx.smoke.los, undefined);
  for (const def of Object.values(fx)) { assert.ok(def.label); assert.ok(def.icon); assert.ok(def.tint); }
});

test("transforms are immutable — the input is never mutated", () => {
  const d = fixture();
  const snapshot = JSON.stringify(d);
  setLOS(d, "C", "losIn", false);
  removeArea(d, "A");
  toggleConnection(d, "A", "C");
  setShape(d, "A", [9, 9]);
  addEffect(d, "B", { id: "web" });
  layEffect(d, "B", "fire", CONFIG.areaEffects);
  removeEffect(d, "B");
  assert.equal(JSON.stringify(d), snapshot);   // original untouched
});
