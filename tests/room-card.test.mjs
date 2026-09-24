import { test } from "node:test";
import assert from "node:assert/strict";
import {
  roomCardHTML, mapRowHTML, cardTarget, stageClick, emptyStage, stageDirty, readStage,
  committedEffects, sightShown, effectShown, esc
} from "../scripts/room-card.mjs";

const DEFS = {
  web:   { label: "Web",   icon: "fa-spider", tint: "#d8dee6", los: { losIn: false, losOut: false } },
  fire:  { label: "Fire",  icon: "fa-fire",   tint: "#ff6b2e" },
};

const room = (over = {}) => ({ label: "B", name: "Cellar", area: { label: "B", name: "Cellar", ...over } });

// A stand-in for the one bit of DOM `cardTarget` touches.
const ATTR_TO_DATA = {
  "data-atlas-los": "atlasLos", "data-atlas-fx": "atlasFx", "data-atlas-apply": "atlasApply",
  "data-atlas-draw": "atlasDraw",
};
const el = (attrs) => ({
  closest(sel) {
    const attr = sel.slice(1, -1);
    if (!(attr in attrs)) return null;
    return { dataset: { [ATTR_TO_DATA[attr]]: attrs[attr] } };
  },
});

// ---------------------------------------------------------------------------
// reading a room
// ---------------------------------------------------------------------------

test("an absent sight flag reads as ON, because the flags are explicit true/false", () => {
  assert.equal(sightShown({}, emptyStage(), "losIn"), true);
  assert.equal(sightShown({ losIn: false }, emptyStage(), "losIn"), false);
  assert.equal(sightShown({ losIn: true }, emptyStage(), "losIn"), true);
});

test("a staged value beats the committed one, including staging OFF over a true", () => {
  const st = emptyStage();
  st.los.losIn = false;
  assert.equal(sightShown({ losIn: true }, st, "losIn"), false);
});

test("effects are read from the stack, and a staged delta wins", () => {
  const area = { effects: [{ id: "web" }, { id: "fire", count: 3 }] };
  assert.deepEqual([...committedEffects(area)], ["web", "fire"]);
  assert.equal(effectShown(area, emptyStage(), "web"), true);
  assert.equal(effectShown(area, emptyStage(), "smoke"), false);
  const st = emptyStage();
  st.effects.web = false;
  assert.equal(effectShown(area, st, "web"), false);
  assert.equal(committedEffects({}).size, 0, "a room with no stack is not an error");
});

test("stageDirty is what the Apply button lives by", () => {
  assert.equal(stageDirty(emptyStage()), false);
  assert.equal(stageDirty({ los: { losIn: false }, effects: {} }), true);
  assert.equal(stageDirty({ los: {}, effects: { web: true } }), true);
  assert.equal(stageDirty(undefined), false);
});

// ---------------------------------------------------------------------------
// the markup
// ---------------------------------------------------------------------------

test("no room means the placeholder, and it never pretends to be editable", () => {
  const html = roomCardHTML(null);
  assert.match(html, /Area-label host/);
  assert.doesNotMatch(html, /data-atlas-los/);
  assert.doesNotMatch(html, /data-atlas-apply/);
});

test("the card draws all three sight toggles, showing on or off", () => {
  const html = roomCardHTML(room({ losThrough: false }), { defs: DEFS });
  for (const f of ["losIn", "losOut", "losThrough"]) assert.match(html, new RegExp(`data-atlas-los="${f}"`));
  assert.match(html, /data-atlas-los="losThrough"[^>]*>\s*<i class="fa-solid fa-eye-slash"/);
  assert.match(html, /data-atlas-los="losIn"[^>]*>\s*<i class="fa-solid fa-eye"/);
});

test("one button per effect definition, plus the None chip", () => {
  const html = roomCardHTML(room(), { defs: DEFS });
  assert.match(html, /data-atlas-fx="web"/);
  assert.match(html, /data-atlas-fx="fire"/);
  assert.match(html, /data-atlas-fx=""/, "the None chip carries an empty id");
  assert.match(html, /atlas-mc-fx clear on/, "nothing laid, so None reads as the live state");
});

test("a laid effect reads on, and None stops reading on", () => {
  const html = roomCardHTML(room({ effects: [{ id: "fire" }] }), { defs: DEFS });
  assert.match(html, /class="atlas-mc-fx on" data-atlas-fx="fire"/);
  assert.doesNotMatch(html, /atlas-mc-fx clear on/);
});

test("staging shows the amber state and a live Apply; a clean card disables it", () => {
  const clean = roomCardHTML(room(), { defs: DEFS });
  assert.match(clean, /data-atlas-apply disabled/);
  assert.match(clean, /no changes staged/);
  assert.doesNotMatch(clean, /\bstaged"/);

  const st = emptyStage();
  st.los.losIn = false;
  const dirty = roomCardHTML(room(), { staged: st, defs: DEFS });
  assert.match(dirty, /atlas-mc-tog staged|atlas-mc-tog on staged|atlas-mc-tog staged"/);
  assert.doesNotMatch(dirty, /data-atlas-apply disabled/);
  assert.match(dirty, /Apply commits/);
});

test("a write-through surface draws no Apply, no hint and no amber, even with edits staged", () => {
  const st = emptyStage();
  st.los.losIn = false;
  st.effects.web = true;
  const html = roomCardHTML(room(), { staged: st, defs: DEFS, staging: false });
  assert.doesNotMatch(html, /data-atlas-apply/, "nothing to apply when every click is committed");
  assert.doesNotMatch(html, /atlas-mc-hint/);
  assert.doesNotMatch(html, /staged/);
  // the VALUES still show through, so the panel reflects what it just wrote
  assert.match(html, /data-atlas-los="losIn"[^>]*>\s*<i class="fa-solid fa-eye-slash"/);
  assert.match(html, /class="atlas-mc-fx on" data-atlas-fx="web"/);
});

test("a room name is escaped, not injected", () => {
  const html = roomCardHTML({ label: "A", name: `<img src=x onerror="boom">`, area: {} }, { defs: DEFS });
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img/);
  assert.equal(esc(`<&">`), "&lt;&amp;&quot;&gt;");
  assert.equal(esc(null), "", "a missing name is empty, never the word null");
});

test("no effect definitions at all still draws a usable card", () => {
  const html = roomCardHTML(room(), { defs: {} });
  assert.match(html, /data-atlas-fx=""/);
  assert.match(html, /data-atlas-los="losIn"/);
});

// ---------------------------------------------------------------------------
// reading and folding a click
// ---------------------------------------------------------------------------

test("cardTarget names what was clicked, and null for anything else", () => {
  assert.deepEqual(cardTarget(el({ "data-atlas-los": "losOut" })), { kind: "los", field: "losOut" });
  assert.deepEqual(cardTarget(el({ "data-atlas-fx": "web" })), { kind: "fx", id: "web" });
  assert.deepEqual(cardTarget(el({ "data-atlas-fx": "" })), { kind: "fx", id: null }, "the None chip");
  assert.deepEqual(cardTarget(el({ "data-atlas-apply": "" })), { kind: "apply" });
  assert.equal(cardTarget(el({})), null);
  assert.equal(cardTarget(null), null, "a click with no target is not a crash");
});

test("a sight toggle staged back to where it started leaves nothing staged", () => {
  const area = { losIn: true };
  const st = emptyStage();
  stageClick(area, st, { kind: "los", field: "losIn" });
  assert.deepEqual(st.los, { losIn: false });
  assert.equal(stageDirty(st), true);
  stageClick(area, st, { kind: "los", field: "losIn" });
  assert.deepEqual(st.los, {}, "the key is deleted, not re-staged with the same value");
  assert.equal(stageDirty(st), false, "so Apply goes back to disabled");
});

test("an effect toggles against what is actually laid", () => {
  const area = { effects: [{ id: "web" }] };
  const st = emptyStage();
  stageClick(area, st, { kind: "fx", id: "web" });
  assert.deepEqual(st.effects, { web: false }, "laid, so a click stages it off");
  stageClick(area, st, { kind: "fx", id: "web" });
  assert.deepEqual(st.effects, {}, "and back again stages nothing");
  stageClick(area, st, { kind: "fx", id: "fire" });
  assert.deepEqual(st.effects, { fire: true }, "not laid, so a click stages it on");
});

test("None stages every laid effect off and discards other staged effects", () => {
  const area = { effects: [{ id: "web" }, { id: "fire" }] };
  const st = emptyStage();
  stageClick(area, st, { kind: "fx", id: "smoke" });      // stage an unlaid one on
  stageClick(area, st, { kind: "fx", id: null });         // then press None
  assert.deepEqual(st.effects, { web: false, fire: false });
  assert.equal("smoke" in st.effects, false, "None is a clean slate, not an addition");
});

test("None on a room carrying nothing stages nothing", () => {
  const st = emptyStage();
  stageClick({}, st, { kind: "fx", id: null });
  assert.deepEqual(st.effects, {});
  assert.equal(stageDirty(st), false);
});

test("a click on nothing, and an apply, change no staged state", () => {
  const st = emptyStage();
  stageClick({ losIn: true }, st, null);
  stageClick({ losIn: true }, st, { kind: "apply" });
  assert.equal(stageDirty(st), false);
});

// ---------------------------------------------------------------------------
// the click walk, with real ancestors
// ---------------------------------------------------------------------------

// ⚠ The flat stand-in above answers any attribute asked of it and models no ancestors, so it
// cannot see the thing this refactor actually changed: three separate closest() calls and an
// if/else chain became one ordered lookup. A real click lands on the <i> or <span> INSIDE a
// button and relies on closest() walking UP, so that walk needs a tree.
const node = (attrs, parent = null) => {
  const self = {
    attrs,
    closest(sel) {
      const attr = sel.slice(1, -1);
      for (let n = self; n; n = n.parent) {
        if (attr in n.attrs) return { dataset: { [ATTR_TO_DATA[attr]]: n.attrs[attr] } };
      }
      return null;
    },
  };
  self.parent = parent;
  return self;
};

test("a click on the icon inside a button finds the button", () => {
  const card = node({});
  const btn = node({ "data-atlas-los": "losOut" }, card);
  const icon = node({}, btn);                              // where the cursor actually lands
  assert.deepEqual(cardTarget(icon), { kind: "los", field: "losOut" });

  const fx = node({ "data-atlas-fx": "web" }, card);
  assert.deepEqual(cardTarget(node({}, fx)), { kind: "fx", id: "web" });

  const apply = node({ "data-atlas-apply": "" }, card);
  assert.deepEqual(cardTarget(node({}, apply)), { kind: "apply" });
});

test("a click on the card but on no control is nothing at all", () => {
  const card = node({});
  assert.equal(cardTarget(node({}, card)), null);
});

test("precedence is sight, then effect, then apply, whatever the nesting", () => {
  // Pinning the ORDER, not endorsing the arrangement: the real markup never nests these, but the
  // order is the one thing the if/else chain used to encode, so it should not drift silently.
  const both = node({ "data-atlas-los": "losIn", "data-atlas-fx": "web" });
  assert.deepEqual(cardTarget(both), { kind: "los", field: "losIn" });

  const los = node({ "data-atlas-los": "losIn" });
  const applyInside = node({ "data-atlas-apply": "" }, los);
  assert.deepEqual(cardTarget(applyInside), { kind: "los", field: "losIn" });

  const fx = node({ "data-atlas-fx": "fire" });
  assert.deepEqual(cardTarget(node({ "data-atlas-apply": "" }, fx)), { kind: "fx", id: "fire" });
});

// ---------------------------------------------------------------------------
// the class names the stylesheet hangs on
// ---------------------------------------------------------------------------

test("the card root carries BOTH its classes", () => {
  // .atlas-los-card .atlas-mc-room is the only rule giving the room title its weight and its blue
  // letter, so dropping either class unstyles the title while every other assertion still passes.
  assert.match(roomCardHTML(room(), { defs: DEFS }), /class="atlas-marker-card atlas-los-card"/);
});

test("every structural class the stylesheet targets is emitted", () => {
  const html = roomCardHTML(room(), { defs: DEFS });
  for (const cls of ["atlas-mc-room", "atlas-mc-hint", "atlas-mc-los", "atlas-mc-tog",
    "atlas-mc-t", "atlas-mc-s", "atlas-mc-sec", "atlas-mc-fxrow", "atlas-mc-fx",
    "atlas-mc-foot", "atlas-mc-apply", "atlas-mc-note"]) {
    assert.ok(html.includes(cls), `the stylesheet styles .${cls} and nothing emits it any more`);
  }
});

test("the placeholder keeps the root class the stylesheet paints", () => {
  assert.match(roomCardHTML(null), /class="atlas-marker-card"/);
});

// ---------------------------------------------------------------------------
// a caller that means "nothing staged" in its own way
// ---------------------------------------------------------------------------

test("readStage accepts every shape a caller might call empty", () => {
  for (const junk of [undefined, null, {}, { los: {} }, { effects: {} }, false]) {
    assert.deepEqual(readStage(junk), { los: {}, effects: {} });
  }
  const live = { los: { losIn: false }, effects: {} };
  assert.deepEqual(readStage(live).los, { losIn: false });
  assert.notEqual(readStage(live).los, live.los, "a reader gets a copy, so it cannot gain a key");
});

test("the builder renders rather than throwing on a half-made stage", () => {
  // the panel is the surface likely to model "nothing staged" as null or {}
  for (const junk of [null, undefined, {}, { los: {} }, { effects: {} }]) {
    const html = roomCardHTML(room(), { staged: junk, defs: DEFS });
    assert.match(html, /data-atlas-los="losIn"/);
    assert.match(html, /data-atlas-apply disabled/, "nothing staged means nothing to apply");
  }
});

test("stageClick survives a half-made stage and fills it in", () => {
  const bare = {};
  stageClick({ losIn: true }, bare, { kind: "los", field: "losIn" });
  assert.deepEqual(bare, { los: { losIn: false }, effects: {} });
  assert.equal(stageClick({}, null, { kind: "los", field: "losIn" }), null, "no stage, nothing to fold into");
});

test("defs missing entirely is not a crash, only an empty effect row", () => {
  for (const junk of [undefined, null]) {
    const html = roomCardHTML(room(), { defs: junk });
    assert.match(html, /data-atlas-fx=""/, "the None chip is always there");
    assert.doesNotMatch(html, /data-atlas-fx="web"/);
  }
});

// ---------------------------------------------------------------------------
// the rename field
// ---------------------------------------------------------------------------

test("the sheet does NOT gain a name field: rename is off unless asked for", () => {
  // ⚠ The double-clicked card has never had one, and B1's whole contract was that it does not
  // change. If a later edit flips this default, the sheet silently grows a control that writes to
  // the scene and has no handler behind it on that surface.
  assert.doesNotMatch(roomCardHTML(room(), { defs: DEFS }), /data-atlas-name/);
  assert.doesNotMatch(roomCardHTML(room(), { defs: DEFS, staging: false }), /data-atlas-name/);
});

test("asked for, the field carries the room's label and its committed name", () => {
  const html = roomCardHTML(room(), { defs: DEFS, staging: false, rename: true });
  assert.match(html, /data-atlas-name="B"/);
  assert.match(html, /value="Cellar"/);
  assert.match(html, /placeholder="unnamed"/);
  assert.match(html, /class="atlas-mc-name"/, "the stylesheet hangs on this class");
});

test("an unnamed room shows an empty field, not the word undefined", () => {
  const html = roomCardHTML({ label: "A", name: "", area: {} }, { defs: DEFS, rename: true });
  assert.match(html, /value=""/);
  assert.doesNotMatch(html, /undefined/);
});

test("with a rename field the name is shown ONCE, in the field", () => {
  // the letter is the handle and the field IS the name: printing it as a readout as well wasted a
  // whole row and said the same thing twice (USER 2026-09-23)
  const html = roomCardHTML(room(), { defs: DEFS, staging: false, rename: true });
  assert.ok(html.includes("<b>B</b>"), "the letter still leads the row");
  assert.doesNotMatch(html, / · Cellar/, "and the name is not printed beside it as well");
  assert.match(html, /value="Cellar"/);
});

test("without a rename field the row is still a plain readout", () => {
  const html = roomCardHTML(room(), { defs: DEFS });
  assert.ok(html.includes("<b>B</b> · Cellar"));
  assert.doesNotMatch(html, /data-atlas-name/);
});

test("a hostile name cannot break out of the value attribute", () => {
  const html = roomCardHTML({ label: "A", name: '" onfocus="boom', area: {} }, { defs: DEFS, rename: true });
  assert.doesNotMatch(html, /onfocus="boom"/);
  assert.match(html, /&quot; onfocus=&quot;boom/);
});

// ---------------------------------------------------------------------------
// hiding a whole room from the table
// ---------------------------------------------------------------------------

test("no blackout control unless the surface asks for one", () => {
  // the same reasoning as the name field: it is a scene write, so only a surface that commits it
  // may show it
  assert.doesNotMatch(roomCardHTML(room(), { defs: DEFS }), /data-atlas-blackout/);
  assert.doesNotMatch(roomCardHTML(room(), { defs: DEFS, rename: true }), /data-atlas-blackout/);
});

test("the toggle shows the room's current state", () => {
  const off = roomCardHTML(room(), { defs: DEFS, rename: true, blackout: false });
  assert.match(off, /class="atlas-mc-dark" data-atlas-blackout/);
  assert.match(off, /Hide this room/);

  const on = roomCardHTML(room(), { defs: DEFS, rename: true, blackout: true });
  assert.match(on, /class="atlas-mc-dark on" data-atlas-blackout/);
  assert.match(on, /Click to reveal it/);
});

test("the toggle sits on the room row whether or not there is a name field", () => {
  assert.match(roomCardHTML(room(), { defs: DEFS, blackout: false }), /data-atlas-blackout/);
});

test("a click on the blackout toggle is read as its own thing", () => {
  assert.deepEqual(cardTarget(el({ "data-atlas-blackout": "" })), { kind: "blackout" });
});

test("the blackout toggle is found from the icon inside it", () => {
  const btn = node({ "data-atlas-blackout": "" });
  assert.deepEqual(cardTarget(node({}, btn)), { kind: "blackout" });
});

// ---------------------------------------------------------------------------
// placing a doorway
// ---------------------------------------------------------------------------

test("no doorway control unless the surface asks for one", () => {
  assert.doesNotMatch(roomCardHTML(room(), { defs: DEFS }), /data-atlas-doorway/);
  assert.doesNotMatch(roomCardHTML(room(), { defs: DEFS, rename: true }), /data-atlas-doorway/);
});

test("idle, the control just offers itself", () => {
  const html = roomCardHTML(room(), { defs: DEFS, rename: true, doorway: false });
  assert.match(html, /class="atlas-mc-door" data-atlas-doorway/);
  assert.doesNotMatch(html, /atlas-mc-arm/, "nothing is pending, so nothing is announced");
});

test("ARMED says so on the card, because it has changed what the next click means", () => {
  const html = roomCardHTML(room(), { defs: DEFS, rename: true, doorway: true });
  assert.match(html, /class="atlas-mc-door armed" data-atlas-doorway/);
  assert.match(html, /atlas-mc-arm/);
  // ⚠ CHANGED 2026-09-23: Doorway became a sticky MODE like Connect, so the note stopped
  //   naming "the other side" of one doorway and started describing a run of them.
  assert.match(html, /to door or open the connection between them/);
  assert.match(html, /Escape, to stop/, "and says how to get out of it");
});

test("a click on the doorway control is read as its own thing", () => {
  assert.deepEqual(cardTarget(el({ "data-atlas-doorway": "" })), { kind: "doorway" });
  const btn = node({ "data-atlas-doorway": "" });
  assert.deepEqual(cardTarget(node({}, btn)), { kind: "doorway" }, "and from the icon inside it");
});

test("the two room controls are told apart, not confused for one another", () => {
  const html = roomCardHTML(room(), { defs: DEFS, rename: true, doorway: false, blackout: false });
  assert.match(html, /data-atlas-doorway/);
  assert.match(html, /data-atlas-blackout/);
  assert.deepEqual(cardTarget(el({ "data-atlas-blackout": "" })), { kind: "blackout" });
  assert.deepEqual(cardTarget(el({ "data-atlas-doorway": "" })), { kind: "doorway" });
});

// ---------------------------------------------------------------------------
// move mode
// ---------------------------------------------------------------------------

test("no move control unless the surface asks for one", () => {
  assert.doesNotMatch(roomCardHTML(room(), { defs: DEFS }), /data-atlas-move/);
  assert.doesNotMatch(roomCardHTML(room(), { defs: DEFS, rename: true }), /data-atlas-move/);
});

test("the move control leads the row, before the room's letter", () => {
  // it is the only control that changes what the whole MAP does; everything after it is about
  // the one room the panel happens to be showing
  const html = roomCardHTML(room(), { defs: DEFS, rename: true, move: false });
  assert.ok(html.indexOf("data-atlas-move") < html.indexOf("<b>B</b>"));
});

test("move mode ON is stated on the button and in its tooltip", () => {
  const on = roomCardHTML(room(), { defs: DEFS, rename: true, move: true });
  assert.match(on, /class="atlas-mc-move on" data-atlas-move/);
  assert.match(on, /Move mode is ON/);
  assert.match(on, /Escape, or this button, turns it off/, "and says how to get out of it");

  const off = roomCardHTML(room(), { defs: DEFS, rename: true, move: false });
  assert.match(off, /class="atlas-mc-move" data-atlas-move/);
  assert.match(off, /will not pan the map/, "and warns that it takes the drag over");
});

test("all four room controls are told apart from one another", () => {
  const html = roomCardHTML(room(), { defs: DEFS, rename: true, move: false, doorway: false, blackout: false });
  for (const a of ["data-atlas-move", "data-atlas-doorway", "data-atlas-blackout", "data-atlas-name"]) {
    assert.ok(html.includes(a), a + " is missing from a fully equipped card");
  }
  assert.deepEqual(cardTarget(el({ "data-atlas-move": "" })), { kind: "move" });
  assert.deepEqual(cardTarget(el({ "data-atlas-doorway": "" })), { kind: "doorway" });
  assert.deepEqual(cardTarget(el({ "data-atlas-blackout": "" })), { kind: "blackout" });
  assert.deepEqual(cardTarget(node({}, node({ "data-atlas-move": "" }))), { kind: "move" },
    "and each is found from the icon inside it");
});

// ---------------------------------------------------------------------------
// deleting a room
// ---------------------------------------------------------------------------

test("no delete control unless the surface asks for one", () => {
  assert.doesNotMatch(roomCardHTML(room(), { defs: DEFS }), /data-atlas-delete/);
  assert.doesNotMatch(roomCardHTML(room(), { defs: DEFS, rename: true }), /data-atlas-delete/);
});

test("delete is LAST on the row, furthest from everything you press often", () => {
  const html = roomCardHTML(room(), {
    defs: DEFS, rename: true, move: false, doorway: false, blackout: false, remove: true,
  });
  const at = (a) => html.indexOf(a);
  assert.ok(at("data-atlas-delete") > at("data-atlas-blackout"));
  assert.ok(at("data-atlas-delete") > at("data-atlas-doorway"));
  assert.ok(at("data-atlas-delete") > at("data-atlas-move"));
  assert.ok(at("data-atlas-delete") > at("data-atlas-name"));
});

test("the delete tooltip says what goes, and that it will ask first", () => {
  const html = roomCardHTML(room(), { defs: DEFS, rename: true, remove: true });
  assert.match(html, /every connection to it/);
  assert.match(html, /asked first/);
});

test("a click on delete is read as its own thing, never as a neighbour", () => {
  assert.deepEqual(cardTarget(el({ "data-atlas-delete": "" })), { kind: "delete" });
  assert.deepEqual(cardTarget(node({}, node({ "data-atlas-delete": "" }))), { kind: "delete" },
    "and from the icon inside it");
});

test("a fully equipped card tells all five controls apart", () => {
  const kinds = [
    ["data-atlas-move", "move"],
    ["data-atlas-doorway", "doorway"],
    ["data-atlas-blackout", "blackout"],
    ["data-atlas-delete", "delete"],
  ];
  const html = roomCardHTML(room(), {
    defs: DEFS, rename: true, move: false, doorway: false, blackout: false, remove: true,
  });
  for (const [attr, kind] of kinds) {
    assert.ok(html.includes(attr), attr + " missing");
    assert.deepEqual(cardTarget(el({ [attr]: "" })), { kind });
  }
  assert.match(html, /data-atlas-name/, "and still carries the name field");
});

// ---------------------------------------------------------------------------
// the MAP row: draw targets, connect, traffic
// ---------------------------------------------------------------------------

const withMap = (over = {}) => roomCardHTML(room(), {
  defs: DEFS, rename: true, move: false, doorway: false, blackout: false, remove: true,
  connect: false, draw: false, traffic: false, ...over,
});

test("every control on the card is told apart from every other", () => {
  const kinds = [
    ["data-atlas-move", "move"],
    ["data-atlas-doorway", "doorway"],
    ["data-atlas-blackout", "blackout"],
    ["data-atlas-delete", "delete"],
    ["data-atlas-connect", "connect"],
    ["data-atlas-traffic", "traffic"],
  ];
  const html = withMap();
  for (const [attr, kind] of kinds) {
    assert.ok(html.includes(attr), attr + " missing");
    assert.deepEqual(cardTarget(el({ [attr]: "" })), { kind });
  }
});

test("the four draw buttons come back with WHICH one was pressed", () => {
  for (const how of ["new", "redraw", "square", "line"]) {
    assert.deepEqual(cardTarget(el({ "data-atlas-draw": how })), { kind: "draw", how });
  }
});

test("the map row is absent unless the surface asks for it", () => {
  // the double-clicked marker sheet passes none of the three, and must not grow a Traffic switch
  const plain = roomCardHTML(room(), { defs: DEFS });
  for (const attr of ["data-atlas-draw", "data-atlas-connect", "data-atlas-traffic"]) {
    assert.ok(!plain.includes(attr), attr + " should not be on a bare card");
  }
  assert.ok(!plain.includes("atlas-mc-maprow"));
});

test("New is the resting half of the pair, and Redraw arms over it", () => {
  const resting = withMap();
  assert.match(resting, /data-atlas-draw="new"[^>]*>/);
  assert.match(resting, /class="atlas-mc-mb on" data-atlas-draw="new"/, "New is lit at rest");
  assert.ok(!/class="atlas-mc-mb armed" data-atlas-draw="redraw"/.test(resting), "Redraw is idle at rest");

  const armed = withMap({ draw: true });
  assert.match(armed, /class="atlas-mc-mb armed" data-atlas-draw="redraw"/, "Redraw is armed");
  assert.ok(!/class="atlas-mc-mb on" data-atlas-draw="new"/.test(armed), "and New goes out");
});

test("a live drawing tool is lit, and lights the half of the pair its shape is for", () => {
  // ⚠ Before this the panel showed its RESTING state while a trace was in flight: Redraw went out
  //   the moment a tool started, and Square and Line never lit at all (user, 2026-09-23: "the
  //   +new, and square or line tools are not highlighting ... that tool should highlight similar
  //   to connect does").
  const fresh = withMap({ tool: "square" });
  assert.match(fresh, /class="atlas-mc-mb armed" data-atlas-draw="square"/, "Square is live");
  assert.match(fresh, /class="atlas-mc-mb" data-atlas-draw="line"/, "Line is not");
  assert.match(fresh, /class="atlas-mc-mb armed" data-atlas-draw="new"/, "a new room: New lights with it");
  assert.match(fresh, /class="atlas-mc-mb" data-atlas-draw="redraw"/, "and Redraw stays out");

  const over = withMap({ draw: true, tool: "line" });
  assert.match(over, /class="atlas-mc-mb armed" data-atlas-draw="line"/, "Line is live");
  assert.match(over, /class="atlas-mc-mb" data-atlas-draw="square"/, "Square is not");
  assert.match(over, /class="atlas-mc-mb armed" data-atlas-draw="redraw"/, "a redraw: Redraw stays lit until the shape lands");
  assert.match(over, /class="atlas-mc-mb" data-atlas-draw="new"/, "and New is out");
});

test("with no tool live, neither tool is lit", () => {
  for (const html of [withMap(), withMap({ draw: true }), withMap({ tool: null })]) {
    assert.match(html, /class="atlas-mc-mb" data-atlas-draw="square"/);
    assert.match(html, /class="atlas-mc-mb" data-atlas-draw="line"/);
  }
});

test("a tool the row draws no button for lights nothing", () => {
  const html = withMap({ tool: "hex" });
  assert.match(html, /class="atlas-mc-mb" data-atlas-draw="square"/);
  assert.match(html, /class="atlas-mc-mb" data-atlas-draw="line"/);
  assert.match(html, /class="atlas-mc-mb on" data-atlas-draw="new"/, "and the pair rests as usual");
});

test("a live tool says what to do on the map, and for which room", () => {
  assert.match(withMap({ tool: "square" }), /atlas-mc-arm[^<]*>Drag a rectangle on the map for a new room/);
  assert.match(withMap({ draw: true, tool: "square" }), /atlas-mc-arm[^<]*>Drag a rectangle on the map for room B's new outline/);
  assert.match(withMap({ tool: "line" }), /atlas-mc-arm[^<]*>Click the corners of a new room on the map/);
  assert.match(withMap({ draw: true, tool: "line" }), /atlas-mc-arm[^<]*>Click the corners of room B's new outline on the map/);
  // the drawing owns the map until it lands, so its note outranks the armed redraw's
  assert.ok(!withMap({ draw: true, tool: "line" }).includes("Pick Square or Line"));
});

test("the live tool's tooltip says pressing it again stops it, as Connect's does", () => {
  assert.match(withMap({ tool: "square" }), /Square is LIVE[^"]*Press this again, or Escape, to stop/);
  assert.match(withMap({ tool: "line" }), /Line is LIVE[^"]*Press this again, or Escape, to stop/);
  assert.ok(!withMap().includes("is LIVE"), "and says nothing of the sort at rest");
});

test("an armed control says so in words, not just in colour", () => {
  assert.match(withMap({ draw: true }), /atlas-mc-arm[^<]*>Pick Square or Line/);
  assert.match(withMap({ doorway: true }), /atlas-mc-arm[^<]*>Click a room, then another, to door or open/);
  // ⚠ CHANGED 2026-09-23: Connect is a MODE now, not a one-shot arm, so the note stopped naming
  //   one room as "the" first side. It stays live and the cursor readout says where you are.
  assert.match(withMap({ connect: true }), /atlas-mc-arm[^<]*>Click a room, then another, to join or cut them/);
  assert.ok(!withMap().includes("atlas-mc-arm"), "and nothing at all when nothing is armed");
});

test("Traffic is never grey: red when it is enforcing, green when it is not", () => {
  assert.match(withMap({ traffic: true }), /atlas-mc-traffic stop/);
  assert.match(withMap({ traffic: false }), /atlas-mc-traffic go/);
});

test("the map row's tooltips name the room they act on", () => {
  const html = withMap();
  assert.ok(html.includes("Retrace room B"), "Redraw says which room it would replace");
  assert.ok(html.includes("Room B is picked for you as the first"), "Connect says where it starts");
});

// ---------------------------------------------------------------------------
// the map row with NO room: what the panel shows on an empty scene
// ---------------------------------------------------------------------------

test("with no room, the row keeps the two draw tools and the traffic rule", () => {
  // ⚠⚠ This is the whole point of the no-room variant. The empty panel used to say "trace a
  //    room first" and hand you nothing to do it with, so opening it from a macro on a fresh scene
  //    was a dead end (user, 2026-09-23).
  const html = mapRowHTML({ label: null, draw: false, traffic: false });
  assert.match(html, /data-atlas-draw="square"/);
  assert.match(html, /data-atlas-draw="line"/);
  assert.match(html, /data-atlas-traffic/);
});

test("with no room, a live tool still lights", () => {
  // the first room on a fresh map is drawn from this very row, so it must show the tool running
  const html = mapRowHTML({ label: null, draw: false, tool: "line", traffic: false });
  assert.match(html, /class="atlas-mc-mb armed" data-atlas-draw="line"/);
  assert.match(html, /class="atlas-mc-mb" data-atlas-draw="square"/);
});

test("with no room, the controls that NEED one are absent", () => {
  const html = mapRowHTML({ label: null, draw: false, connect: false, traffic: false });
  assert.ok(!html.includes('data-atlas-draw="redraw"'), "nothing to redraw");
  assert.ok(!html.includes('data-atlas-draw="new"'), "and so the pair means nothing");
  assert.ok(!html.includes("data-atlas-connect"), "a connection needs two rooms");
});

test("a row asked for nothing is nothing, not an empty box", () => {
  assert.equal(mapRowHTML(), "");
  assert.equal(mapRowHTML({ label: "A" }), "");
  assert.ok(!mapRowHTML({ label: null, draw: false }).includes("atlas-mc-traffic"));
});
