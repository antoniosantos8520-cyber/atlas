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

test("editorHTML shows a room's name (escaped) in an editable field by its letter", () => {
  let d = setArea(emptyAreaData(), "A", defaultAreaRecord("A"));
  d = setName(d, "A", "Throne <Room>");
  const h = editorHTML(d);
  assert.match(h, /class="atlas-rn-in" data-atlas-name="A" value="Throne &lt;Room&gt;"/);
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

test("editorHTML: every room's name is an EDITABLE field, empty ones included", () => {
  let d = fixture();
  d = setName(d, "A", "Backyard");
  const h = editorHTML(d);
  // A carries its name as the input's value
  assert.match(h, /data-atlas-name="A"[^>]*value="Backyard"/);
  // B has no name yet but still gets a field, so it can be named after tracing
  assert.match(h, /data-atlas-name="B"[^>]*value=""/);
  assert.match(h, /placeholder="unnamed"/);
});

test("editorHTML: a room name cannot break out of the value attribute", () => {
  let d = fixture();
  d = setName(d, "A", 'Ba"ck<yard>&co');
  const h = editorHTML(d);
  assert.match(h, /value="Ba&quot;ck&lt;yard&gt;&amp;co"/);
  assert.ok(!h.includes('value="Ba"ck'));
});

test("editorHTML: matrix cells name the pair they toggle", () => {
  let d = fixture();
  d = setName(d, "A", "Backyard");
  const h = editorHTML(d);
  assert.match(h, /data-a="A" data-b="B" data-tooltip="A\. Backyard ↔ B"/);
});

test("editorHTML: labels past Z sort after Z, not between A and B", () => {
  let d = emptyAreaData();
  for (const l of ["A", "B", "Z", "AA", "AB"]) d = setArea(d, l, defaultAreaRecord(l));
  const h = editorHTML(d);
  const rails = [...h.matchAll(/data-atlas-name="([A-Z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(rails, ["A", "B", "Z", "AA", "AB"]);
});
