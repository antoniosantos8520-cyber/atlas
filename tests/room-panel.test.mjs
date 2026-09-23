/**
 * The room control panel's own decisions. Most of the file is Foundry glue and cannot run here,
 * but two things can, and both are the kind that go wrong quietly.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

// `readAreaData` deep-clones through Foundry's utils, so the panel needs that one global to exist
// before it is imported. structuredClone is the same contract.
globalThis.foundry ??= { utils: { deepClone: (v) => structuredClone(v) } };

const { resolveLabel, panelLabel, panelOpen, retargetPanel } = await import("../scripts/room-panel.mjs");

const scene = (areas) => ({ getFlag: () => ({ areas, connections: [] }) });
const rooms = (...labels) => Object.fromEntries(labels.map((l) => [l, { label: l, name: "" }]));

test("the panel lands on the room it was asked for", () => {
  assert.equal(resolveLabel(scene(rooms("A", "B", "C")), "B"), "B");
});

test("asked for nothing, it lands on the first room rather than showing nothing", () => {
  // a macro with no argument still has to be useful
  assert.equal(resolveLabel(scene(rooms("A", "B")), null), "A");
  assert.equal(resolveLabel(scene(rooms("A", "B")), undefined), "A");
});

test("first means the order labels were HANDED OUT, not alphabetical", () => {
  // past Z the labels run AA, AB, and a plain sort files AA between A and B
  assert.equal(resolveLabel(scene(rooms("AA", "B")), null), "B");
  assert.equal(resolveLabel(scene(rooms("Z", "AA")), null), "Z");
});

test("a room that is not on this map is not honoured", () => {
  // the panel holds a label across a scene change; that label usually means nothing on the new one
  assert.equal(resolveLabel(scene(rooms("A", "B")), "Q"), "A");
});

test("a map with no rooms resolves to nothing, and does not throw", () => {
  assert.equal(resolveLabel(scene({}), "A"), null);
  assert.equal(resolveLabel(scene({}), null), null);
  assert.equal(resolveLabel(undefined, "A"), null, "no scene at all is not a crash");
});

test("retargeting a CLOSED panel does nothing at all", () => {
  // ⚠ the whole point: a left click on the map must never conjure a window the GM did not open.
  // B3 hangs on this, and it is the difference between a helpful panel and one that ambushes you.
  assert.equal(panelOpen(), false);
  retargetPanel("B");
  assert.equal(panelLabel(), null, "no window, so nothing to point anywhere");
});
