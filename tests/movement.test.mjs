import { test } from "node:test";
import assert from "node:assert/strict";
import { gateMove, installMovement } from "../scripts/movement.mjs";
import { CONFIG } from "../scripts/config.mjs";

// ---------------------------------------------------------------------------
// A small Foundry stand-in. The gate touches exactly four globals, so the whole
// decision can be exercised in Node without a canvas.
// ---------------------------------------------------------------------------

const sq = (x, y, s = 10) => [x, y, x + s, y, x + s, y + s, x, y + s];

// A—B—C in a row with real gaps between them, joined A-B and B-C but never A-C.
const MAP = {
  areas: {
    A: { label: "A", name: "", shape: sq(0, 0) },
    B: { label: "B", name: "Cellar", shape: sq(20, 0) },
    C: { label: "C", name: "", shape: sq(40, 0) },
  },
  connections: [["A", "B"], ["B", "C"]],
};

const DARK = (label) => ({
  ...MAP,
  areas: { ...MAP.areas, [label]: { ...MAP.areas[label], blackout: true } },
});

const at = (x, y) => ({ x, y });
const IN_A = at(5, 5), IN_B = at(25, 5), IN_C = at(45, 5), IN_GAP = at(15, 5);

// a token document: positions ARE centres here, so the tests read as coordinates
const docFor = ({ flags = {}, map = MAP } = {}) => ({
  flags,
  parent: { flags: { atlas: { areaData: map } } },
  getCenterPoint: (p) => ({ x: p.x, y: p.y }),
});

const move = (origin, destination, method = "dragging") => ({ origin, destination, method });

let warnings = [];

// Run fn with the globals the gate reads, then put everything back.
function live({ isGM = false, on = true } = {}, fn) {
  const g = globalThis;
  const saved = { game: g.game, ui: g.ui, skip: CONFIG.skipMovementGate };
  warnings = [];
  g.game = { user: { isGM }, settings: { get: () => on } };
  g.ui = { notifications: { warn: (m) => warnings.push(m) } };
  try { return fn(); }
  finally {
    g.game = saved.game;
    g.ui = saved.ui;
    CONFIG.skipMovementGate = saved.skip;
  }
}

// ---------------------------------------------------------------------------
// the trap that would make every other test here meaningless
// ---------------------------------------------------------------------------

// ⚠⚠ Core calls this through Hooks.call, which is SYNCHRONOUS. An async handler returns
// a Promise, a Promise is truthy, and the gate would allow EVERY move while looking
// perfectly correct in review. This is the single most valuable assertion in the file.
test("the gate is not async, or it would silently allow every move", () => {
  assert.equal(gateMove.constructor.name, "Function");
  assert.notEqual(gateMove.constructor.name, "AsyncFunction");
  assert.equal(typeof installMovement, "function");
});

test("the gate returns a real boolean, never a thenable", () => {
  live({}, () => {
    const out = gateMove(docFor(), move(IN_A, IN_C));
    assert.equal(typeof out, "boolean");
    assert.equal(typeof out?.then, "undefined");
  });
});

// ---------------------------------------------------------------------------
// the rule itself
// ---------------------------------------------------------------------------

test("a hop through a door goes, a jump to an unjoined room does not", () => {
  live({}, () => {
    assert.equal(gateMove(docFor(), move(IN_A, IN_B)), true);
    assert.equal(gateMove(docFor(), move(IN_B, IN_C)), true);
    assert.equal(gateMove(docFor(), move(IN_A, IN_C)), false);
    assert.equal(gateMove(docFor(), move(IN_C, IN_A)), false);
  });
});

test("a refusal names both rooms, using the name the Keeper gave one", () => {
  live({}, () => {
    gateMove(docFor(), move(IN_B, at(-50, -50)));   // B to nowhere passes, no message
    assert.equal(warnings.length, 0);
    gateMove(docFor(), move(IN_A, IN_C));
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /\bA\b/);
    assert.match(warnings[0], /\bC\b/);
  });
  live({}, () => {
    // B carries a name, so it is named rather than lettered
    const twoRoom = { areas: MAP.areas, connections: [["A", "C"]] };
    gateMove(docFor({ map: twoRoom }), move(IN_A, IN_B));
    assert.match(warnings[0], /Cellar/);
  });
});

test("a token standing outside every room is never refused", () => {
  live({}, () => {
    assert.equal(gateMove(docFor(), move(IN_GAP, IN_C)), true);   // stepping in from a gap
    assert.equal(gateMove(docFor(), move(IN_A, IN_GAP)), true);   // stepping out into one
    assert.equal(warnings.length, 0);
  });
});

test("staying inside one room is always allowed", () => {
  live({}, () => {
    assert.equal(gateMove(docFor(), move(IN_A, at(8, 8))), true);
  });
});

// ---------------------------------------------------------------------------
// everything that must NOT be gated
// ---------------------------------------------------------------------------

test("the setting off means the gate says nothing at all", () => {
  live({ on: false }, () => {
    assert.equal(gateMove(docFor(), move(IN_A, IN_C)), true);
    assert.equal(warnings.length, 0);
  });
});

test("the Keeper is exempt, and silently", () => {
  live({ isGM: true }, () => {
    assert.equal(gateMove(docFor(), move(IN_A, IN_C)), true);
    assert.equal(warnings.length, 0, "a warning the Keeper cannot act on is noise");
  });
});

test("undo and paste are never gated", () => {
  live({}, () => {
    assert.equal(gateMove(docFor(), move(IN_A, IN_C, "undo")), true);
    assert.equal(gateMove(docFor(), move(IN_A, IN_C, "paste")), true);
    assert.equal(gateMove(docFor(), move(IN_A, IN_C, "keyboard")), false);   // but arrow keys are
  });
});

test("room labels move freely, or Redraw would freeze", () => {
  live({}, () => {
    assert.equal(gateMove(docFor({ flags: { atlas: { areaMarker: { label: "A" } } } }), move(IN_A, IN_C)), true);
    assert.equal(gateMove(docFor({ flags: { atlas: { markerActor: true } } }), move(IN_A, IN_C)), true);
  });
});

test("the host can exempt its own props, and the default exempts nothing", () => {
  live({}, () => {
    assert.equal(CONFIG.skipMovementGate(), false, "a module-only install gates normally");
    assert.equal(gateMove(docFor(), move(IN_A, IN_C)), false);
    CONFIG.skipMovementGate = (doc) => doc?.flags?.host?.partyMarker === true;
    assert.equal(gateMove(docFor({ flags: { host: { partyMarker: true } } }), move(IN_A, IN_C)), true);
    assert.equal(gateMove(docFor(), move(IN_A, IN_C)), false, "and only the props it names");
  });
});

// ---------------------------------------------------------------------------
// the self-gates: a map that cannot answer the question says nothing
// ---------------------------------------------------------------------------

test("a scene with no rooms traced is untouched", () => {
  live({}, () => {
    assert.equal(gateMove(docFor({ map: { areas: {}, connections: [] } }), move(IN_A, IN_C)), true);
    assert.equal(gateMove({ flags: {}, parent: { flags: {} }, getCenterPoint: (p) => p }, move(IN_A, IN_C)), true);
  });
});

test("a map TRACED but not yet WIRED is untouched", () => {
  // the dangerous one: with no connections nothing is joined to anything, so a gate that
  // only checked for rooms would freeze every token on a half-built map
  live({}, () => {
    const unwired = { areas: MAP.areas, connections: [] };
    assert.equal(gateMove(docFor({ map: unwired }), move(IN_A, IN_C)), true);
    assert.equal(gateMove(docFor({ map: unwired }), move(IN_A, IN_B)), true);
    assert.equal(warnings.length, 0);
  });
});

test("a bug inside the gate lets the move through rather than stranding a token", () => {
  live({}, () => {
    const broken = { flags: {}, parent: { flags: { atlas: { areaData: MAP } } },
      getCenterPoint() { throw new Error("boom"); } };
    const quiet = console.warn;
    console.warn = () => {};
    try { assert.equal(gateMove(broken, move(IN_A, IN_C)), true); }
    finally { console.warn = quiet; }
  });
});

// ---------------------------------------------------------------------------
// blackout: a secret room, not a route
// ---------------------------------------------------------------------------

test("a blacked-out room refuses entry even with the connection rule switched OFF", () => {
  // it is its own rule: a table that never turns the setting on still expects a hidden room shut
  live({ on: false }, () => {
    assert.equal(gateMove(docFor({ map: DARK("B") }), move(IN_A, IN_B)), false);
    assert.equal(warnings.length, 1);
  });
});

test("the refusal never names the room, or it hands over the secret", () => {
  live({}, () => {
    gateMove(docFor({ map: DARK("B") }), move(IN_A, IN_B));
    assert.equal(warnings.length, 1);
    assert.doesNotMatch(warnings[0], /\bB\b/, "not its letter");
    assert.doesNotMatch(warnings[0], /Cellar/, "and not its name");
  });
});

test("you may leave a blacked-out room, and move about inside it", () => {
  live({ on: false }, () => {
    assert.equal(gateMove(docFor({ map: DARK("A") }), move(IN_A, IN_B)), true, "leaving is allowed");
    assert.equal(gateMove(docFor({ map: DARK("A") }), move(IN_A, at(8, 8))), true, "so is shuffling");
    assert.equal(warnings.length, 0);
  });
});

test("the Keeper walks into a blacked-out room, silently", () => {
  live({ isGM: true }, () => {
    assert.equal(gateMove(docFor({ map: DARK("B") }), move(IN_A, IN_B)), true);
    assert.equal(warnings.length, 0);
  });
});

test("a blackout still applies on a map that has been traced but never wired", () => {
  live({ on: false }, () => {
    const unwired = { areas: DARK("B").areas, connections: [] };
    assert.equal(gateMove(docFor({ map: unwired }), move(IN_A, IN_B)), false);
    assert.equal(gateMove(docFor({ map: unwired }), move(IN_B, IN_A)), true, "and only into it");
  });
});
