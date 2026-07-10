# A.T.L.A.S. — Area Tactical Line-of-sight Awareness System

A generic, **any-system** Foundry VTT module for **zone-based fog of war**. Instead of drawing walls, you sketch **rooms**, wire **doors** between them, set per-room **line-of-sight** rules, and the table runs its own fog: each player's screen shows only what *their* token can see, live, as anyone moves — with no manual hiding.

Built for abstract / theatre-of-the-mind "zone" combat (you're either *in* a room or not; exact position inside it doesn't matter). Works in any system; ships with a clean editor panel and a standalone window.

> Status: v0.4.0. Extracted and generalized from the Conan/*Blood & Steel* "Albert" area tool.
> 0.4.0 adds **area effects** — stackable GM conditions on a room (Web / Fire / Smoke) with room tints,
> per-effect LOS writes, a host-facing API, and a staged **marker card** (toggles + effects commit on Apply).

---

## What it does

- **Trace** a room (click its corners — any shape) or **Box** it (click-drag a rectangle).
- **Name** rooms ("A. Front Room"); the letter stays the internal handle, the name is the player-facing **boxed label**.
- **Connect** rooms in the matrix → a **travel line** is drawn between them (clipped to each room's edge).
- Set each room's **In / Out / Through** line of sight:
  - **In** — can it be seen *into* from outside?
  - **Out** — can tokens in it see/shoot *out*?
  - **Through** — can sight pass *through* it to somewhere beyond?
- The runtime then does **live, per-player hide/reveal**: a token is visible to you only if its room is reachable from your token's room by the In/Out/Through rules. The GM always sees everything.
- **Lock** the room markers (so you don't bump them while moving combatants), **Redraw** (drag a label to reposition its room, then re-anchor), **Clear** a scene.
- **Hover** a room → a distance + LOS readout, and the room's outline **lifts and brightens** (handy on busy map images).
- **Area EFFECTS** — click a room's letter token to open its **marker card**: stage LOS toggles and lay
  **Web / Fire / Smoke** (they **stack**; each is an independent on/off), then **Apply** commits everything
  in one write and closes. An effect **retints the room** for everyone (the most recently laid wins); an
  effect's definition may carry **LOS writes** (Web seals In/Out as it lands — clearing an effect never
  writes LOS back, the GM re-toggles). Definitions live in `CONFIG.areaEffects` — hosts extend them; any
  game *mechanics* (movement costs, damage, blinding) stay host-side, keyed by effect id.

Everything is **per scene** — each scene is its own map.

## How it works (the important part)

Visibility is **not** Foundry's hide/eye flag (that's one shared switch). A.T.L.A.S. overrides `Token.prototype.isVisible` **per client**: the tokens stay un-hidden, and each player's screen independently decides what to draw based on *its own* line of sight. A lightweight movement sensor re-evaluates the instant any token crosses a room boundary (or you flip a LOS switch). On scenes without areas it's a no-op.

> For zone scenes, turn off token vision / use global illumination — the area fog **is** the vision, and you don't want two systems fighting.

## Install / use

**Install in Foundry:** Add-on Modules → Install Module → paste the manifest URL:

```
https://github.com/antoniosantos8520-cyber/atlas/releases/latest/download/module.json
```

1. Enable the module. A GM gets an **"A.T.L.A.S. — Areas"** button in the Token scene-controls (and `ATLAS.openEditor()` in the console).
2. Open the panel, **Trace** or **Box** a couple of rooms, **name** them, click the matrix to connect them, set **In/Out/Through**.
3. Drop tokens. Players see only what they can — and it updates as everyone moves.

The module creates its own hidden marker actor in a folder named **"A.T.L.A.S. (do not delete)"** to host the room labels.

## Host-system integration (optional)

A system can mount the editor panel into its own UI and tune behavior:

```js
ATLAS.configure({
  flagScope: "atlas",
  isOwnView:   (doc) => doc.actor?.testUserPermission?.(game.user, "OWNER"),
  filterToken: (doc) => !!doc.actor && !doc.flags?.atlas?.areaMarker,
  markerActorType: null            // null = auto-pick a valid actor type; or force one (e.g. "npc")
});

ATLAS.renderEditor(htmlElement, scene);   // mount the panel into your own container
ATLAS.openEditor();                       // or open the standalone window
ATLAS.hasLOS(scene, "A", "C");            // LOS query
ATLAS.areaLabels(scene);                  // every traced room label (host sweeps)
ATLAS.placeRoom(points, scene);           // [x,y,x,y,...]
ATLAS.placeRect(x, y, w, h, scene);
ATLAS.removeArea("A", scene);
ATLAS.reset(scene);

// area effects (stack; definitions in CONFIG.areaEffects — extend via configure({ areaEffects }))
ATLAS.setAreaEffect("C", "web");                  // lay by id — applies the def's LOS writes + retints
ATLAS.setAreaEffect("C", { id:"fire", count:3 }); // effects carry state (re-laying an id refreshes it)
ATLAS.areaEffects("C");                           // → [ { id, ...state }, ... ] in lay order
ATLAS.clearAreaEffect("C", "web");                // remove one — or ALL with no id (LOS left as-is)
```

(`globalThis.ATLAS`, also `game.modules.get("atlas").api`.)

## Data model

Per scene, in `scene.flags.atlas.areaData`:

```js
{
  areas: {
    "A": { label:"A", name:"Front Room", shape:[x0,y0, x1,y1, ...],
           losIn:true, losOut:true, losThrough:true,
           effects: [ { id:"web" }, { id:"fire", count:3 } ] }   // GM-laid, lay order, they stack
  },
  connections: [ ["A","B"], ["B","C"] ]   // undirected; the TRAVEL graph (sight rides along it)
}
```

## Development

Pure logic (LOS BFS, point-in-polygon, edge-clipping, data transforms) is split into Foundry-free modules and unit-tested:

```
npm test        # node --test — 51 tests, no Foundry needed
```

`scripts/los.mjs`, `data.mjs` (incl. the effect-stack transforms), `marker.mjs` (helpers), `tooltip.mjs`
(bucket), `editor.mjs` (`editorHTML`) hold the testable logic; `runtime.mjs` / `trace.mjs` / `effects.mjs`
are the canvas/document glue.

## Not included (by design)

Torch / lights-out, cosmetic marker lights, and any source-system-specific behavior were intentionally dropped. The module is deliberately lean and system-agnostic.
