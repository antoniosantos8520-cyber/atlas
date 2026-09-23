import { test } from "node:test";
import assert from "node:assert/strict";
import { bucket, readout } from "../scripts/tooltip.mjs";

test("bucket maps distance to a colour band", () => {
  assert.equal(bucket(-1), "none");   // no path
  assert.equal(bucket(0), "same");    // you are here
  assert.equal(bucket(1), "close");
  assert.equal(bucket(2), "close");
  assert.equal(bucket(3), "mid");
  assert.equal(bucket(4), "mid");
  assert.equal(bucket(5), "far");
  assert.equal(bucket(12), "far");
});

test("readout: range is R#, sight is an eye", () => {
  const clear = readout(2, true);
  assert.match(clear, /R2/);
  assert.match(clear, /fa-eye(?!-slash)/);      // open eye
  assert.match(clear, /atlas-los-yes/);         // green

  const blocked = readout(2, false);
  assert.match(blocked, /R2/);
  assert.match(blocked, /fa-eye-slash/);        // crossed eye
  assert.match(blocked, /atlas-los-no/);        // red
});

test("readout: your own room is R0, not a special case", () => {
  assert.match(readout(0, true), /R0/);
});

test("readout: an unreachable room keeps the same two slots", () => {
  const none = readout(-1, false);
  assert.match(none, /R∞/);
  assert.match(none, /fa-eye-slash/);
  // a shut eye whatever the LOS argument says: you cannot see where you cannot reach
  assert.match(readout(-1, true), /fa-eye-slash/);
});

test("readout: no prose left to widen the box", () => {
  for (const [d, l] of [[0, true], [3, false], [-1, false]]) {
    const visible = readout(d, l).replace(/<[^>]*>/g, "");   // markup out, glyphs left
    assert.ok(!/Range|LOS|path/i.test(visible), `still wordy: ${visible}`);
    assert.ok(visible.length <= 3, `${visible} is wider than "R12"`);
  }
});
