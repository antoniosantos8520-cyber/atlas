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
  // ⚠ CHANGED 2026-09-23: the lift is MOVE MODE only. Brightening a plate answers "which one
  //   am I about to grab", and outside move mode nobody is grabbing anything.
  assert.equal(targetAlpha(named, { opacity: 0.2, hovered: "A", movable: true }), 1);
  assert.equal(targetAlpha(named, { opacity: 0.2, hovered: "B", movable: true }), 0.2);
  assert.equal(targetAlpha(named, { opacity: 0.2, hovered: "A" }), 0.2, "and nothing at all in play");
});

test("targetAlpha: players never see a room with nothing written in it", () => {
  assert.equal(targetAlpha(bare, { opacity: 0.75, isGM: false }), 0);
  // not even on hover, since a bare letter is GM plumbing
  assert.equal(targetAlpha(bare, { opacity: 0.75, isGM: false, hovered: "B" }), 0);
});

test("an UNNAMED room has no label, for anyone, ever", () => {
  // ⚠ CHANGED 2026-09-23. The letter used to show for the GM while the map was unlocked, because it
  // was the handle you grabbed to move a room. Move mode replaced that, and a battlemap traced into
  // a dozen rooms should not be carpeted in letters nobody reads.
  assert.equal(targetAlpha(bare, { opacity: 0.75, isGM: true }), 0);
  assert.equal(targetAlpha(bare, { opacity: 0.75, isGM: true, hovered: "B" }), 0, "not even hovered");
  assert.equal(targetAlpha(bare, { opacity: 0.75, isGM: false }), 0);
});

test("locking has nothing left to say about an unnamed label", () => {
  // it was already invisible; lock is no longer part of the answer at all
  assert.equal(targetAlpha(bare, { opacity: 0.75, isGM: true, locked: true }), 0);
  assert.equal(targetAlpha(bare, { opacity: 0.75, isGM: true, locked: false }), 0);
});

test("a NAMED label is unaffected by any of it", () => {
  assert.equal(targetAlpha(named, { opacity: 0.75, isGM: true }), 0.75);
  assert.equal(targetAlpha(named, { opacity: 0.75, isGM: true, locked: true }), 0.75);
  assert.equal(targetAlpha(named, { opacity: 0.75, hovered: "A", movable: true }), 1);
  assert.equal(targetAlpha(named, { opacity: 0.75, isGM: false }), 0.75, "players read the names");
});

test("a name of nothing but spaces is not a name", () => {
  assert.equal(targetAlpha({ label: "C", name: "   " }, { opacity: 0.75, isGM: true }), 0);
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

// ---------- a blacked-out room's label is gone for the table ----------

test("a blacked-out room has no label for a player, named or not, hovered or not", () => {
  const named = { label: "B", name: "Cellar" };
  assert.equal(targetAlpha(named, { isGM: false, opacity: 0.75 }), 0.75, "ordinarily it shows");
  assert.equal(targetAlpha(named, { isGM: false, opacity: 0.75, blackout: true }), 0);
  assert.equal(targetAlpha(named, { isGM: false, opacity: 0.75, blackout: true, hovered: "B" }), 0,
    "hovering must not bring back a room that is not supposed to be there");
  assert.equal(targetAlpha({ label: "B", name: "" }, { isGM: false, blackout: true }), 0);
});

test("the Keeper keeps every label, including a hidden room's", () => {
  const named = { label: "B", name: "Cellar" };
  assert.equal(targetAlpha(named, { isGM: true, opacity: 0.75, blackout: true }), 0.75);
  assert.equal(targetAlpha(named, { isGM: true, opacity: 0.75, blackout: true, hovered: "B", movable: true }), 1);
});

test("blackout is checked before every other label rule", () => {
  // locked + unnamed + blacked out: all three say hide, and it must not depend on which wins
  assert.equal(targetAlpha({ label: "B", name: "" },
    { isGM: false, locked: true, blackout: true, opacity: 1 }), 0);
});

test("a name plate stays at its resting opacity in normal play, hovered or not", () => {
  // ⚠⚠ The complaint this answers: a map twitching under the cursor while nobody is editing it.
  for (const hovered of [null, "A", "B"]) {
    assert.equal(targetAlpha(named, { opacity: 0.6, hovered }), 0.6);
    assert.equal(targetAlpha(named, { opacity: 0.6, hovered, isGM: true }), 0.6);
  }
});

test("move mode does not resurrect an unnamed label", () => {
  assert.equal(targetAlpha(bare, { opacity: 0.6, hovered: "B", movable: true, isGM: true }), 0);
});

test("move mode does not show a player a hidden room's label", () => {
  assert.equal(targetAlpha(named, { opacity: 0.6, hovered: "A", movable: true, blackout: true }), 0);
});
