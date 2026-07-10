import { test } from "node:test";
import assert from "node:assert/strict";
import { centroid, rectPoints, formatLabel } from "../scripts/marker.mjs";

test("formatLabel reads 'A. Name' when named, just 'A' when not", () => {
  assert.equal(formatLabel("A", "Front Room"), "A. Front Room");
  assert.equal(formatLabel("B", ""), "B");
  assert.equal(formatLabel("C", "  Cellar  "), "C. Cellar");   // trimmed
  assert.equal(formatLabel("D", undefined), "D");
});

test("rectPoints returns a 4-corner polygon", () => {
  assert.deepEqual(rectPoints(0, 0, 10, 6), [0, 0, 10, 0, 10, 6, 0, 6]);
  assert.deepEqual(rectPoints(5, 5, 2, 2), [5, 5, 7, 5, 7, 7, 5, 7]);
});

test("centroid averages the vertices (rectangle → its centre)", () => {
  assert.deepEqual(centroid([0, 0, 10, 0, 10, 10, 0, 10]), { x: 5, y: 5 });
  assert.deepEqual(centroid(rectPoints(20, 10, 4, 4)), { x: 22, y: 12 });
});

test("centroid is safe on degenerate input", () => {
  assert.deepEqual(centroid([]), { x: 0, y: 0 });
  assert.deepEqual(centroid(undefined), { x: 0, y: 0 });
});
