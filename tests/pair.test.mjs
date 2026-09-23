/**
 * Pair mode's readout. Two slots and a verb, and the verb is the part that matters: both kinds
 * TOGGLE, so one gesture does opposite things and has to say which before you commit.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readoutParts, pairModeOn, pairFrom, clearSlots } from "../scripts/pair.mjs";

const parts = (kind, from, hover, pair) => readoutParts(kind, from, hover, pair);

// ---------------------------------------------------------------------------
// the two slots
// ---------------------------------------------------------------------------

test("slot 1 is what you picked, slot 2 is what is under the cursor", () => {
  assert.deepEqual(parts("connect", null, null), { a: "?", b: "?", verb: "", tone: "" });
  assert.deepEqual(parts("connect", "A", null), { a: "A", b: "?", verb: "", tone: "" });
  assert.deepEqual(parts("connect", null, "B"), { a: "?", b: "B", verb: "", tone: "" });
});

test("a verb needs BOTH slots, never one", () => {
  assert.equal(parts("connect", "A", null, { connected: true }).verb, "", "no target yet");
  assert.equal(parts("connect", null, "B", { connected: true }).verb, "", "nothing picked yet");
  assert.equal(parts("doorway", "A", null, { connected: true }).verb, "");
});

test("the picked room hovering ITSELF offers no verb", () => {
  // clicking it again lets it go; it is not a pair
  assert.equal(parts("connect", "A", "A", { connected: false }).verb, "");
  assert.equal(parts("doorway", "A", "A", { connected: true }).verb, "");
});

// ---------------------------------------------------------------------------
// CONNECT: join or cut
// ---------------------------------------------------------------------------

test("connect says join when they are apart, cut when they are joined", () => {
  assert.deepEqual(parts("connect", "A", "B", { connected: false }), { a: "A", b: "B", verb: "join", tone: "join" });
  assert.deepEqual(parts("connect", "A", "B", { connected: true }), { a: "A", b: "B", verb: "cut", tone: "cut" });
});

test("connect does not care whether a doorway is on it", () => {
  // cutting takes the doorway with it, which is toggleConnection's business, not the readout's
  assert.equal(parts("connect", "A", "B", { connected: true, doored: true }).verb, "cut");
});

// ---------------------------------------------------------------------------
// DOORWAY: door or open, and it needs a connection to sit on
// ---------------------------------------------------------------------------

test("doorway says door when the connection is bare, open when it already has one", () => {
  assert.deepEqual(parts("doorway", "A", "B", { connected: true, doored: false }), { a: "A", b: "B", verb: "door", tone: "join" });
  assert.deepEqual(parts("doorway", "A", "B", { connected: true, doored: true }), { a: "A", b: "B", verb: "open", tone: "cut" });
});

test("a pair with NO connection cannot take a doorway, and says so before you click", () => {
  // ⚠⚠ This is the feedback the old one-shot doorway could not give: you found out by clicking and
  //    reading a warning. A doorway is a rule ON a connection, so with none there is nothing to
  //    put it on, and creating the connection would make the rooms walkable, which a doorway must
  //    never do.
  const r = parts("doorway", "A", "B", { connected: false });
  assert.equal(r.verb, "no link");
  assert.equal(r.tone, "warn");
});

test("opening a doorway wears the same red as a cut", () => {
  // taking the block off may reveal actors to every viewer with a sight route: the consequential half
  assert.equal(parts("doorway", "A", "B", { connected: true, doored: true }).tone, "cut");
});

// ---------------------------------------------------------------------------
// the mode itself
// ---------------------------------------------------------------------------

test("no mode runs until one is asked for", () => {
  assert.equal(pairModeOn(), false);
  assert.equal(pairModeOn("connect"), false);
  assert.equal(pairModeOn("doorway"), false);
  assert.equal(pairFrom(), null);
});

test("clearing does nothing when no mode is running", () => {
  // ⚠ A right click on the map means plenty of other things. Outside the mode this is inert.
  assert.equal(clearSlots(), false);
  assert.equal(pairFrom(), null);
});

test("an unknown kind is treated as neither", () => {
  assert.equal(pairModeOn("nonsense"), false);
});
