/**
 * What a blacked-out room takes off the table. The outline was always the easy half; the lines
 * running to it are the half that gave the room away.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { pairOf, hiddenFromTable } from "../scripts/blackout.mjs";

const dark = (...labels) => {
  const set = new Set(labels);
  return (l) => set.has(l);
};

test("pairOf reads the two rooms a line joins", () => {
  assert.deepEqual(pairOf({ areaPair: "A|B" }), ["A", "B"]);
  assert.deepEqual(pairOf({ areaLine: true, areaDoor: "B|C", areaPair: "B|C" }), ["B", "C"]);
});

test("pairOf refuses anything that is not a pair", () => {
  assert.equal(pairOf({ areaRoom: "A" }), null, "a room outline is not a line");
  assert.equal(pairOf({}), null);
  assert.equal(pairOf(undefined), null);
  assert.equal(pairOf({ areaPair: "A" }), null, "half a pair is not a pair");
  assert.equal(pairOf({ areaPair: "A|B|C" }), null, "and neither is three");
});

test("a room outline goes when that room is dark", () => {
  assert.equal(hiddenFromTable("A", null, dark("A")), true);
  assert.equal(hiddenFromTable("A", null, dark("B")), false);
});

test("a line goes when EITHER end is dark", () => {
  // ⚠⚠ This is the whole point. Lines converging on an empty patch of map say "something is here"
  //    as loudly as an outline would, so one dark end is enough to take the line away.
  assert.equal(hiddenFromTable(null, ["A", "B"], dark("A")), true, "the far end is dark");
  assert.equal(hiddenFromTable(null, ["A", "B"], dark("B")), true, "the near end is dark");
  assert.equal(hiddenFromTable(null, ["A", "B"], dark("A", "B")), true, "both");
  assert.equal(hiddenFromTable(null, ["A", "B"], dark("C")), false, "neither");
});

test("a door icon follows its own line, because it carries the same pair", () => {
  const door = pairOf({ areaDoor: "B|C", areaPair: "B|C" });
  assert.equal(hiddenFromTable(null, door, dark("C")), true);
  assert.equal(hiddenFromTable(null, door, dark("A")), false);
});

test("a drawing that is neither is never touched", () => {
  // a scene is full of drawings other people put there
  assert.equal(hiddenFromTable(null, null, dark("A", "B", "C")), false);
});

test("nothing dark means nothing hidden", () => {
  const none = () => false;
  assert.equal(hiddenFromTable("A", null, none), false);
  assert.equal(hiddenFromTable(null, ["A", "B"], none), false);
});
