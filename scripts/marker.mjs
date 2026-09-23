// A.T.L.A.S. — markers & rooms (the engine). A "room" is a traced polygon (the area shape); a
// "marker" is a small lettered, player-VISIBLE label token dropped inside it. The module owns its
// own marker actor in its own temp folder (auto-picks a valid actor type — never borrows a system one).
//
// Pure helpers (centroid, rectPoints) are unit-tested; the Foundry document work runs at call time only,
// so this file still imports cleanly in Node.
import { CONFIG } from "./config.mjs";
import { labelFontSize, discScale, overlayStyle, LABEL_FS_DEFAULT } from "./settings.mjs";
import { clipToPolygon } from "./los.mjs";
import {
  readAreaData, writeAreaData, setArea, setShape, setLOS, setName, removeArea, defaultAreaRecord,
  nextLabel, layEffect, removeEffect, stackTint
} from "./data.mjs";
import { retintFromData } from "./effects.mjs";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const MARKER_ACTOR_NAME = "ATLAS Area Markers";
const MARKER_FOLDER = "A.T.L.A.S. (do not delete)";
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

// ---------- the module's own marker actor (temp folder, auto-picked type) ----------
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
      window: { title: "A.T.L.A.S. Marker", icon: "fa-solid fa-draw-polygon" },
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
      return ctx ? `Room ${ctx.label}${ctx.name ? ` — ${ctx.name}` : ""}` : "A.T.L.A.S. Marker";
    }

    // STAGED edits: LOS toggles + the effect toggles collect on the sheet and commit in ONE write when the
    // GM hits Apply (which also closes). Closing with ✕ discards. `los` holds only fields that DIFFER from
    // the committed state; `effects` holds only id→bool DELTAS (true = lay it, false = remove it). Effects
    // STACK — each button is an independent on/off; the None chip stages everything off.
    _stage() { return this._staged ??= { los: {}, effects: {} }; }
    _dirty() { const st = this._stage(); return Object.keys(st.los).length > 0 || Object.keys(st.effects).length > 0; }

    async _renderHTML() {
      const ctx = this._getRoomContext();
      if (!ctx) {
        return `<div class="atlas-marker-card">
          <i class="fa-solid fa-draw-polygon"></i>
          <h3>Area-label host</h3>
          <p>This hidden actor only backs the room labels A.T.L.A.S. drops on your scenes. There's nothing to edit here — please don't delete it.</p>
        </div>`;
      }
      const st = this._stage();
      const tog = (field, label, hint) => {
        const shown = st.los[field] ?? (ctx.area[field] !== false);
        const staged = field in st.los;
        return `<button type="button" class="atlas-mc-tog${shown ? " on" : ""}${staged ? " staged" : ""}" data-atlas-los="${field}" title="${esc(hint)}">
            <i class="fa-solid ${shown ? "fa-eye" : "fa-eye-slash"}"></i>
            <span class="atlas-mc-t">${label}</span>
            <span class="atlas-mc-s">${shown ? "on" : "off"}</span>
          </button>`;
      };
      // Effects STACK — each button shows its own desired state: staged delta if present, else committed.
      const committed = new Set((ctx.area.effects ?? []).map((e) => e?.id).filter(Boolean));
      const desired = (id) => st.effects[id] ?? committed.has(id);
      const fxBtn = (id, def) => {
        const on = desired(id);
        return `<button type="button" class="atlas-mc-fx${on ? " on" : ""}${id in st.effects ? " staged" : ""}" data-atlas-fx="${id}"
            title="${esc(def.label)}${def.los ? " — seals this room's LOS In/Out when applied" : ""}">
            <i class="fa-solid ${def.icon}"></i><span>${esc(def.label)}</span>
          </button>`;
      };
      const fxIds = Object.keys(CONFIG.areaEffects ?? {});
      const fxRow = fxIds.map((id) => fxBtn(id, CONFIG.areaEffects[id])).join("");
      const clearOn = fxIds.every((id) => !desired(id));
      const dirty = this._dirty();
      return `<div class="atlas-marker-card atlas-los-card">
        <div class="atlas-mc-room"><b>${esc(ctx.label)}</b>${ctx.name ? ` · ${esc(ctx.name)}` : ""}</div>
        <p class="atlas-mc-hint">Stage line-of-sight + effect changes, then Apply. ✕ discards.</p>
        <div class="atlas-mc-los">
          ${tog("losIn", "In", "Can this room be seen INTO from outside?")}
          ${tog("losOut", "Out", "Can tokens in it see / shoot OUT?")}
          ${tog("losThrough", "Through", "Can sight pass THROUGH it to somewhere beyond?")}
        </div>
        <div class="atlas-mc-sec">Effect</div>
        <div class="atlas-mc-fxrow">
          ${fxRow}
          <button type="button" class="atlas-mc-fx clear${clearOn ? " on" : ""}" data-atlas-fx="" title="Stage ALL effects off (LOS stays as it stands — re-toggle by hand)">
            <i class="fa-solid fa-ban"></i><span>None</span>
          </button>
        </div>
        <div class="atlas-mc-foot">
          <button type="button" class="atlas-mc-apply" data-atlas-apply ${dirty ? "" : "disabled"}><i class="fa-solid fa-check"></i> Apply</button>
          <span class="atlas-mc-note">${dirty ? "staged — Apply commits & closes" : "no changes staged"}</span>
        </div>
      </div>`;
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
      const st = this._stage();
      const losBtn = ev.target.closest("[data-atlas-los]");
      const fxBtn = ev.target.closest("[data-atlas-fx]");
      const apply = ev.target.closest("[data-atlas-apply]");
      if (!losBtn && !fxBtn && !apply) return;
      ev.preventDefault();
      if (losBtn) {                                        // stage a toggle; back-to-committed drops the key
        const field = losBtn.dataset.atlasLos;
        const cur = ctx.area[field] !== false;
        const next = !(st.los[field] ?? cur);
        if (next === cur) delete st.los[field]; else st.los[field] = next;
      } else if (fxBtn) {                                  // toggle one effect's desired state ("" = the None chip)
        const committed = new Set((ctx.area.effects ?? []).map((e) => e?.id).filter(Boolean));
        const id = fxBtn.dataset.atlasFx || null;
        if (id === null) {                                 // None: stage every effect off
          st.effects = {};
          for (const cid of committed) st.effects[cid] = false;
        } else {
          const next = !(st.effects[id] ?? committed.has(id));
          if (next === committed.has(id)) delete st.effects[id]; else st.effects[id] = next;
        }
      } else if (apply) {
        return this._onApply(ctx);
      }
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
      this._staged = { los: {}, effects: {} };
      return this.close();
    }

    _onClose(options) {
      this._staged = { los: {}, effects: {} };             // ✕ discards staged edits
      return super._onClose?.(options);
    }
  };
}

// register the stub sheet + retro-fit any already-created marker actor (called once, at ready)
export function registerMarkerSheet() {
  const cls = buildMarkerSheetClass();
  const DSC = foundry.applications?.apps?.DocumentSheetConfig ?? globalThis.DocumentSheetConfig;
  if (!cls || !DSC) { console.warn("ATLAS | ActorSheetV2 / DocumentSheetConfig unavailable — marker keeps the system sheet"); return; }
  const types = (game.documentTypes?.Actor ?? []).filter(t => t !== "base");
  try {
    DSC.registerSheet(Actor, "atlas", cls, { types, makeDefault: false, canBeDefault: false, label: "A.T.L.A.S. Marker" });
  } catch (e) { console.warn("ATLAS | marker sheet registration failed", e); return; }
  // retro-fit an existing marker actor so the fix lands without recreating it
  const actor = game.actors?.find(a => a.getFlag?.(CONFIG.flagScope, "markerActor"));
  if (actor && actor.getFlag("core", "sheetClass") !== MARKER_SHEET_ID) {
    actor.setFlag("core", "sheetClass", MARKER_SHEET_ID).catch(e => console.warn("ATLAS | marker sheet assign failed", e));
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
    if (fix.length) await scene.updateEmbeddedDocuments("Token", fix).catch(e => console.warn("ATLAS | hideArt retro-fit failed", e));
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
  const tint = stackTint(readAreaData(scene).areas?.[label]?.effects, CONFIG.areaEffects);
  await scene.createEmbeddedDocuments("Drawing", [{
    x: 0, y: 0, locked,
    shape: { type: "p", points: [...points] },
    ...overlayStyle(tint),
    strokeWidth: 3,
    sort: -9998,
    flags: { [scope]: { areaRoom: label } }
  }]);
}

// ---------- connection LINES (line of travel — room to room, drawn for everyone) ----------
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
      sort: -9997, flags: { [scope]: { areaLine: true } }
    });
  }
  if (draws.length) await scene.createEmbeddedDocuments("Drawing", draws);
}

// ---------- redraw: re-anchor each room to its (possibly moved) letter marker, then refresh ----------
// Move a room by dragging its letter token, then hit Redraw: the polygon translates so its centroid
// follows the marker, and outlines + connection lines are rebuilt.
export async function redrawAreas(scene) {
  scene = scene ?? canvas.scene;
  if (!game.user?.isGM) return;
  const scope = CONFIG.flagScope;
  let data = readAreaData(scene);
  const g = canvas.grid.size;
  for (const [label, area] of Object.entries(data.areas || {})) {
    const tok = scene.tokens.find(t => t.flags?.[scope]?.areaMarker?.label === label);
    if (!tok || !area.shape?.length) continue;
    const mcx = tok.x + ((tok.width || 1) * g) / 2;     // marker centre (current position)
    const mcy = tok.y + ((tok.height || 1) * g) / 2;
    const c = centroid(area.shape);
    const ddx = mcx - c.x, ddy = mcy - c.y;
    if (Math.abs(ddx) < 0.5 && Math.abs(ddy) < 0.5) continue;   // marker hasn't moved → leave it
    data = setShape(data, label, area.shape.map((v, i) => (i % 2 === 0 ? v + ddx : v + ddy)));
  }
  await writeAreaData(scene, data);
  for (const [label, area] of Object.entries(data.areas || {})) {
    if (area.shape?.length) await drawRoomOutline(scene, label, area.shape);
  }
  await drawConnections(scene);
}

// ---------- lock/unlock the marker tokens (GM safety so they aren't bumped) ----------
export async function toggleLock(scene) {
  scene = scene ?? canvas.scene;
  const scope = CONFIG.flagScope;
  const next = !scene.getFlag(scope, "areasLocked");
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
  if (!points || points.length < 6) { ui.notifications?.warn("ATLAS: a room needs at least 3 points."); return null; }
  const data = readAreaData(scene);
  label = label ?? nextLabel(data);
  if (!label) { ui.notifications?.warn("ATLAS: could not allocate an area label."); return null; }
  await writeAreaData(scene, setArea(data, label, defaultAreaRecord(label, points, name)));
  const c = centroid(points);
  await dropLabel(scene, label, c.x, c.y, name);
  await drawRoomOutline(scene, label, points);
  await drawConnections(scene);
  return label;
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
    [`flags.${scope}.areaData.connections`]: pruned.connections
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
