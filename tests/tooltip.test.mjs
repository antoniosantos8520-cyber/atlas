import { test } from "node:test";
import assert from "node:assert/strict";
import { bucket } from "../scripts/tooltip.mjs";

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
