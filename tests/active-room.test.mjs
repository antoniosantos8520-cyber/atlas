/**
 * The halo around the room the panel is holding. Its drawing is canvas glue, but the question it
 * asks first, "is there a polygon to draw", is pure and is where every degenerate case lands.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { outlineOf, activeRoom } from "../scripts/active-room.mjs";

const areas = {
  A: { label: "A", shape: [0, 0, 100, 0, 100, 100, 0, 100] },
  B: { label: "B", name: "Cellar", shape: [200, 0, 300, 0, 300, 100] },
  C: { label: "C" },                                  // traced by hand and never given a shape
  D: { label: "D", shape: [] },
  E: { label: "E", shape: [10, 10, 20, 20] },          // two points is a line, not a room
};

test("a real room hands back its polygon", () => {
  assert.deepEqual(outlineOf(areas, "A"), [0, 0, 100, 0, 100, 100, 0, 100]);
  assert.equal(outlineOf(areas, "B").length, 6, "a triangle is a room");
});

test("no room, no label, no halo", () => {
  assert.equal(outlineOf(areas, null), null);
  assert.equal(outlineOf(areas, undefined), null);
  assert.equal(outlineOf(areas, "Z"), null, "a letter that is not on this map");
});

test("a shape that cannot be a polygon is refused rather than drawn", () => {
  // ⚠ PIXI will happily accept two points and draw nothing, which reads as the halo being broken
  //   rather than as there being nothing to draw. Refuse it here, where the reason is visible.
  assert.equal(outlineOf(areas, "C"), null, "no shape at all");
  assert.equal(outlineOf(areas, "D"), null, "an empty shape");
  assert.equal(outlineOf(areas, "E"), null, "two points is not a polygon");
});

test("a missing areas table is not a crash", () => {
  // the panel repaints on every scene-flag write, including the one that empties the flag
  assert.equal(outlineOf(undefined, "A"), null);
  assert.equal(outlineOf(null, "A"), null);
  assert.equal(outlineOf({}, "A"), null);
});

test("nothing is highlighted until something asks for it", () => {
  assert.equal(activeRoom(), null);
});
