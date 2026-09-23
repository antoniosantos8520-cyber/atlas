# Changelog

Every commit adds to this file, in the same commit as the work. It is the record of what changed
and why, in plain language, for anyone reading the module later.

**Headings.** `Added` for something that was not there, `Changed` for something that was there and
is different now, `Fixed` for something that was wrong, `Removed` for something taken away. Each
entry says what a person would notice, not which function moved.

Newest first. A version heading is dated on the day it was released; an unreleased one says so.

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

- **The module list showed mojibake.** `A.T.L.A.S. â€”` in the title and again in the description,
  from a dash that had been read in the wrong encoding and written back. The title now uses a colon
  and the description a comma.

### For maintainers

- This repository is pinned to LF endings by a `.gitattributes`. On a machine with
  `core.autocrlf` enabled, git was one checkout away from rewriting every source file.

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
