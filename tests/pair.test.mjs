/**
 * Pair mode's readout. Two slots and a verb, and the verb is the part that matters: both kinds
 * TOGGLE, so one gesture does opposite things and has to say which before you commit.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readoutParts, pairModeOn, pairFrom, clearSlots, setPairMode } from "../scripts/pair.mjs";

const parts = (kind, from, hover, pair) => readoutParts(kind, from, hover, pair);

// ---------------------------------------------------------------------------
// the two slots
// ---------------------------------------------------------------------------

test("the cursor fills the LEFTMOST EMPTY slot, so a letter never jumps sideways", () => {
  // ⚠⚠ CHANGED 2026-09-24. It used to put the hovered room on the RIGHT with nothing picked, and
  //    then move it to the LEFT the instant you clicked, which read as the letter jumping under you
  //    (user: "it sets that right letter into the left slot ... its a bit confusing this way").
  assert.deepEqual(parts("connect", null, null), { a: "?", b: "?", verb: "", tone: "" });
  assert.deepEqual(parts("connect", null, "B"), { a: "B", b: "?", verb: "", tone: "" },
    "nothing picked: the hover previews the START");
  assert.deepEqual(parts("connect", "B", "B"), { a: "B", b: "?", verb: "", tone: "" },
    "and clicking it leaves the readout exactly as it was");
  assert.deepEqual(parts("connect", "A", null), { a: "A", b: "?", verb: "", tone: "" });
});

test("once a start is picked, the cursor fills the DESTINATION", () => {
  assert.deepEqual(parts("connect", "A", "B", { connected: false }),
    { a: "A", b: "B", verb: "join", tone: "join" });
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

// ---------------------------------------------------------------------------
// arming never fills a slot for you
// ---------------------------------------------------------------------------

// setPairMode reads game.user, and on the way on it reaches for canvas.
// ⚠ `canvas?.ready` still THROWS when canvas is an undeclared identifier: optional chaining
//   guards a null value, not a missing binding. Declaring it null is what makes arm() bail the way
//   it would before a scene is drawn, which is exactly the path these tests want to walk.
globalThis.game = { user: { isGM: true } };
globalThis.canvas = null;

test("arming a mode leaves BOTH slots empty", () => {
  setPairMode(null);
  assert.equal(setPairMode("connect"), "connect");
  assert.equal(pairFrom(), null, "nothing is picked for you");
  setPairMode(null);
});

test("⚠⚠ SWITCHING TOOLS does not seed the slot either", () => {
  // The reported bug, 2026-09-24: open the panel on C, wire C to D, switch to Doorway, and the tool
  // had quietly put C back in slot 1. On a battlemap the next click then joined two rooms a screen
  // apart, and the only way to notice was to go looking for the line.
  setPairMode(null);
  setPairMode("connect");
  assert.equal(pairFrom(), null);
  setPairMode("doorway");
  assert.equal(pairModeOn("doorway"), true, "the switch took");
  assert.equal(pairModeOn("connect"), false, "and only one is live");
  assert.equal(pairFrom(), null, "and the slot is still yours to fill");
  setPairMode(null);
});

test("turning a mode off and on again starts clean", () => {
  setPairMode(null);
  setPairMode("connect");
  setPairMode(null);
  assert.equal(pairModeOn(), false);
  setPairMode("connect");
  assert.equal(pairFrom(), null);
  setPairMode(null);
});

test("a player cannot arm either tool", () => {
  globalThis.game = { user: { isGM: false } };
  assert.equal(setPairMode("connect"), null);
  assert.equal(pairModeOn(), false);
  globalThis.game = { user: { isGM: true } };
});
