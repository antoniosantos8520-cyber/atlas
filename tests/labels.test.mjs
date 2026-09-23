import test from "node:test";
import assert from "node:assert/strict";
import { targetAlpha } from "../scripts/labels.mjs";
import { labelTextFor, labelSig } from "../scripts/marker.mjs";
import { discScale, overlayAlphas, LABEL_FS_DEFAULT } from "../scripts/settings.mjs";

const named = { label: "A", name: "Front Room" };
const bare = { label: "B", name: "" };

test("targetAlpha: not a marker → null (leave the token alone)", () => {
  assert.equal(targetAlpha(null, { opacity: 0.5 }), null);
  assert.equal(targetAlpha(undefined, { opacity: 0.5 }), null);
});

test("targetAlpha: a named room rests at the opacity slider", () => {
  assert.equal(targetAlpha(named, { opacity: 0.75 }), 0.75);
  assert.equal(targetAlpha(named, { opacity: 0, isGM: true }), 0);
});

test("targetAlpha: hovering the room takes its label to full", () => {
  assert.equal(targetAlpha(named, { opacity: 0.2, hovered: "A" }), 1);
  assert.equal(targetAlpha(named, { opacity: 0.2, hovered: "B" }), 0.2);
});

test("targetAlpha: players never see a room with nothing written in it", () => {
  assert.equal(targetAlpha(bare, { opacity: 0.75, isGM: false }), 0);
  // not even on hover, since a bare letter is GM plumbing
  assert.equal(targetAlpha(bare, { opacity: 0.75, isGM: false, hovered: "B" }), 0);
});

test("targetAlpha: unlocked, the GM keeps an unnamed label as the room's grab handle", () => {
  assert.equal(targetAlpha(bare, { opacity: 0.75, isGM: true }), 0.75);
  assert.equal(targetAlpha(bare, { opacity: 0.75, isGM: true, hovered: "B" }), 1);
});

test("targetAlpha: locking hides the letters from the GM too", () => {
  assert.equal(targetAlpha(bare, { opacity: 0.75, isGM: true, locked: true }), 0);
  assert.equal(targetAlpha(bare, { opacity: 0.75, isGM: true, locked: true, hovered: "B" }), 0);
});

test("targetAlpha: locking leaves NAMED labels alone", () => {
  assert.equal(targetAlpha(named, { opacity: 0.75, isGM: true, locked: true }), 0.75);
  assert.equal(targetAlpha(named, { opacity: 0.75, locked: true, hovered: "A" }), 1);
});

test("labelTextFor: the letter is authoring plumbing and drops away on lock", () => {
  assert.equal(labelTextFor("A", "Front Room", false), "A. Front Room");
  assert.equal(labelTextFor("A", "Front Room", true), "Front Room");
  // an unnamed room has nothing left to say once locked
  assert.equal(labelTextFor("B", "", false), "B");
  assert.equal(labelTextFor("B", "", true), "");
  assert.equal(labelTextFor("B", "  ", true), "");
});

test("labelSig: size and lock state both force a redraw", () => {
  assert.notEqual(labelSig(20, false), labelSig(20, true));
  assert.notEqual(labelSig(20, false), labelSig(24, false));
  assert.equal(labelSig(20, false), labelSig(20, false));
});

test("targetAlpha: whitespace is not a name", () => {
  assert.equal(targetAlpha({ label: "C", name: "   " }, { opacity: 0.75, isGM: false }), 0);
});

test("overlayAlphas: the default slider lands on the look the module shipped with", () => {
  const clean = overlayAlphas(0.1, false);
  assert.equal(clean.fillAlpha, 0.1);
  assert.ok(Math.abs(clean.strokeAlpha - 0.7) < 0.02, `stroke ${clean.strokeAlpha}`);
  const dressed = overlayAlphas(0.1, true);
  assert.ok(Math.abs(dressed.strokeAlpha - 0.9) < 0.02, `effect stroke ${dressed.strokeAlpha}`);
});

test("overlayAlphas: an effect room reads stronger at EVERY setting short of full", () => {
  for (const v of [0.05, 0.1, 0.25, 0.5, 0.95]) {
    const clean = overlayAlphas(v, false);
    const dressed = overlayAlphas(v, true);
    assert.ok(dressed.fillAlpha > clean.fillAlpha, `fill at ${v}`);
    assert.ok(dressed.strokeAlpha > clean.strokeAlpha, `stroke at ${v}`);
  }
});

test("overlayAlphas: the outline outlives the wash as the slider comes down", () => {
  for (const v of [0.05, 0.1, 0.25, 0.5]) {
    const { fillAlpha, strokeAlpha } = overlayAlphas(v, false);
    assert.ok(strokeAlpha > fillAlpha, `boundary should stay readable at ${v}`);
  }
});

test("overlayAlphas: monotonic, so the slider always does something", () => {
  let prev = overlayAlphas(0, false);
  for (const v of [0.05, 0.2, 0.4, 0.7, 1]) {
    const cur = overlayAlphas(v, false);
    assert.ok(cur.fillAlpha > prev.fillAlpha, `fill rose at ${v}`);
    assert.ok(cur.strokeAlpha > prev.strokeAlpha, `stroke rose at ${v}`);
    prev = cur;
  }
});

test("overlayAlphas: 0 turns the WHOLE overlay off, not just the wash", () => {
  assert.deepEqual(overlayAlphas(0, false), { fillAlpha: 0, strokeAlpha: 0 });
  assert.deepEqual(overlayAlphas(0, true), { fillAlpha: 0, strokeAlpha: 0 });
});

test("overlayAlphas: never exceeds a legal alpha", () => {
  for (const effect of [false, true]) {
    const a = overlayAlphas(1, effect);
    assert.ok(a.fillAlpha <= 1 && a.strokeAlpha <= 1);
  }
});

test("discScale: tracks the font slider, clamped at both ends", () => {
  assert.equal(discScale(LABEL_FS_DEFAULT), 0.4);
  assert.ok(discScale(10) < 0.4);
  assert.ok(discScale(40) > 0.4);
  assert.ok(discScale(1) >= 0.18);
  assert.ok(discScale(500) <= 0.75);
});
