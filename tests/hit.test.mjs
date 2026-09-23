/**
 * What is under the cursor. Two gestures stand down on this answer, and both fail SILENTLY when it
 * is wrong: a double click that should have opened an actor's sheet throws a room window at the GM
 * instead, or move mode refuses a room and says nothing about why.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { inBox, topBoxAt, creatureAt, labelAt } from "../scripts/hit.mjs";

const box = (x, y, w = 10, h = 10) => ({ x, y, width: w, height: h });

test("inBox: inside, on the near edge, off the far edge", () => {
  const b = box(0, 0, 10, 10);
  assert.equal(inBox(b, 5, 5), true);
  assert.equal(inBox(b, 0, 0), true, "the near corner is inside");
  assert.equal(inBox(b, 10, 5), false, "half-open: the far edge belongs to the next box");
  assert.equal(inBox(b, 5, 10), false);
  assert.equal(inBox(b, -1, 5), false);
  assert.equal(inBox(null, 5, 5), false);
});

test("topBoxAt: nothing there is null, not a guess at the nearest", () => {
  assert.equal(topBoxAt([{ id: "a", box: box(0, 0) }], 50, 50), null);
  assert.equal(topBoxAt([], 5, 5), null);
  assert.equal(topBoxAt(undefined, 5, 5), null);
});

test("topBoxAt: elevation beats sort, sort breaks a tie, the later entry wins an exact tie", () => {
  const low = { id: "low", box: box(0, 0), elevation: 0, sort: 900 };
  const high = { id: "high", box: box(0, 0), elevation: 5, sort: 0 };
  assert.equal(topBoxAt([low, high], 5, 5).id, "high");
  assert.equal(topBoxAt([high, low], 5, 5).id, "high");

  const under = { id: "under", box: box(0, 0), sort: 1 };
  const over = { id: "over", box: box(0, 0), sort: 2 };
  assert.equal(topBoxAt([over, under], 5, 5).id, "over");

  const first = { id: "first", box: box(0, 0) };
  const second = { id: "second", box: box(0, 0) };
  assert.equal(topBoxAt([first, second], 5, 5).id, "second", "drawn later, so it is on top");
});

// --- the canvas readers, over a stub stage -------------------------------------------------

const tok = (x, y, { marker = null, visible = true, preview = false } = {}) => ({
  isPreview: preview,
  visible,
  bounds: box(x, y),
  document: { elevation: 0, sort: 0, flags: marker ? { atlas: { areaMarker: marker } } : {} },
});

const stage = (...tokens) => { globalThis.canvas = { tokens: { placeables: tokens } }; };

test("creatureAt: a token yes, one of our labels no", () => {
  stage(tok(0, 0), tok(20, 0, { marker: { label: "A", name: "Cellar" } }));
  assert.ok(creatureAt(5, 5), "an ordinary token is a creature");
  assert.equal(creatureAt(25, 5), null, "a room label is furniture, and must not block the panel");
});

test("creatureAt: a token you cannot see does not block anything", () => {
  stage(tok(0, 0, { visible: false }));
  assert.equal(creatureAt(5, 5), null);
});

test("creatureAt: a DRAG GHOST is not a creature", () => {
  // ⚠ a ghost carries the real token's id and sits under the cursor by definition, so counting one
  //   would report a creature at every point of every drag
  stage(tok(0, 0, { preview: true }));
  assert.equal(creatureAt(5, 5), null);
});

test("labelAt: a NAMED label is grabbable", () => {
  stage(tok(0, 0, { marker: { label: "A", name: "Cellar" } }));
  assert.ok(labelAt(5, 5));
});

test("labelAt: an UNNAMED room's label is not there, so it cannot swallow a press", () => {
  // ⚠⚠ the token still exists, at alpha 0. If it could claim a press, move mode would stand down
  //    for something invisible: the room would refuse to move and nothing would say why.
  stage(tok(0, 0, { marker: { label: "B", name: "" } }));
  assert.equal(labelAt(5, 5), null);
  stage(tok(0, 0, { marker: { label: "B", name: "   " } }));
  assert.equal(labelAt(5, 5), null, "a name of nothing but spaces is not a name");
});

test("labelAt: an ordinary creature is not a label", () => {
  stage(tok(0, 0));
  assert.equal(labelAt(5, 5), null);
});

test("either reader survives a canvas that is not up yet", () => {
  globalThis.canvas = undefined;
  assert.equal(creatureAt(5, 5), null);
  assert.equal(labelAt(5, 5), null);
});
