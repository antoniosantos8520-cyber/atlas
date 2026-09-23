# Atlas

*The Titan holding up the world, and a book of maps.*

A generic, **any-system** Foundry VTT module for **zone-based fog of war**. Instead of drawing walls, you sketch **rooms**, wire **connections** between them, set per-room **line-of-sight** rules, and the table runs its own fog: each player's screen shows only what *their* token can see, live, as anyone moves — with no manual hiding.

Built for **tactical zone combat** — a real map and real token positioning, where the unit of position is the **room**, not the 5-foot square: you're in a zone or you're not, distance is measured in room-hops, sight runs zone to zone, and crossing a boundary is what movement *means*. Coarser grain than a grid, every bit as tactical. (It serves theatre-of-the-mind tables just as well, but it isn't limited to that.)

> **New here?** The **[User's Manual](docs/Atlas-Users-Manual.pdf)** is a 19-page illustrated walkthrough of the whole tool, with screenshots. It is the fastest way in.
>
> What changed, and when: **[CHANGELOG.md](CHANGELOG.md)**. The manifest is the authority on the current version.

---

## What it does

### Drawing the map

- **Square** (click-drag a rectangle) or **Line** (click the corners, any shape) traces a room. Both live on the room panel and in the Areas editor.
- **Name** a room and its name becomes the player-facing boxed label. A room you **don't** name carries no label at all, so a battlemap cut into a dozen areas isn't carpeted in letters. The letter still lives in the data, for the connection matrix and for any host system's own map.
- **Redraw** replaces a room's outline while keeping its name, sight settings, effects, blackout, connections and doorways. A room traced badly doesn't have to be rebuilt.
- **Move mode** picks a room up from anywhere inside it. Labels move independently, so a name plate sits where it reads best rather than where the room happens to be.
- **Delete** removes a room, its outline, its label, every connection to it and every doorway on those connections. It asks first.

### Wiring it up

- **Connect** joins two rooms by pointing at them: press it once and it stays live, then click a room and click another. Two rooms already joined are cut loose instead. A readout follows the cursor showing the pair and whether the click would **join** or **cut**.
- A connection draws a **travel line** across the gap between the two rooms, clipped to each outline.
- The Areas editor's **connection matrix** does the same job as a grid, and is the fastest way to audit a finished map.

### Sight

Set each room's **In / Out / Through**:

- **In** — can it be seen *into* from outside?
- **Out** — can tokens in it see or shoot *out*?
- **Through** — can sight pass *through* it to somewhere beyond?

For one token to see another, the viewer's room must allow Out, the target's room must allow In, and every room the route passes through must allow Through. Anyone in your own room is always visible.

> **Sight has no distance limit**: it walks the connections until something stops it. Every new room starts with all three switches **on**, so the moment you wire a map into one connected graph, everything sees everything. That is waiting for you to turn **Through** off on the corridors and walls. Do it as you connect.

- **Doorways** put a sight block on **one** connection: sight cannot cross it in either direction, while the two rooms stay connected and tokens walk through freely. It is your setting, never a door players operate. Like **Connect**, the doorway tool stays live so a run of doors goes in one after another.
- **Blackout** takes a room off the players' map entirely: no outline, no label, no connection lines running to it, nothing inside it seen, and no way in. You still see all of it, the room drawn in black. For the secret room and the sealed vault.

### At the table

- **Live, per-player hide/reveal.** A token is visible to you only if its room is reachable from your token's room by the rules above. The GM always sees everything.
- **Traffic** (off by default) holds players to the map: a token may only move between rooms that are connected, one hop at a time. The GM is never restricted. A token standing outside every room moves freely, and a map with no connections yet is left alone entirely.
- **Hover** a room with a token selected and its label wears a distance + LOS readout, while the room's outline lifts and brightens.
- **Area effects** — **Web / Fire / Smoke / Ward** stack on a room and tint it. An effect's definition may carry LOS writes (Web seals In/Out as it lands; clearing an effect never writes LOS back, the GM re-toggles). Definitions live in `CONFIG.areaEffects`; hosts extend them. Any game *mechanics* stay host-side, keyed by effect id.

Everything is **per scene** — each scene is its own map.

## How it works (the important part)

Visibility is **not** Foundry's hide/eye flag (that's one shared switch). Atlas overrides `Token.prototype.isVisible` **per client**: the tokens stay un-hidden, and each player's screen independently decides what to draw based on *its own* line of sight. A lightweight movement sensor re-evaluates the instant any token crosses a room boundary, or you flip a LOS switch. On scenes without areas it's a no-op.

> For zone scenes, turn off token vision and use global illumination — the area fog **is** the vision, and you don't want two systems fighting.

## Install

Add-on Modules → Install Module → paste the manifest URL:

```
https://github.com/antoniosantos8520-cyber/atlas/releases/latest/download/module.json
```

Then:

1. Enable the module. A GM gets an **"Atlas — Areas"** button in the Token scene-controls, and `ATLAS.openRoomPanel()` opens the room panel from a macro or the console.
2. Open the panel on the scene you want. On an empty scene it opens ready to draw.
3. **Square** or **Line** a couple of rooms, name them, **Connect** them, set **In/Out/Through**.
4. Drop tokens. Players see only what they can, and it updates as everyone moves.

The module creates its own hidden marker actor in a folder named **"Atlas (do not delete)"** to host the room labels. Leave both in place.

### Getting around

| Do this | Get this |
|---|---|
| Double-click inside a room | Opens the room panel on it |
| Double-click a token | That token's sheet. The panel doesn't move |
| Click inside a room | Re-points an open panel at it |
| Right-click, in Connect or Doorway mode | Clears both slots of the readout. A right *drag* still pans |
| Escape | Cancels move mode, Connect, Doorway, or a pending redraw |

## Host-system integration (optional)

A system can mount the editor panel into its own UI and tune behavior:

```js
ATLAS.configure({
  flagScope: "atlas",
  isOwnView:   (doc) => doc.actor?.testUserPermission?.(game.user, "OWNER"),
  filterToken: (doc) => !!doc.actor && !doc.flags?.atlas?.areaMarker,
  markerActorType: null,           // null = auto-pick a valid actor type; or force one (e.g. "npc")

  // ⚠ IF YOUR SYSTEM HAS PROP TOKENS — lamps, markers, thrown weapons, a party pin — register this
  //    or they get movement-gated the moment a GM turns Traffic on. Return true to exempt a token.
  skipMovementGate: (doc, movement) => !!doc.flags?.["my-system"]?.prop,

  // extra areas a viewer can see beyond normal LOS (e.g. a tremor sense that hears through walls)
  extraAreas: (ownAreas, data, { neighbors }) => null,
});
```

```js
// surfaces
ATLAS.openRoomPanel("A");                 // the re-targetable room panel, optionally on a room
ATLAS.openEditor();                       // the standalone Areas editor
ATLAS.renderEditor(htmlElement, scene);   // or mount the editor into your own container

// queries
ATLAS.hasAreas(scene);                    // does this scene have any rooms traced?
ATLAS.hasLOS(scene, "A", "C");            // can room A see room C? (doorways removed)
ATLAS.areaOf(x, y, scene);                // the room a point belongs to (inside OR nearest — for fog)
ATLAS.roomAt(x, y, scene);                // the room a point is strictly inside (null in a gap)
ATLAS.roomDistance("A", "C", scene);      // hops over the connection graph (-1 unreachable)
ATLAS.areaLabels(scene);                  // every traced room label

// authoring
ATLAS.placeRoom(points, scene);           // [x,y,x,y,...]
ATLAS.placeRect(x, y, w, h, scene);
ATLAS.renameArea("A", "Front Room", scene);   // "" reverts to the bare letter
ATLAS.removeArea("A", scene);
ATLAS.reset(scene);                       // wipe a scene's areas

// area effects (they stack; definitions in CONFIG.areaEffects)
ATLAS.setAreaEffect("C", "web");                  // lay by id — applies the def's LOS writes + retints
ATLAS.setAreaEffect("C", { id:"fire", count:3 }); // effects carry state (re-laying an id refreshes it)
ATLAS.areaEffects("C");                           // → [ { id, ...state }, ... ] in lay order
ATLAS.clearAreaEffect("C", "web");                // remove one — or ALL with no id (LOS left as-is)

// display (user settings drive these; these force an immediate apply)
ATLAS.refresh();                          // recompute visibility now
ATLAS.rebuildLabels(scene);
ATLAS.refreshLabels();
ATLAS.restyleOutlines(scene);
```

(`globalThis.ATLAS`, also `game.modules.get("atlas").api`.)

## Data model

Per scene, in `scene.flags.atlas.areaData`:

```js
{
  areas: {
    "A": { label:"A", name:"Front Room", shape:[x0,y0, x1,y1, ...],
           losIn:true, losOut:true, losThrough:true,
           blackout:false,                                       // hidden from players entirely
           effects: [ { id:"web" }, { id:"fire", count:3 } ] }    // GM-laid, lay order, they stack
  },
  connections: [ ["A","B"], ["B","C"] ],  // undirected; the TRAVEL graph (sight rides along it)
  doorways:    [ ["B","C"] ]              // a SIGHT block on that connection; travel is untouched
}
```

Doorways are a subset of `connections`: a doorway on a pair that isn't connected is meaningless, and cutting a connection takes its doorway with it.

## Development

Pure logic (LOS BFS, point-in-polygon, edge-clipping, data transforms, the panel's markup, the movement rule) is split into Foundry-free modules and unit-tested:

```
npm test        # node --test, no Foundry needed
```

`los.mjs`, `data.mjs`, `room-card.mjs`, `labels.mjs`, `movement.mjs`, `hit.mjs`, `connect.mjs`, `marker.mjs` (helpers), `tooltip.mjs`, `editor.mjs` and `room-panel.mjs` hold the testable logic; `runtime.mjs`, `trace.mjs`, `effects.mjs`, `move-area.mjs` and `blackout.mjs` are the canvas/document glue.

## Not included (by design)

Torch / lights-out, cosmetic marker lights, and any source-system-specific behavior were intentionally dropped. The module is deliberately lean and system-agnostic.
