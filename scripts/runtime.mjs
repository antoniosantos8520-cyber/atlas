// A.T.L.A.S. — the RUNTIME (the hard part). Per-client, live, automatic fog of war.
//
// This is Foundry glue around the already-tested pure core (los.mjs). It:
//   1) overrides Token.prototype.isVisible so EACH client filters tokens by its own LOS — NOT the
//      global `hidden` flag (that would blank a token for everyone). The tokens stay un-hidden;
//      every client decides for itself what to draw.
//   2) computes the local player's visible-area set (their rooms + everything reachable by hasLOS),
//      cached 200ms (isVisible is read constantly).
//   3) a refreshToken boundary sensor: when MY token crosses a room edge, invalidate the cache +
//      request a visibility refresh → enemies/players hide & reveal live as anyone moves.
//   4) SELF-GATES: on any scene without area data, every path is a cheap no-op.
//
// All Foundry calls live inside functions (nothing runs at import) so the file parses in Node too.
import { CONFIG } from "./config.mjs";
import { tokenArea, reachableAreas, neighbors } from "./los.mjs";

let _installed = false;
let _origIsVisible = null;
const _lastArea = new Map();                          // my tokenId → last area label (sensor change-detection)
let _cache = { time: 0, visible: null, own: null, data: null };

// read the scene's area data raw (no clone — read-only, hot path); null if the scene has no areas
function peekAreaData() {
  const raw = canvas?.scene?.getFlag(CONFIG.flagScope, "areaData");
  return (raw && raw.areas && Object.keys(raw.areas).length) ? raw : null;
}

function invalidateCache() { _cache.time = 0; }

// the set of areas the local player can currently see (cached 200ms). A token always maps to an
// area (inside, or nearest in a gap), so this is never empty while the player has a token on-scene.
function localVisibleAreas() {
  const now = Date.now();
  if (now - _cache.time < 200 && _cache.data) return _cache;
  const data = peekAreaData();
  if (!data) { _cache = { time: now, visible: null, sensed: null, own: null, data: null }; return _cache; }
  const own = new Set();
  for (const tok of canvas.tokens?.placeables ?? []) {
    const doc = tok.document;
    if (!CONFIG.isOwnView(doc)) continue;             // only my own tokens seed my view
    if (doc.flags?.[CONFIG.flagScope]?.areaMarker) continue;
    const area = tokenArea(tok.center.x, tok.center.y, data.areas);
    if (area) own.add(area);
  }
  const visible = reachableAreas(data.connections || [], [...own], data.areas);
  // Host "sense" effects (e.g. tremor sense) reveal EXTRA areas beyond LOS. Tracked as SENSED, NOT seen:
  // a sensed token renders (so the player knows something's there) but as an anonymous silhouette, and
  // it NEVER gains line of sight (hasLOS is computed separately) — so it can't be targeted/attacked.
  const sensed = new Set();
  try {
    const extra = CONFIG.extraAreas?.(own, data, { neighbors });
    if (extra) for (const a of extra) if (!visible.has(a)) sensed.add(a);
  } catch (e) { console.warn("ATLAS | extraAreas hook error — ignored", e); }
  _cache = { time: now, visible, sensed, own, data };
  return _cache;
}

// ---- the per-client visibility override (the core trick) ----

// Stamped on the getter we install, so a second install can recognise our own work.
// Without it the capture below would take OUR getter as the base and recurse forever.
const PATCHED = Symbol.for("atlas.isVisible");

function installVisibilityOverride() {
  const proto = (globalThis.Token ?? foundry.canvas?.placeables?.Token)?.prototype;
  if (!proto) { console.warn("ATLAS | Token prototype not found — visibility override skipped"); return; }
  // Ask the CLASS ITSELF first. Token defines its own isVisible, the real one that
  // tests the sight polygons; PlaceableObject defines one too, and that one returns
  // true for any token that is not hidden. Reaching up the prototype chain FIRST
  // captures the permissive base and permanently shadows Token's getter, which turns
  // wall-based token vision off on every scene this module does not gate. The chain
  // is the fallback, for a Token class that stops defining its own.
  const own = Object.getOwnPropertyDescriptor(proto, "isVisible");
  if (own?.get?.[PATCHED]) return;                    // already installed
  _origIsVisible = own
    || Object.getOwnPropertyDescriptor(Object.getPrototypeOf(proto), "isVisible");
  if (!_origIsVisible?.get) { console.warn("ATLAS | isVisible getter not found — override skipped"); return; }

  Object.defineProperty(proto, "isVisible", {
    configurable: true,
    get() {
      const base = _origIsVisible.get.call(this);
      try {
        if (game.user.isGM) return base;              // GM sees everything
        if (!base) return false;                      // already invisible (native vision / manual hide)
        const doc = this.document;
        if (!CONFIG.filterToken(doc) || CONFIG.isOwnView(doc)) return base;  // marker / my own token → default
        const vis = localVisibleAreas();
        if (!vis.visible) return base;                // SELF-GATE: scene has no areas → no-op
        const area = tokenArea(this.center.x, this.center.y, vis.data.areas);
        if (!area) return true;                       // (no areas at all — defensive; self-gate covers it)
        return vis.visible.has(area) || (vis.sensed?.has(area) ?? false);  // seen OR sensed → renders
      } catch (e) {
        console.warn("ATLAS | isVisible override error — falling back to default", e);
        return base;
      }
    }
  });
  Object.getOwnPropertyDescriptor(proto, "isVisible").get[PATCHED] = true;
}

// nudge Foundry to re-evaluate every token's visibility (re-reads isVisible)
function requestVisibilityRefresh() {
  for (const t of canvas.tokens?.placeables ?? []) {
    try { t.renderFlags?.set?.({ refreshVisibility: true }); } catch (_) { /* version-guard */ }
  }
}

// Public: force an immediate visibility recompute. A host calls ATLAS.refresh() after toggling a sense
// effect so the change shows at once, without waiting on the 200ms cache or the next token move.
export function refresh() { invalidateCache(); requestVisibilityRefresh(); }

// ---- SENSED tokens: render as an anonymous black silhouette (per-client, sensing player only) ----
// A token revealed by a sense (not LOS) shows as a featureless black shape with ALL identifying detail
// hidden — you know something's there and roughly where, not whether it's a guard, a bandit, or a wolf.
// Purely local PIXI state (tint/child visibility), so it's never exposed to other players or the GM.
function silhouette(token) {
  if (token.mesh) token.mesh.tint = 0x000000;                 // solid black — image unseen
  if (token.nameplate) token.nameplate.visible = false;       // no name
  if (token.bars) token.bars.visible = false;                 // no HP bar
  if (token.effects) token.effects.visible = false;           // no status icons
  if (token.border) token.border.visible = false;             // no selection/disposition border
  if (token.tooltip) token.tooltip.visible = false;           // no elevation tooltip
  token._atlasSilhouette = true;
}

// Undo the silhouette — only what WE changed — and let Foundry recompute the real appearance.
function clearSilhouette(token) {
  if (!token._atlasSilhouette) return;
  token._atlasSilhouette = false;
  if (token.mesh) token.mesh.tint = 0xFFFFFF;                 // drop the black tint…
  // …then ask Foundry to re-derive mesh tint + child visibility from the document.
  try { token.renderFlags?.set?.({ refreshMesh: true, refreshNameplate: true, refreshBars: true, refreshEffects: true, refreshState: true }); } catch (_) { /* version-guard */ }
}

// Decide a token's appearance on THIS client each refresh: silhouette if its area is sensed-only, else
// normal. GM always sees normal. Re-applied every refresh (Foundry re-derives the sprite from the doc).
function refreshSenseAppearance(token) {
  if (game.user.isGM) return;                                 // GM sees everything as-is
  if (token.document?.flags?.[CONFIG.flagScope]?.areaMarker) return;
  const v = localVisibleAreas();
  if (!v.data) { clearSilhouette(token); return; }            // SELF-GATE: no areas → normal
  const area = tokenArea(token.center.x, token.center.y, v.data.areas);
  if (area && v.sensed?.has(area)) silhouette(token);
  else clearSilhouette(token);
}

export function installRuntime() {
  if (_installed) return;
  _installed = true;

  installVisibilityOverride();

  // Marker tokens own their clicks. Host systems patch Token.prototype for
  // their own right-click UI (radial menus, smart mice), and the marker's
  // hidden actor auto-picks a HOST actor type — so without this a room label
  // inherits whatever menu the host hangs on that type. An INSTANCE method
  // wins over any prototype patch regardless of load order; pinning core's
  // BASE implementation keeps vanilla control/HUD behavior for the GM.
  Hooks.on("drawToken", (token) => {
    if (!token.document?.flags?.[CONFIG.flagScope]?.areaMarker) return;
    const base = foundry.canvas?.placeables?.PlaceableObject?.prototype?._onClickRight;
    token._onClickRight = base ?? function (event) { event.stopPropagation?.(); };
  });

  // boundary sensor — fires every frame during movement; act only when MY token changes room
  Hooks.on("refreshToken", (token) => {
    const doc = token.document;
    if (!CONFIG.isOwnView(doc)) return;
    if (doc.flags?.[CONFIG.flagScope]?.areaMarker) return;
    const data = peekAreaData();
    if (!data) return;                                // SELF-GATE
    const cur = tokenArea(token.center.x, token.center.y, data.areas);   // always an area (inside or nearest)
    const last = _lastArea.get(doc.id) ?? null;
    if (cur && cur !== last) {                         // crossed into a different area → recompute my fog
      _lastArea.set(doc.id, cur);
      invalidateCache();
      requestVisibilityRefresh();
    }
  });

  // sensed-token appearance — runs for EVERY token (not just mine): silhouette the ones a sense reveals.
  Hooks.on("refreshToken", (token) => {
    try { refreshSenseAppearance(token); } catch (e) { console.warn("ATLAS | sense-appearance error — ignored", e); }
  });

  // a LOS toggle / reset must hide & reveal live, not only on movement
  Hooks.on("updateScene", (scene, changes) => {
    if (scene?.id !== canvas?.scene?.id) return;
    const fk = changes?.flags;
    if (!fk) return;
    if (!(CONFIG.flagScope in fk) && !(("-=" + CONFIG.flagScope) in fk)) return;
    invalidateCache();
    requestVisibilityRefresh();
  });

  // fresh scene → forget per-token room memory
  Hooks.on("canvasReady", () => { _lastArea.clear(); invalidateCache(); });

  console.log("ATLAS | runtime installed (per-client visibility + boundary sensor)");
}
