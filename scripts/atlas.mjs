// A.T.L.A.S. — Area Tactical Line-of-sight Awareness System.
// Generic, any-system zone-based fog of war / area line-of-sight for Foundry VTT.
// Full design + build plan: DC20/AREA-MODULE-PLAN.md (and the two companion docs).
//
// Entry point. Wires the runtime; exposes the API. (los.mjs/data.mjs are pure + tested;
// runtime.mjs is the per-client visibility engine. editor.mjs/marker.mjs land in later phases.)
import { CONFIG, configure } from "./config.mjs";
import { installRuntime, refresh as refreshVisibility } from "./runtime.mjs";
import { installTooltip } from "./tooltip.mjs";
import { hasLOS, tokenArea, areaAtPoint, distance } from "./los.mjs";
import { readAreaData } from "./data.mjs";
import { placeRoom, removeMarker, clearAllAreas, rectPoints, registerMarkerSheet, installMarkerHoverGuard } from "./marker.mjs";
import { applyAreaEffect, removeAreaEffect, readAreaEffects } from "./effects.mjs";
import { initTrace } from "./trace.mjs";
import { installEditor, registerControls, renderEditorInto, openEditorWindow } from "./editor.mjs";

const MODULE_ID = "atlas";

// The public API surface a host system (e.g. JLU's Editor) can call.
const ATLAS = {
  id: MODULE_ID,
  version: "0.3.0",
  get config() { return CONFIG; },
  configure,                                                   // configure({ flagScope, isOwnView, filterToken, extraAreas, ... })
  refresh() { return refreshVisibility(); },                   // force an immediate visibility recompute (after a host toggles a sense effect)
  hasLOS(scene, from, to) {                                    // convenience LOS query for a scene
    const d = readAreaData(scene);
    return hasLOS(d.connections || [], from, to, d.areas);
  },
  // --- area queries (for host movement-cost / positioning systems) ---
  hasAreas(scene) {                                            // does this scene have any traced areas?
    const d = readAreaData(scene ?? canvas.scene);
    return !!(d.areas && Object.keys(d.areas).length);
  },
  areaOf(x, y, scene) {                                        // which room is this point associated with (inside OR nearest — for fog)
    const d = readAreaData(scene ?? canvas.scene);
    return tokenArea(x, y, d.areas || {});
  },
  areaLabels(scene) {                                          // every traced room label on the scene (for host sweeps, e.g. fire's round bump)
    const d = readAreaData(scene ?? canvas.scene);
    return Object.keys(d.areas || {});
  },
  roomAt(x, y, scene) {                                        // which room is this point STRICTLY inside (null in a gap — for movement entry)
    const d = readAreaData(scene ?? canvas.scene);
    return areaAtPoint(x, y, d.areas || {});
  },
  roomDistance(from, to, scene) {                              // shortest hop count between two rooms over the connection graph (-1 unreachable)
    const d = readAreaData(scene ?? canvas.scene);
    return distance(d.connections || [], from, to);
  },
  // --- area EFFECTS (Web / Fire / Smoke — they STACK; definitions in CONFIG.areaEffects; mechanics are the host's) ---
  areaEffects(label, scene) { return readAreaEffects(scene, label); },               // [ { id, ...state }, ... ] in lay order
  setAreaEffect(label, effect, scene) { return applyAreaEffect(scene, label, effect); },  // id string or { id, ...state }; stacks + applies the def's LOS-writes + retints
  clearAreaEffect(label, id, scene) { return removeAreaEffect(scene, label, id ?? null); },  // remove one by id, or ALL with no id; LOS left as-is (GM re-toggles)
  // --- authoring (Phase 5) ---
  placeRoom(points, scene) { return placeRoom(scene ?? canvas.scene, points); },   // points = flat polygon [x,y,...]
  placeRect(x, y, w, h, scene) { return placeRoom(scene ?? canvas.scene, rectPoints(x, y, w, h)); },
  removeArea(label, scene) { return removeMarker(scene ?? canvas.scene, label); },
  reset(scene) { return clearAllAreas(scene ?? canvas.scene); },                    // wipe a scene's areas (tokens+outlines+data)
  // --- editor (Phase 6) ---
  renderEditor(el, scene) { return renderEditorInto(el, scene ?? canvas.scene); },  // mount the panel into a host element
  openEditor() { return openEditorWindow(); },                                      // standalone window
};

// expose globally + on the module document (Foundry-recommended) so a host can call it
globalThis.ATLAS = ATLAS;

Hooks.once("init", () => {
  console.log("ATLAS | init");
  const mod = game.modules.get(MODULE_ID);
  if (mod) mod.api = ATLAS;
});

// install the runtime once classes exist (before the canvas draws tokens), plus the hover readout,
// the editor's live-refresh hook, the trace cleanup hook, and the GM scene-control button
Hooks.once("setup", () => { installRuntime(); installTooltip(); installEditor(); initTrace(); installMarkerHoverGuard(); });

registerControls();

Hooks.once("ready", () => {
  registerMarkerSheet();                        // stub sheet for the marker actor (no full system sheet)
  console.log(`ATLAS | ready (v${ATLAS.version}) — runtime active`);
});
