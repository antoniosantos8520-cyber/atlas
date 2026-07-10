import { test } from "node:test";
import assert from "node:assert/strict";
import { editorHTML } from "../scripts/editor.mjs";
import { emptyAreaData, defaultAreaRecord, setArea, toggleConnection, setLOS, setName } from "../scripts/data.mjs";

function fixture() {
  let d = emptyAreaData();
  d = setArea(d, "A", defaultAreaRecord("A"));
  d = setArea(d, "B", defaultAreaRecord("B"));
  d = toggleConnection(d, "A", "B");
  d = setLOS(d, "B", "losIn", false);
  return d;
}

test("editorHTML on no rooms shows the trace prompt + buttons", () => {
  const h = editorHTML(emptyAreaData());
  assert.match(h, /Trace a room to begin/);
  assert.match(h, /data-atlas-action="trace"/);
  assert.match(h, /data-atlas-action="box"/);
  assert.match(h, /data-atlas-action="clear"/);
});

test("editorHTML has a redraw button", () => {
  assert.match(editorHTML(emptyAreaData()), /data-atlas-action="redraw"/);
});

test("editorHTML reflects the lock state", () => {
  assert.match(editorHTML(emptyAreaData(), false), /data-atlas-action="lock"[^>]*>.*Unlocked/s);
  const locked = editorHTML(emptyAreaData(), true);
  assert.match(locked, /Locked/);
  assert.match(locked, /fa-lock"/);   // closed padlock icon (not fa-lock-open)
});

test("editorHTML shows a room's name tag (escaped) next to its letter", () => {
  let d = setArea(emptyAreaData(), "A", defaultAreaRecord("A"));
  d = setName(d, "A", "Throne <Room>");
  const h = editorHTML(d);
  assert.match(h, /class="atlas-rn">Throne &lt;Room&gt;</);   // shown + HTML-escaped
});

test("editorHTML calls the connection a line of travel (not 'wire doors')", () => {
  const h = editorHTML((() => {
    let d = emptyAreaData();
    return d;
  })());
  assert.doesNotMatch(h, /wire doors/);
});

test("editorHTML renders the matrix + LOS table with the right state", () => {
  const h = editorHTML(fixture());
  // both room labels present
  assert.match(h, />A</);
  assert.match(h, />B</);
  // a wired connection cell (A↔B) is marked on
  assert.match(h, /class="cell on" data-atlas-action="conn" data-a="A" data-b="B"/);
  // B's "In" is off (sealed), A's "In" is on
  assert.match(h, /class="los" data-atlas-action="los" data-label="B" data-field="losIn"/);   // no " on"
  assert.match(h, /class="los on" data-atlas-action="los" data-label="A" data-field="losIn"/);
  // delete buttons exist
  assert.match(h, /data-atlas-action="del" data-label="A"/);
});
