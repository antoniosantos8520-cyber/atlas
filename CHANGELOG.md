# Changelog

Every commit adds to this file, in the same commit as the work. It is the record of what changed
and why, in plain language, for anyone reading the module later.

**Headings.** `Added` for something that was not there, `Changed` for something that was there and
is different now, `Fixed` for something that was wrong, `Removed` for something taken away. Each
entry says what a person would notice, not which function moved.

Newest first. A version heading is dated on the day it was released; an unreleased one says so.

---

## Unreleased

### Fixed

- **The room panel shows which drawing tool is running.** Square or Line lights up in the same
  amber Connect wears while it is live, and stays lit until the shape lands or the drawing is
  dropped, however that happens: Enter, Escape, a right-click or a scene change. Pressing the lit
  tool again stops it, as pressing live Connect does. Before this the panel went back to its
  resting look the moment a tool started, and nothing on it said a drawing was in flight.
- **New and Redraw follow the drawing.** While a shape is being drawn for a new room, New lights
  with the tool; while it is being drawn over a room, Redraw stays lit until it lands, instead of
  going out the moment the tool started and leaving New lit over a redraw. The note under the
  room's name says what to do on the map and which room it is for.
- **Switching tools mid-redraw keeps the redraw.** Redraw, then Square, then a change of mind to
  Line used to trace a new room instead. The redraw now stays aimed at the same room across the
  switch.

### Changed

- **New and Redraw are pressed before you draw.** Pressed while a drawing is in flight, either one
  drops that drawing first, then takes effect. Pressing Redraw mid-redraw leaves Redraw armed, so a
  tool can be picked again.

---

## 1.0.0 (2026-09-23)

The first release under the plain name, and the first the module is willing to call finished. What
follows is everything since 0.4.0, which is the version the world has actually been running: 0.5.0
was built and committed but never released.

### Added

- **A row of map controls under the room's effects.** Six buttons for the things that are not about
  a room's sight or its dressing: where the next shape you draw lands, how you draw it, joining one
  room to another, and whether the connections govern movement.
- **Traffic.** A light on the panel for the movement rule that used to live only in the settings
  window. Red means it is enforcing: a player may only move between connected rooms. Green means it
  is off and tokens go where they like. It is the one control on the card that is never grey,
  because a light that is off tells you nothing. It is a world rule, so flipping it moves the
  setting itself, and the switch follows if another GM, or the settings window, changes it.
- **Redraw a room without rebuilding it.** Press Redraw, then Square or Line, and the shape you
  draw REPLACES that room's outline. Its name, its In/Out/Through, its effects, its blackout, every
  connection to it and every doorway on those connections carry straight over. A room traced badly
  the first time no longer has to be deleted and made again.
- **Square and Line on the panel.** The two draw tools that were only in the Areas editor. New is
  where the pair rests, so pressing either one on its own still makes a new room, exactly as the
  editor's buttons always did. The label an unnamed room does not get is not missed here either:
  New asks for a name and blank is still a legal answer.
- **Doorways work exactly like Connect now.** Same sticky mode, same cursor readout, same
  right-click to clear: press it once and put in a run of doors by clicking pairs of rooms, instead
  of coming back to the button for every one. The readout says **door** when the connection is bare
  and **open** in red when it already has one, because taking a block off can reveal actors to every
  viewer with a sight route. A pair with no connection between them reads **no link** in amber
  BEFORE you click, which is the one thing the old one-shot doorway could never tell you: you used
  to find out by clicking and reading a warning.
- **A hidden room takes its connection lines with it.** Blacking a room out used to leave the white
  lines running to it on the players' map, and lines converging on an empty patch say "something is
  here" about as loudly as an outline would. Every line touching a hidden room, and any door icon
  riding one, now goes for the table and comes back when the room is revealed. You still see all of
  it. Scenes built on an earlier version repair themselves the first time you hide a room.
- **Connect, with a readout that follows your cursor.** The connection matrix's cell, done on the
  map. Press Connect and it STAYS live: click a room, click another, and they are joined, or cut if
  they were already joined. Then it resets and waits for the next pair, so a whole map goes in
  without coming back to the button. The room the panel is on is picked for you as the first end,
  so the first pair takes one click.
  The readout by the cursor is the state: two slots and a dash. The left one is the room you have
  picked, the right one is the room under the cursor, and a question mark means that slot is empty,
  so it reads `? - ?`, then `A - ?`, then `A - B`. When both are filled it also says what the
  click would do, JOIN in green or CUT in red, because one gesture that does opposite things has to
  say which, or you cut the corridor you meant to add.
  **Right-click clears both slots.** Turning Connect on picks the room the panel is showing as the
  first end, which saves a click when that is the room you want and is in the way when it is not.
  A right click puts the readout back to `? - ?` and you carry on from whichever room you like. A
  right DRAG still pans the map, so wiring a map larger than the screen is unaffected.
  Only one thing can own your next click on the map, so starting Connect turns off move mode and
  any half-placed doorway, and each of those turns off Connect.
- **Double-clicking anywhere inside a room opens its panel**, not just its label. The label used to
  be the only way in, back when it was also the room's grab handle; it is not either of those now,
  and an unnamed room has no label to aim at at all. A double click that lands on a CREATURE is
  that creature's: its sheet opens and the panel stays where it is, so double clicking an actor
  standing in a room does what it has always done. It only listens while the token controls are the
  ones in use, so a double click on the walls or drawings layer still means what that layer says it
  means.
- **Movement can be restricted to connected rooms.** A new world setting, off by default, because an
  upgrade must never change how a table that already uses the module moves. With it on, a player may
  only move a token between rooms the connection matrix joins, and a move to a room that is not
  connected is refused: the token stays where it was, rather than travelling and snapping back.
  Connections are doors, not adjacency, so two rooms can share a long wall and still not be joined.
  The GM is never restricted, and is not nagged about it either. Undo and paste are never restricted.
  A token standing outside every traced room is free to move anywhere, which is the honest answer on
  a map traced by hand over an image, and a map that has rooms but no connections yet is left alone
  entirely rather than freezing every token on it.
- **Delete a room from the panel, with a confirmation.** Its outline, its label, every connection
  to it and any doorway on those connections go with it, and the letter comes free for the next room
  you trace. It asks first and defaults to Keep, because the panel re-points itself when you click
  the map, so a one-press delete would sit a single stray click away from taking a room off the
  scene.

- **Move mode: pick a room up anywhere inside it and put it down somewhere else.** A four-way arrow
  on the room panel turns it on, and then dragging anywhere inside ANY room moves that room, letting
  go puts it down, and Escape drops it where it was. Until now the only way to move a room was to
  drag its label and then press Redraw. It is a mode, like Trace and Box, so while it is on a drag
  that starts inside a room will not pan the map or move a token: the button stays lit the whole
  time, and Escape a second time switches it off. A drag starting on empty ground still pans, so you
  are not trapped. The room's label, its outline and every line meeting it all move with it. While
  the mode is on the map is UNLOCKED, so labels can be nudged on their own too, and your lock is put
  back when the mode ends.

- **Doorways: a sight block on one connection.** Armed from the room panel, then you click the room
  on the other side. Sight cannot cross a doorway in either direction, and nothing else about that
  connection changes: the rooms stay connected, movement is untouched, hop distance is untouched, and
  walking through never opens it. Turning one off is a deliberate change you make, not something a
  token does by arriving, so it can reveal what is on the far side and it does that only when you say
  so. A small door is drawn at the middle of the blocked connection, which everyone can see. Trying
  to place one between two rooms that are not connected is refused rather than quietly connecting
  them, and the tool stays armed so the next click can be the room you meant.

- **Blackout: a room you can hide from the table while it sits on the live map.** Switched from the
  room panel. To your players the room simply is not there: no outline, no label, nothing inside it
  seen, no sight across it to whatever lies beyond, and no way to walk in. You keep it, drawn black
  and hatched so it can never be mistaken for an ordinary room. Blackout refuses entry whether or
  not the movement restriction is switched on, because a hidden room is a secret rather than a
  route, and the refusal a player sees does not name the room, which would rather give the game
  away. It leaves the room's own In / Out / Through switches untouched, so revealing it later
  restores exactly what you had set, not a default.

- **A room control panel: one window that follows the room you are working on.** Opened with
  `ATLAS.openRoomPanel()`, so a macro is one line. **Double-clicking a room opens it; a single
  click anywhere inside a room points it at that room**, not just a click on the label. One window
  for the whole session instead of a dialog per room. It holds the same sight and effect controls as
  the card you get by double-clicking a room label, plus a name field, which until now lived only in
  the Areas editor's table. Two further differences. It WRITES THROUGH: each
  click is committed as you make it, so there is no Apply and nothing to lose by closing it. And it
  WATCHES THE ROOM: if the room changes from the editor, the trace tool, an effect, or another GM,
  the panel repaints. The old card does neither, which is how two surfaces open on one room come to
  disagree about what that room is. GM only, because every control on it writes to the scene.
- **`CONFIG.skipMovementGate`** for host systems: a predicate naming the tokens this rule was never
  meant for, such as a party marker or a dropped lamp. The module can recognise its own room labels
  and nothing else, and a token type test cannot tell a prop from a creature.

### Fixed

- **Every canvas gesture stopped working after you changed scene.** Clicking a room to point the
  panel at it, double-clicking to open it, and the click that answers a half-placed doorway all
  worked on the first scene of a session and were dead on every scene after it, with nothing in the
  console. The cause was a wrong belief written into the code: that Foundry rebuilds the canvas
  stage for each scene, so marking the stage would mark a fresh one. It does not. There is one
  stage per session, and Foundry wipes every listener off it just before each scene finishes
  drawing, so the mark survived, the guard skipped the rebind, and the listeners were never put
  back. They are now removed and re-added on every scene, which is what the hover readout has
  always done.
- **The panel could not draw the first room on an empty map.** Opening it from a macro on a fresh
  scene gave a card that said to trace a room first and offered no way to do it. It now carries
  Square, Line and Traffic, which need no room to exist.
- **Deleting the room the panel was on could write a connection to a room that no longer existed.**
  A half-placed doorway or a pending redraw kept pointing at the deleted letter, and nothing on the
  card was lit to show it, because the card had already fallen back to another room. The stray
  connection stayed invisible until that letter was handed to the next room traced, at which point
  a line nobody drew appeared between them. Everything waiting for a click now dies with the room.
- **Move mode silently ate the click that answered a doorway.** With both live, the card said to
  click a room and the map did nothing. The three things that can claim your next click now turn
  each other off.
- **Cutting a connection now takes its doorway with it.** A sight block sat on the connection it was
  put on, so cutting that connection stranded the block in the data: nothing drew it, because there
  was no line left to draw it on, and it came back to life the moment the two rooms were rejoined.
  Deleting a room already pruned for this reason; cutting one connection did not. It applies to the
  matrix in the Areas editor as well as to the panel's new Connect button.
- **A room label can be moved while it is lying inside its own room.** Move mode takes over a drag
  that starts inside a room, and it was taking the label's drag too, so the only way to reposition
  a name plate was to shove the whole room out from under it first. A press that lands on a label
  is now the label's: it sits above the room's interior, which is where a name plate belongs.

- **Deleting a room left its doorways behind.** The pruning was calculated and then dropped: only
  the connections were written back, so a sight block could survive on a link that no longer
  existed, invisible and unreachable.

- **A redrawn blacked-out room came back looking ordinary.** Retracing one, or moving it, rebuilt
  its outline from the effect colours alone and threw away the hatch, so a room you had hidden
  looked exactly like one you had not.

- **The scene-control button used a callback Foundry removes in version 15.** It logged a deprecation
  warning on every world load and would have stopped opening the Areas editor outright on upgrade.

- **The room panel's name field is a fixed width, and the row stays together.** The panel is
  resizable and the field was elastic, so widening the window pushed the doorway and blackout buttons
  hundreds of pixels away from the room letter they belong to, and once the row outgrew the panel the
  centring clipped it at BOTH ends: the letter vanished off the left and the last button off the
  right.

### Changed

- **The README opens the way the manual's cover does**, and stops opening with a list of the things
  Atlas is not. The em-dashes are gone from it too, replaced by the punctuation that was doing the
  work anyway.
- **The manual is the Atlas User's Manual**, `docs/Atlas-Users-Manual.pdf`, with a cover that says
  what the module is instead of listing what it is not. It also stops calling you the Keeper: that
  is one game system's word for the job, and this module does not care which system you run.

- **Room labels stay still in normal play.** Hovering a room used to lift its name plate to full
  opacity, and hovering an UNNAMED room flashed a white box where its invisible label sits, because
  Foundry draws a token border from hover alone and knows nothing about the label being transparent.
  Together they made a busy map twitch under the cursor for no reason. Both now happen only while
  MOVE MODE is on, which is the one time the question "which plate am I about to grab" is worth
  answering. Nothing else changed: resting opacity, the distance readout and the room outline lift
  are all as they were.

- **The name is just Atlas now.** The backronym is retired: no more "Area Tactical Line-of-sight
  Awareness System", and no more full stops between the letters. It is the Titan holding up the
  world, and it is a book of maps, which is the whole idea in two images instead of six words that
  had to be read twice.
  Nothing about this breaks an installed world. The module id stays `atlas`, every stored flag stays
  under `flags.atlas`, and the public API a host system calls is still `ATLAS`. A world that already
  has its hidden marker folder keeps that folder under its old name, because the module finds the
  marker actor by flag and never looks a folder up by name once one exists.

- **A room you have not named carries no label at all.** A battlemap traced into a dozen areas was
  becoming carpeted in letters nobody reads. The letter is not lost: it still lives in the room's
  data, so the connection matrix keeps it and so does any host system's own map. Name a room and its
  label appears. The letter used to double as the handle you grabbed to move a room, which is why it
  was drawn at all; move mode replaced that, and clicking anywhere inside a room reaches its panel.

- **A room and its label move independently.** Moving a room with move mode leaves its label where it
  was, and dragging a label moves only the label. A name plate can sit where it reads best rather
  than where the room happens to be.

- **Redraw repaints; it no longer moves rooms.** It used to drag every room to its label's centre,
  which was how a room was moved before move mode existed. With labels placed freely that would have
  hauled every room off to wherever its name plate looked best. What is left is the repair it was
  always also useful for: rebuild the outlines and lines from the saved shapes when one has been
  deleted or has drifted.

- **Double-clicking a room opens the room panel; the old per-room card is retired from the map.**
  That card only ever showed one room, could not be re-pointed at another, and never repainted when
  the room changed underneath it, so two of them open on one room could disagree about what that
  room was. The hidden marker actor keeps its sheet in the sidebar, where all it does is tell you
  not to delete the actor.

---

## 0.5.0 (not released yet)

### Added

- **Rooms are no longer capped at 26.** Labels run like spreadsheet columns, A to Z, then AA, AB
  and on, so a large map never runs out. Deleting a room still frees its label for the next one
  placed. Labels sort in the order they were handed out rather than alphabetically, because a plain
  sort files AA between A and B and scrambles the matrix on a big map.
- **Four settings.** Room label opacity and room label size, and area overlay colour and opacity.
  Opacity is per client and changes nothing anyone else sees; size redraws the label textures.
- **The overlay can be turned off.** One slider drives both the wash across a room and the outline
  around it, so setting it to zero removes the overlay completely instead of leaving a bright
  outline over an invisible fill. Neither part follows the slider linearly: the outline carries the
  room's boundary, which stays useful long after the wash has faded, so it fades more slowly. At
  the default it sits where the module has always drawn it.
- **`ATLAS.renameArea(label, name, scene)`** on the public API. Passing an empty name reverts the
  room to a letter.
- **`ATLAS.rebuildLabels`, `ATLAS.refreshLabels` and `ATLAS.restyleOutlines`** for a host system
  that changes a setting itself and wants it applied immediately.

### Changed

- **The letter drops away when you lock the map.** The letter is there so you can find, name and
  grab rooms while building; locking is the signal that you are done, and after it only the names
  you actually wrote remain on the map. The connection matrix keeps the letters throughout.
- **Room labels own their own clicks.** A game system that adds its own right-click menu to tokens,
  a radial menu or similar, no longer has that menu appear on room labels. The module's marker
  actor borrows one of the host system's actor types, which is how the menus were leaking in.
- **Renaming a room moves the name everywhere at once.** A room's name lives both in its record,
  which the matrix and the line-of-sight table read, and baked into the label's texture on the map.
  They can no longer disagree.
- **Redrawing a room keeps its effect tint.** A webbed, burning or smoky room used to come back
  from a Redraw in stock colours.

### Fixed

- **Fog sometimes did not update after a drag, until something else made it refresh.** Dragging a
  token across a room boundary left the module remembering the room under the cursor rather than the
  room the token was in. When the token then genuinely arrived there, the module saw no change and
  asked for no redraw, so the map held whatever it had last drawn. It presented as intermittent,
  because the real token and the drag ghost kept overwriting each other's record. The drag ghost is
  now ignored, which is what it always should have been: it is not a token that has moved anywhere.
- **Tokens could be seen through walls.** In any world with the module enabled, on any scene with
  no areas traced, a player saw every token that was not explicitly hidden. The visibility override
  captured the wrong starting point: it reached past Foundry's Token class to the generic placeable
  underneath, whose answer is "visible unless hidden", so Foundry's real sight test never ran and
  walls stopped mattering. Zone fog itself was never affected; this only showed on the scenes the
  module was not gating. The override now asks the Token class itself, and marks the getter it
  installs so it can never mistake its own answer for the original.
- **The module list showed mojibake.** `Atlas â€”` in the title and again in the description,
  from a dash that had been read in the wrong encoding and written back. The title now uses a colon
  and the description a comma.

### For maintainers

- This repository is pinned to LF endings by a `.gitattributes`. On a machine with
  `core.autocrlf` enabled, git was one checkout away from rewriting every source file.
- The build plan for the next version, a node control window and a movement restrictor, is in
  `docs/0.6.0-build.md`, with the decisions that govern it.

---

## 0.4.0 (2026-07-09)

The first public release. Everything below already existed; this is what the release added on top
of the internal versions.

### Added

- **Area effects.** A room carries a stack of GM-laid conditions, Web, Fire and Smoke, which
  combine rather than replace one another. An effect tints the room for everyone, and an effect's
  definition may seal the room's line of sight as it lands. Clearing an effect never writes sight
  back: the GM decides that.
- **A staged marker card.** Clicking a room's label opens a card where line-of-sight toggles and
  effects collect, and a single Apply commits them all in one write.
- **A host API for effects:** `setAreaEffect`, `clearAreaEffect`, `areaEffects` and `areaLabels`.
  Effect definitions live in `CONFIG.areaEffects` so a host system can extend them. Any game
  mechanics the effects imply, movement costs, damage, blinding, stay the host's business.

### The module before 0.4.0

Versions before the public release are not itemised here; the repository begins at 0.4.0. In
summary, the module traces rooms, wires the connections between them, sets each room's In, Out and
Through line of sight, and then runs per-player fog live as tokens move, by deciding visibility
independently on each client rather than by hiding tokens for everyone.
