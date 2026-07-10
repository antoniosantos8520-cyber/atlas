// A.T.L.A.S. — the editor panel: trace/clear buttons, the connection matrix (wire doors), and the
// In/Out/Through table. Mountable into a host element (ATLAS.renderEditor) OR opened as a standalone
// window. `editorHTML` is a pure string builder (unit-tested); the rest is thin DOM/Foundry glue.
import { CONFIG } from "./config.mjs";
import { readAreaData, writeAreaData, toggleConnection, hasConnection, setLOS } from "./data.mjs";
import { removeMarker, clearAllAreas, toggleLock, drawConnections, redrawAreas } from "./marker.mjs";
import { startTrace, startBox } from "./trace.mjs";

let _mounted = null;   // { el, scene } — the currently-shown editor (host-mounted or window content)

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ---------- pure HTML builder (testable) ----------
export function editorHTML(data, locked = false) {
  const labels = Object.keys(data?.areas || {}).sort();
  let h = `<div class="atlas-ed">`;
  h += `<div class="atlas-ed-bar">
      <button type="button" class="atlas-btn" data-atlas-action="trace" title="Click each corner of the room (any shape)"><i class="fa-solid fa-draw-polygon"></i> Trace</button>
      <button type="button" class="atlas-btn" data-atlas-action="box" title="Click-drag a rectangle room (fast)"><i class="fa-solid fa-vector-square"></i> Box</button>
      <button type="button" class="atlas-btn${locked ? " on" : ""}" data-atlas-action="lock" title="Lock the room markers so you don't bump them while moving combatants"><i class="fa-solid fa-lock${locked ? "" : "-open"}"></i> ${locked ? "Locked" : "Unlocked"}</button>
      <button type="button" class="atlas-btn" data-atlas-action="redraw" title="Move rooms to match their letter markers + refresh outlines & lines"><i class="fa-solid fa-arrows-rotate"></i> Redraw</button>
      <button type="button" class="atlas-btn danger" data-atlas-action="clear"><i class="fa-solid fa-trash-can"></i> Clear</button>
    </div>`;

  if (labels.length === 0) return h + `<p class="atlas-empty">Trace a room to begin.</p></div>`;

  // connection matrix — the line of TRAVEL between rooms (separate from sight, below)
  h += `<div class="atlas-sec">Connections <small>line of travel — click to link rooms (draws a line on the map)</small></div>`;
  if (labels.length < 2) h += `<p class="atlas-empty">Trace at least 2 rooms to connect them.</p>`;
  else {
    h += `<table class="atlas-matrix"><thead><tr><th></th>${labels.map(c => `<th>${c}</th>`).join("")}</tr></thead><tbody>`;
    for (const r of labels) {
      h += `<tr><th>${r}</th>`;
      for (const c of labels) {
        if (r === c) { h += `<td class="self">—</td>`; continue; }
        const on = hasConnection(data, r, c);
        h += `<td class="cell${on ? " on" : ""}" data-atlas-action="conn" data-a="${r}" data-b="${c}">${on ? "●" : "·"}</td>`;
      }
      h += `</tr>`;
    }
    h += `</tbody></table>`;
  }

  // In / Out / Through table
  h += `<div class="atlas-sec">Line of sight <small>In · Out · Through</small></div>`;
  h += `<table class="atlas-los"><thead><tr><th></th>
      <th title="Can this room be seen INTO from outside?">In</th>
      <th title="Can tokens in it see/shoot OUT?">Out</th>
      <th title="Can sight pass THROUGH it?">Through</th><th></th></tr></thead><tbody>`;
  const cell = (l, f, a) => {
    const on = a[f] !== false;
    return `<td><span class="los${on ? " on" : ""}" data-atlas-action="los" data-label="${l}" data-field="${f}">${on ? "✓" : ""}</span></td>`;
  };
  for (const l of labels) {
    const a = data.areas[l];
    const head = `${l}${a.name ? ` <span class="atlas-rn">${esc(a.name)}</span>` : ""}`;
    h += `<tr><th class="atlas-roomhead">${head}</th>${cell(l, "losIn", a)}${cell(l, "losOut", a)}${cell(l, "losThrough", a)}`
      + `<td><button class="atlas-x" data-atlas-action="del" data-label="${l}" title="Delete room ${l} — removes it entirely and frees letter ${l} for reuse"><i class="fa-solid fa-trash-can"></i> Delete</button></td></tr>`;
  }
  h += `</tbody></table></div>`;
  return h;
}

// ---------- mount + render ----------
function renderContent(el, scene) {
  el.innerHTML = editorHTML(readAreaData(scene), !!scene?.getFlag(CONFIG.flagScope, "areasLocked"));
}

export function renderEditorInto(el, scene) {
  scene = scene ?? canvas.scene;
  el.classList.add("atlas-editor-root");
  _mounted = { el, scene };
  if (!el._atlasBound) {
    el._atlasBound = true;
    el.addEventListener("click", (ev) => onEditorClick(ev));
  }
  renderContent(el, scene);
}

async function onEditorClick(ev) {
  const node = ev.target.closest("[data-atlas-action]");
  if (!node) return;
  ev.preventDefault();
  const scene = _mounted?.scene ?? canvas.scene;
  const act = node.dataset.atlasAction;

  if (act === "trace") { startTrace(); return; }
  if (act === "box") { startBox(); return; }
  if (act === "redraw") { await redrawAreas(scene); return; }  // re-anchor rooms to letters + refresh
  if (act === "lock") { await toggleLock(scene); return; }     // → updateScene → re-renders
  if (act === "clear") {
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Clear A.T.L.A.S. areas?" },
      content: "<p>Remove all rooms, outlines, and LOS data from <b>this scene</b>?</p>", rejectClose: false
    });
    if (ok) await clearAllAreas(scene);     // → updateScene → re-renders below
    return;
  }
  const data = readAreaData(scene);
  if (act === "conn") { await writeAreaData(scene, toggleConnection(data, node.dataset.a, node.dataset.b)); await drawConnections(scene); }
  else if (act === "los") {
    const cur = data.areas[node.dataset.label]?.[node.dataset.field] !== false;
    await writeAreaData(scene, setLOS(data, node.dataset.label, node.dataset.field, !cur));
  } else if (act === "del") await removeMarker(scene, node.dataset.label);
  // every write fires updateScene → the hook below re-renders the panel
}

// re-render the mounted panel whenever this scene's area data changes (our writes + the trace tool)
export function installEditor() {
  Hooks.on("updateScene", (scene, changes) => {
    if (!_mounted?.el?.isConnected || scene?.id !== _mounted.scene?.id) return;
    const fk = changes?.flags;
    if (!fk || (!(CONFIG.flagScope in fk) && !(("-=" + CONFIG.flagScope) in fk))) return;
    renderContent(_mounted.el, _mounted.scene);
  });
}

// ---------- standalone window + scene-control button ----------
let _app = null;
function EditorApp() {
  const { ApplicationV2 } = foundry.applications.api;
  return class AtlasEditorApp extends ApplicationV2 {
    static DEFAULT_OPTIONS = {
      id: "atlas-editor-app",
      classes: ["atlas-editor-window"],
      window: { title: "A.T.L.A.S. — Areas", icon: "fa-solid fa-draw-polygon", resizable: true },
      position: { width: 380, height: "auto" }
    };
    async _renderHTML() { return ""; }
    _replaceHTML(_result, content) { renderEditorInto(content, canvas.scene); }
  };
}

export function openEditorWindow() {
  if (!game.user?.isGM) { ui.notifications?.warn("A.T.L.A.S. is GM-only."); return; }
  _app = _app ?? new (EditorApp())();
  _app.render(true);
}

export function registerControls() {
  Hooks.on("getSceneControlButtons", (controls) => {
    if (!game.user?.isGM) return;
    const grp = controls.tokens ?? controls.token;
    if (!grp) return;
    const tool = { name: "atlasAreas", title: "A.T.L.A.S. — Areas", icon: "fa-solid fa-draw-polygon", button: true, order: 90, onClick: () => openEditorWindow() };
    if (grp.tools && !Array.isArray(grp.tools)) grp.tools.atlasAreas = tool;
    else if (Array.isArray(grp.tools)) grp.tools.push(tool);
  });
}
