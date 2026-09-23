// Atlas — markers & rooms (the engine). A "room" is a traced polygon (the area shape); a
// "marker" is a small lettered, player-VISIBLE label token dropped inside it. The module owns its
// own marker actor in its own temp folder (auto-picks a valid actor type — never borrows a system one).
//
// Pure helpers (centroid, rectPoints) are unit-tested; the Foundry document work runs at call time only,
// so this file still imports cleanly in Node.
import { CONFIG } from "./config.mjs";
import { labelFontSize, discScale, overlayStyle, blackoutStyle, LABEL_FS_DEFAULT } from "./settings.mjs";
import { clipToPolygon } from "./los.mjs";
import {
  readAreaData, writeAreaData, setArea, setShape, setLOS, setName, removeArea, defaultAreaRecord,
  nextLabel, layEffect, removeEffect, stackTint, hasDoorway, translateShape, isBlackedOut
} from "./data.mjs";
import { retintFromData } from "./effects.mjs";
import { roomCardHTML, cardTarget, stageClick, emptyStage, stageDirty } from "./room-card.mjs";

const MARKER_ACTOR_NAME = "Atlas Area Markers";
// ⚠ A WORLD THAT ALREADY HAS ONE KEEPS ITS OLD NAME. ensureMarkerActor finds the actor by its
//   FLAG and returns before it ever looks a folder up, so renaming this cannot strand an existing
//   world's labels. Only a world with no marker actor yet gets a folder under the new name.
const MARKER_FOLDER = "Atlas (do not delete)";
const MARKER_SHEET_ID = "atlas.AtlasMarkerSheet";   // registered stub sheet key (→ flags.core.sheetClass)

// ---------- pure helpers (testable) ----------

// average of a polygon's vertices — a simple, robust "where to put the label" point
export function centroid(points) {
  const n = (points?.length ?? 0) / 2;
  if (n < 1) return { x: 0, y: 0 };
  let sx = 0, sy = 0;
  for (let i = 0; i < n; i++) { sx += points[i * 2]; sy += points[i * 2 + 1]; }
  return { x: sx / n, y: sy / n };
}

// the 4-point polygon for a rectangle (the trivial room shape)
export function rectPoints(x, y, w, h) {
  return [x, y, x + w, y, x + w, y + h, x, y + h];
}

// the player-facing label text: "A. Front Room" (named) or just "A" (unnamed)
export function formatLabel(label, name) {
  const n = (name ?? "").trim();
  return n ? `${label}. ${n}` : `${label}`;
}

// The letter is AUTHORING plumbing. It shows while the map is unlocked, so you can
// find, name and grab rooms; locking the map is the "done building" signal, and the
// letters drop away leaving only what you actually wrote. The matrix keeps them.
export function labelTextFor(label, name, locked = false) {
  return locked ? String(name ?? "").trim() : formatLabel(label, name);
}

// What a label's texture was last drawn for. rebuildLabels redraws any label whose
// stamp differs, which doubles as the migration for labels made before the sliders.
export function labelSig(fs, locked = false) {
  return `${fs}|${locked ? 1 : 0}`;
}

// ---------- textures (browser canvas → data URL; no PNG assets) ----------
const _texCache = new Map();

// a letter disc — used for UNNAMED rooms (just the letter, no name)
export function generateLetterTexture(letter, size = 64) {
  const key = `disc:${letter}-${size}`;
  if (_texCache.has(key)) return _texCache.get(key);
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#15131e";
  ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = "#c4313d"; ctx.stroke();
  ctx.fillStyle = "#fff";
  // a label past Z is two or three glyphs wide, so shrink the type to keep it inside the disc
  const txt = String(letter);
  ctx.font = `bold ${Math.floor(size * 0.5 * Math.min(1, 1.6 / Math.max(1, txt.length)))}px sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(txt, size / 2, size / 2 + 1);
  const url = c.toDataURL();
  _texCache.set(key, url);
  return url;
}

// a rounded, boxed label — used for NAMED rooms ("A. Front Room"). Returns { url, w, h } in px.
export function generateLabelTexture(text, fs = LABEL_FS_DEFAULT) {
  const key = `label:${fs}:${text}`;
  if (_texCache.has(key)) return _texCache.get(key);
  const measure = document.createElement("canvas").getContext("2d");
  measure.font = `bold ${fs}px sans-serif`;
  const tw = Math.ceil(measure.measureText(String(text)).width);
  // padding rides the font size, so the box stays the same shape at every slider setting
  const padX = Math.round(fs * 0.55), padY = Math.round(fs * 0.3);
  const w = tw + padX * 2, h = fs + padY * 2;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(1, 1, w - 2, h - 2, 9); else ctx.rect(1, 1, w - 2, h - 2);
  ctx.fillStyle = "rgba(13,11,20,0.9)"; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = "#3d7bd0"; ctx.stroke();
  ctx.fillStyle = "#fff"; ctx.font = `bold ${fs}px sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(String(text), w / 2, h / 2 + 1);
  const res = { url: c.toDataURL(), w, h };
  _texCache.set(key, res);
  return res;
}

// A small door, drawn once and reused. Generated rather than shipped as a file so the module stays
// a scripts-and-styles package, the same reason the room labels generate their own textures.
//
// ⚠ Drawn UPRIGHT, never rotated to follow its line. A door icon lying on its side reads as a hole
//   rather than a door, and the line beneath it already says which way the connection runs.
const DOOR_PX = 30;
let _door = null;
export function doorTexture() {
  if (_door) return _door;
  const S = DOOR_PX;
  const c = document.createElement("canvas");
  c.width = S; c.height = S;
  const ctx = c.getContext("2d");
  // a dark disc, so the icon reads over a bright map as well as a dark one
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S / 2 - 1.5, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(13,11,20,0.92)"; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = "#5b9bff"; ctx.stroke();
  // the door leaf
  const w = S * 0.36, h = S * 0.52, x = (S - w) / 2, y = (S - h) / 2;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, [3, 3, 1, 1]); else ctx.rect(x, y, w, h);
  ctx.fillStyle = "#ece8fb"; ctx.fill();
  // and its handle
  ctx.beginPath();
  ctx.arc(x + w - 2.6, S / 2 + 1, 1.5, 0, Math.PI * 2);
  ctx.fillStyle = "#0d0b14"; ctx.fill();
  _door = c.toDataURL();
  return _door;
}

// ---------- the module's own marker actor (temp folder, auto-picked type) ----------
//
// ⚠⚠ THE ACTOR IS A PERMISSION ANCHOR, NOT A TOKEN REQUIREMENT. Foundry is perfectly happy with an
// actorless token: the schema allows it and the canvas draws it. Do NOT "tidy this away" on that
// basis. TokenDocument#getUserLevel ends
//     return user.isGM || !this.actorId ? OWNER : NONE;
// so a token with no actor makes EVERY player its OWNER, and a token carries no ownership field of
// its own to override that. _canControl needs only canUserModify(user,"update") and _canDrag only
// wants the select tool, so players could select and DRAG room labels, and a dragged label moves
// the room, because redrawAreas anchors each polygon to its label's centre. This actor is created
// with no ownership key, so it defaults to {default: NONE}, and that is the only thing holding the
// door shut. It was not designed that way; it is load-bearing regardless.
//
// ⚠ It is also what keeps Token#_canView truthy, and _canView is the permission clickLeft2 consults.
// Without an actor it returns undefined and fires a false "Actor no longer exists" toast, so
// double-clicking a label to open the room panel would simply stop working.
export async function ensureMarkerActor() {
  const scope = CONFIG.flagScope;
  let actor = game.actors.find(a => a.getFlag?.(scope, "markerActor"));
  if (actor) return actor;
  const types = (game.documentTypes?.Actor ?? []).filter(t => t !== "base");
  const type = CONFIG.markerActorType || types[0] || "base";
  let folder = game.folders.find(f => f.type === "Actor" && f.name === MARKER_FOLDER && !f.folder)
    ?? await Folder.create({ name: MARKER_FOLDER, type: "Actor" });
  actor = await Actor.create({
    name: MARKER_ACTOR_NAME, type, folder: folder.id,
    // point it at our tiny stub sheet so opening it never loads the full system character sheet
    flags: { [scope]: { markerActor: true }, core: { sheetClass: MARKER_SHEET_ID } }
  });
  return actor;
}

// ---------- the marker's stub sheet: a tiny read-only card instead of the full system sheet ----------
// Registered per-MODULE and assigned ONLY to our marker actor (via flags.core.sheetClass) — every
// system actor keeps its normal sheet. The class is built lazily (references Foundry globals) so this
// file still imports cleanly in Node.
function buildMarkerSheetClass() {
  const Base = foundry.applications?.sheets?.ActorSheetV2;
  if (!Base) return null;
  return class AtlasMarkerSheet extends Base {
    static DEFAULT_OPTIONS = {
      classes: ["atlas-marker-sheet"],
      window: { title: "Atlas Marker", icon: "fa-solid fa-draw-polygon" },
      position: { width: 340, height: "auto" },
      form: { submitOnChange: false, closeOnSubmit: false },
      sheetConfig: false
    };
    // the room this sheet was opened for — only when launched from a canvas MARKER token (unlinked, so
    // this.actor.token is its TokenDocument, which carries the room label). Sidebar actor → null.
    _getRoomContext() {
      try {
        const tok = this.actor?.token ?? this.token ?? null;
        if (!tok) return null;
        const marker = tok.flags?.[CONFIG.flagScope]?.areaMarker;
        const scene = tok.parent;
        if (!marker?.label || !scene) return null;
        const area = readAreaData(scene).areas?.[marker.label];
        if (!area) return null;
        return { scene, label: marker.label, area, name: marker.name || area.name || "" };
      } catch (_) { return null; }
    }

    get title() {
      const ctx = this._getRoomContext();
      return ctx ? `Room ${ctx.label}${ctx.name ? ` — ${ctx.name}` : ""}` : "Atlas Marker";
    }

    // STAGED edits: LOS toggles and effect toggles collect on the sheet and commit in ONE write when
    // the GM hits Apply (which also closes). Closing with ✕ discards. The shapes and the toggle rules
    // live in ⚓ room-card.mjs, shared with the control panel, which writes through instead of staging.
    _stage() { return this._staged ??= emptyStage(); }
    _dirty() { return stageDirty(this._stage()); }

    // ⚓ room-card.mjs owns the markup. `staging: true` is the default: this surface shows the amber
    // staged state and the Apply footer, where the control panel commits on each click and shows neither.
    async _renderHTML() {
      return roomCardHTML(this._getRoomContext(), { staged: this._stage(), defs: CONFIG.areaEffects });
    }

    _replaceHTML(result, content) {
      content.innerHTML = result;
      if (!content._atlasBound) {
        content._atlasBound = true;
        content.addEventListener("click", (ev) => this._onCardClick(ev));
      }
    }

    async _onCardClick(ev) {
      const ctx = this._getRoomContext();
      if (!ctx) return;
      const hit = cardTarget(ev.target);
      if (!hit) return;
      ev.preventDefault();
      if (hit.kind === "apply") return this._onApply(ctx);
      stageClick(ctx.area, this._stage(), hit);
      this.render();
    }

    // Apply: ONE flag write (staged effect lays/removals first — Web's LOS-writes land — then the GM's
    // explicit staged toggles, so a hand-set toggle always wins), the retint from the final stack, then close.
    async _onApply(ctx) {
      const st = this._stage();
      if (!this._dirty()) return this.close();
      let data = readAreaData(ctx.scene);
      const fxChanged = Object.keys(st.effects).length > 0;
      for (const [id, want] of Object.entries(st.effects)) {
        data = want ? layEffect(data, ctx.label, id, CONFIG.areaEffects) : removeEffect(data, ctx.label, id);
      }
      for (const [field, value] of Object.entries(st.los)) data = setLOS(data, ctx.label, field, value);
      await writeAreaData(ctx.scene, data);                // one write → fog + editor refresh themselves
      if (fxChanged) await retintFromData(ctx.scene, ctx.label, data);
      this._staged = emptyStage();
      return this.close();
    }

    _onClose(options) {
      this._staged = emptyStage();                         // ✕ discards staged edits
      return super._onClose?.(options);
    }
  };
}

// register the stub sheet + retro-fit any already-created marker actor (called once, at ready)
export function registerMarkerSheet() {
  const cls = buildMarkerSheetClass();
  const DSC = foundry.applications?.apps?.DocumentSheetConfig ?? globalThis.DocumentSheetConfig;
  if (!cls || !DSC) { console.warn("Atlas | ActorSheetV2 / DocumentSheetConfig unavailable — marker keeps the system sheet"); return; }
  const types = (game.documentTypes?.Actor ?? []).filter(t => t !== "base");
  try {
    DSC.registerSheet(Actor, "atlas", cls, { types, makeDefault: false, canBeDefault: false, label: "Atlas Marker" });
  } catch (e) { console.warn("Atlas | marker sheet registration failed", e); return; }
  // retro-fit an existing marker actor so the fix lands without recreating it
  const actor = game.actors?.find(a => a.getFlag?.(CONFIG.flagScope, "markerActor"));
  if (actor && actor.getFlag("core", "sheetClass") !== MARKER_SHEET_ID) {
    actor.setFlag("core", "sheetClass", MARKER_SHEET_ID).catch(e => console.warn("Atlas | marker sheet assign failed", e));
  }
}

// retro-fit the Image Hover opt-out onto existing marker tokens as each scene loads (GM-only, self-limiting:
// once a token has the flag it's skipped). New markers already get it at creation in dropLabel.
export function installMarkerHoverGuard() {
  Hooks.on("canvasReady", async () => {
    if (!game.user?.isGM) return;
    const scene = canvas.scene;
    if (!scene) return;
    const scope = CONFIG.flagScope;
    const fix = scene.tokens
      .filter(t => t.flags?.[scope]?.areaMarker && !t.flags?.["image-hover"]?.hideArt)
      .map(t => ({ _id: t.id, "flags.image-hover.hideArt": true }));
    if (fix.length) await scene.updateEmbeddedDocuments("Token", fix).catch(e => console.warn("Atlas | hideArt retro-fit failed", e));
  });
}

// ---------- label token: NAMED → a boxed label texture; UNNAMED → a letter disc ----------
// The texture IS the label (displayName off), so there's no redundant nameplate. The token is
// centred on the room's centroid; its full cell is the grab area for moving + Redraw.
// The position + texture a label wears at a given size and lock state, centred on
// (cx, cy). Shared by dropLabel and labels.rebuildLabels so the two can never
// disagree about where a label's centre is. Redraw anchors each room's polygon to
// that centre, so a mismatch here would drag zones across the map.
export function labelTokenData(label, name, { cx, cy, g, fs, locked = false }) {
  if (name && String(name).trim()) {
    const lab = generateLabelTexture(labelTextFor(label, name, locked), fs);
    return {
      x: Math.round(cx - lab.w / 2), y: Math.round(cy - lab.h / 2),
      width: lab.w / g, height: lab.h / g,                 // render the box 1:1 (no stretch)
      texture: { src: lab.url, scaleX: 1, scaleY: 1 }
    };
  }
  const s = discScale(fs);                                 // a small letter disc, centred in the cell
  return {
    x: Math.round(cx - g / 2), y: Math.round(cy - g / 2),  // (the full cell stays the grab area)
    width: 1, height: 1,
    texture: { src: generateLetterTexture(label), scaleX: s, scaleY: s }
  };
}

export async function dropLabel(scene, label, x, y, name = "") {
  scene = scene ?? canvas.scene;
  const scope = CONFIG.flagScope;
  const actor = await ensureMarkerActor();
  const g = canvas.grid.size;
  const locked = !!scene.getFlag(scope, "areasLocked");
  const fs = labelFontSize();

  const [tok] = await scene.createEmbeddedDocuments("Token", [{
    actorId: actor.id, name: formatLabel(label, name), actorLink: false,
    ...labelTokenData(label, name, { cx: x, cy: y, g, fs, locked }),
    displayName: CONST.TOKEN_DISPLAY_MODES.NONE,           // the texture IS the label — no nameplate
    disposition: CONST.TOKEN_DISPOSITIONS.NEUTRAL,
    sight: { enabled: false },
    lockRotation: true, locked, sort: -9999,
    // hideArt → the Image Hover module skips our label tokens (no giant portrait on hover)
    flags: {
      [scope]: { areaMarker: { label, name, sig: labelSig(fs, locked) } },
      "image-hover": { hideArt: true }
    }
  }]);
  return tok;
}

// ---------- room outline drawing (cosmetic; so everyone sees the map) ----------
// The outline is rebuilt from scratch on every redraw, so it re-derives its own tint
// from the room's effect stack rather than taking stock colours: without that, one
// Redraw would strip the tint off every webbed / burning / smoky room on the map.
export async function drawRoomOutline(scene, label, points) {
  scene = scene ?? canvas.scene;
  const scope = CONFIG.flagScope;
  const old = scene.drawings.filter(d => d.flags?.[scope]?.areaRoom === label).map(d => d.id);
  if (old.length) await scene.deleteEmbeddedDocuments("Drawing", old);
  const locked = !!scene.getFlag(scope, "areasLocked");   // preserve lock across redraws
  const data = readAreaData(scene);
  const tint = stackTint(data.areas?.[label]?.effects, CONFIG.areaEffects);
  // ⚠ A hidden room keeps its hatch through a redraw. Building the style from the effect tint alone
  //   meant Redraw, and now a move, handed a blacked-out room an ordinary room's look.
  await scene.createEmbeddedDocuments("Drawing", [{
    x: 0, y: 0, locked,
    shape: { type: "p", points: [...points] },
    ...(isBlackedOut(data, label) ? blackoutStyle() : overlayStyle(tint)),
    strokeWidth: 3,
    sort: -9998,
    flags: { [scope]: { areaRoom: label } }
  }]);
}

// ---------- connection LINES (line of travel — room to room, drawn for everyone) ----------
/**
 * Slide a room: its polygon, its outline, and every line that meets it.
 *
 * ⚠ THE LABEL DOES NOT RIDE ALONG (user, 2026-09-23: "if i click move and move the box do not also
 *   move the lable ... i would like to be able to move lables around independtaly of the box"). A
 *   label is a name plate you put where it reads best, not a pin the room hangs from. Dragging the
 *   label moves only the label; this moves only the room.
 * ⚠ That is ONLY safe because Redraw no longer re-anchors polygons to label centres. If that ever
 *   comes back, every independently placed label starts dragging its room around again.
 */
export async function moveArea(scene, label, dx, dy) {
  scene = scene ?? canvas.scene;
  if (!game.user?.isGM || !scene) return null;
  const data = readAreaData(scene);
  const shape = data.areas?.[label]?.shape;
  if (!shape?.length) return null;

  const moved = translateShape(shape, dx, dy);
  await writeAreaData(scene, setShape(data, label, moved));

  await drawRoomOutline(scene, label, moved);
  await drawConnections(scene);                    // the lines meet the room's new edge
  return label;
}

export async function drawConnections(scene) {
  scene = scene ?? canvas.scene;
  if (!game.user?.isGM) return;
  const scope = CONFIG.flagScope;
  const data = readAreaData(scene);
  const old = scene.drawings.filter(d => d.flags?.[scope]?.areaLine).map(d => d.id);
  if (old.length) await scene.deleteEmbeddedDocuments("Drawing", old);
  const locked = !!scene.getFlag(scope, "areasLocked");   // preserve lock across redraws
  const draws = [];
  for (const [a, b] of (data.connections || [])) {
    const sa = data.areas[a]?.shape, sb = data.areas[b]?.shape;
    if (!sa || !sb) continue;
    const ca = centroid(sa), cb = centroid(sb);
    // clip each end to its room's edge → the line spans the GAP between rooms (never pierces a centre)
    const start = clipToPolygon(ca.x, ca.y, cb.x, cb.y, sa);
    const end = clipToPolygon(cb.x, cb.y, ca.x, ca.y, sb);
    draws.push({
      x: 0, y: 0, locked,
      shape: { type: "p", points: [start.x, start.y, end.x, end.y] },
      strokeColor: "#ffffff", strokeAlpha: 0.7, strokeWidth: 5, fillType: 0,
      // ⚠ THE PAIR IS STAMPED ON THE DRAWING. A line is a document every client receives, and
      //   blackout.mjs has to decide per client whether to paint it, which it cannot do from a
      //   bare "this is a line" flag. Without the pair a hidden room still had white lines
      //   converging on an empty patch of map, which is most of the way to giving it away.
      sort: -9997, flags: { [scope]: { areaLine: true, areaPair: `${a}|${b}` } }
    });
    // A DOORWAY rides the middle of its own line. It is built here, in the same sweep that rebuilds
    // the lines, so it can never be left behind on a connection that moved or went away: everything
    // flagged areaLine is deleted at the top of this function and made again from the data.
    // ⚠ The rect is exactly the texture's size, so a PATTERN fill tiles it precisely once.
    if (hasDoorway(data, a, b)) {
      const mx = (start.x + end.x) / 2, my = (start.y + end.y) / 2;
      draws.push({
        x: Math.round(mx - DOOR_PX / 2), y: Math.round(my - DOOR_PX / 2), locked,
        shape: { type: "r", width: DOOR_PX, height: DOOR_PX },
        fillType: 2, texture: doorTexture(), fillColor: "#ffffff", fillAlpha: 1,
        strokeAlpha: 0, strokeWidth: 0,
        sort: -9996,                                  // just above its line, still under every token
        flags: { [scope]: { areaLine: true, areaDoor: `${a}|${b}`, areaPair: `${a}|${b}` } }
      });
    }
  }
  if (draws.length) await scene.createEmbeddedDocuments("Drawing", draws);
}

// ---------- redraw: re-anchor each room to its (possibly moved) letter marker, then refresh ----------
// Move a room by dragging its letter token, then hit Redraw: the polygon translates so its centroid
// follows the marker, and outlines + connection lines are rebuilt.
/**
 * Repaint every room outline and every connection line from the stored shapes.
 *
 * ⚠⚠ THIS USED TO MOVE ROOMS. It re-anchored each polygon to its label's centre, which was how a
 *    room was moved before move mode existed: drag the label, then press this. That is gone (user,
 *    2026-09-23), because labels are now placed freely and re-anchoring would have dragged every
 *    room to wherever its name plate happened to look best. Move a room with MOVE MODE instead.
 *    What is left is a repair: rebuild the drawings when one has been deleted or has drifted.
 */
export async function redrawAreas(scene) {
  scene = scene ?? canvas.scene;
  if (!game.user?.isGM) return;
  const data = readAreaData(scene);
  for (const [label, area] of Object.entries(data.areas || {})) {
    if (area.shape?.length) await drawRoomOutline(scene, label, area.shape);
  }
  await drawConnections(scene);
}

// ---------- lock/unlock the marker tokens (GM safety so they aren't bumped) ----------
export async function toggleLock(scene) {
  scene = scene ?? canvas.scene;
  return setLock(scene, !scene.getFlag(CONFIG.flagScope, "areasLocked"));
}

/** Lock or unlock every room, label and line. Move mode borrows this and puts it back after. */
export async function setLock(scene, next) {
  scene = scene ?? canvas.scene;
  const scope = CONFIG.flagScope;
  next = !!next;
  const toks = scene.tokens.filter(t => t.flags?.[scope]?.areaMarker).map(t => ({ _id: t.id, locked: next }));
  if (toks.length) await scene.updateEmbeddedDocuments("Token", toks);
  // lock the room outlines + travel lines too — not just the labels — so nothing gets bumped
  const draws = scene.drawings
    .filter(d => d.flags?.[scope]?.areaRoom || d.flags?.[scope]?.areaLine)
    .map(d => ({ _id: d.id, locked: next }));
  if (draws.length) await scene.updateEmbeddedDocuments("Drawing", draws);
  await scene.setFlag(scope, "areasLocked", next);
  return next;
}

// ---------- the combined "make a room from a traced polygon" call ----------
export async function placeRoom(scene, points, label, name = "") {
  scene = scene ?? canvas.scene;
  if (!points || points.length < 6) { ui.notifications?.warn("Atlas: a room needs at least 3 points."); return null; }
  const data = readAreaData(scene);
  label = label ?? nextLabel(data);
  if (!label) { ui.notifications?.warn("Atlas: could not allocate an area label."); return null; }
  await writeAreaData(scene, setArea(data, label, defaultAreaRecord(label, points, name)));
  const c = centroid(points);
  await dropLabel(scene, label, c.x, c.y, name);
  await drawRoomOutline(scene, label, points);
  await drawConnections(scene);
  return label;
}

/**
 * Replace a room's OUTLINE and nothing else.
 *
 * Its letter, its name, its In/Out/Through, its effects, its blackout, its connections and the
 * doorways on them are all untouched, which is the whole point: a room traced badly the first time
 * can be traced again without being rebuilt (user, 2026-09-23: "all the other settings connect to
 * the new drawing").
 *
 * ⚠ THE LABEL DOES NOT FOLLOW. It is a name plate placed by hand, exactly as for a move.
 * ⚠ Connection lines are clipped to each room's EDGE, so every line touching this room is wrong
 *   the moment its outline changes. drawConnections rebuilds the lot from the data.
 */
export async function reshapeRoom(scene, label, points) {
  scene = scene ?? canvas.scene;
  if (!game.user?.isGM || !scene) return false;
  if (!points || points.length < 6) { ui.notifications?.warn("Atlas: a room needs at least 3 points."); return false; }
  const data = readAreaData(scene);
  if (!data.areas?.[label]) { ui.notifications?.warn(`Atlas: room ${label} is not on this scene.`); return false; }
  await writeAreaData(scene, setShape(data, label, points));
  await drawRoomOutline(scene, label, points);
  await drawConnections(scene);
  return true;
}

// ---------- rename ----------
// A room's name lives in TWO places: the area record, which the matrix and the LOS
// table read, and the marker token, which has the name baked into its texture. Both
// move together here, or the panel and the map disagree about what a room is called.
//
// Clearing the name is a legal rename: the label falls back to a letter disc, which
// players never see and which vanishes for everyone once the map is locked.
export async function renameArea(scene, label, name) {
  scene = scene ?? canvas.scene;
  if (!game.user?.isGM) return false;
  const scope = CONFIG.flagScope;
  const clean = String(name ?? "").trim();
  const data = readAreaData(scene);
  if (!data.areas?.[label] || (data.areas[label].name ?? "") === clean) return false;
  await writeAreaData(scene, setName(data, label, clean));

  const tok = scene.tokens.find(t => t.flags?.[scope]?.areaMarker?.label === label);
  if (!tok) return true;
  const g = canvas.grid.size;
  const fs = labelFontSize();
  const locked = !!scene.getFlag(scope, "areasLocked");
  // the marker's CENTRE must survive the resize: Redraw anchors this room's polygon
  // to it, so a shift here would drag the whole zone across the map
  const cx = tok.x + ((tok.width || 1) * g) / 2;
  const cy = tok.y + ((tok.height || 1) * g) / 2;
  await scene.updateEmbeddedDocuments("Token", [{
    _id: tok.id,
    name: formatLabel(label, clean),
    ...labelTokenData(label, clean, { cx, cy, g, fs, locked }),
    [`flags.${scope}.areaMarker.name`]: clean,
    [`flags.${scope}.areaMarker.sig`]: labelSig(fs, locked)
  }]);
  return true;
}

// ---------- removal ----------
export async function removeMarker(scene, label) {
  scene = scene ?? canvas.scene;
  const scope = CONFIG.flagScope;
  const toks = scene.tokens.filter(t => t.flags?.[scope]?.areaMarker?.label === label).map(t => t.id);
  if (toks.length) await scene.deleteEmbeddedDocuments("Token", toks);
  const dr = scene.drawings.filter(d => d.flags?.[scope]?.areaRoom === label).map(d => d.id);
  if (dr.length) await scene.deleteEmbeddedDocuments("Drawing", dr);
  // setFlag MERGES — a plain write will NOT drop the removed area's key (the letter would linger in the
  // matrix + the hover highlight keeps drawing its shape). Delete the subkey explicitly with the `-=`
  // deletion token, and rewrite the pruned connections array, in one update.
  const pruned = removeArea(readAreaData(scene), label);
  await scene.update({
    [`flags.${scope}.areaData.areas.-=${label}`]: null,
    [`flags.${scope}.areaData.connections`]: pruned.connections,
    // ⚠ and its DOORWAYS. removeArea prunes them, but this write only carried the connections, so a
    //   deleted room left its sight blocks behind on links that no longer existed.
    ...(pruned.doorways ? { [`flags.${scope}.areaData.doorways`]: pruned.doorways } : {}),
  });
  await drawConnections(scene);                                   // re-draw travel lines without the dropped room
}

export async function clearAllAreas(scene) {
  scene = scene ?? canvas.scene;
  const scope = CONFIG.flagScope;
  const toks = scene.tokens.filter(t => t.flags?.[scope]?.areaMarker).map(t => t.id);
  if (toks.length) await scene.deleteEmbeddedDocuments("Token", toks);
  const dr = scene.drawings.filter(d => d.flags?.[scope]?.areaRoom || d.flags?.[scope]?.areaLine).map(d => d.id);
  if (dr.length) await scene.deleteEmbeddedDocuments("Drawing", dr);
  await scene.unsetFlag(scope, "areaData");
  await scene.unsetFlag(scope, "areasLocked");
}
