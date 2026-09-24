// Atlas — a room's controls, as one pure builder.
//
// ONE BUILDER, TWO SURFACES: the marker sheet you get by double-clicking a room label, and the
// re-targetable control panel. They differ in exactly one way, and it is a real difference rather
// than a skin: the SHEET stages edits and commits them all on Apply, while the PANEL writes each
// click straight through as you make it. So the builder takes a `staging` flag, and everything
// else about a room's controls is defined here once. Two copies of this markup would drift within
// a week, and the sheet is the one that never repaints when the data changes underneath it.
//
// Nothing in this file touches Foundry, the DOM or a scene, which is why all of it is unit-tested
// and why a future dashboard can mount `roomCardHTML` without dragging the marker glue in with it.

export const esc = (s) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** A fresh, empty set of staged edits. `los` holds only fields that DIFFER from the committed
 *  record; `effects` holds only id -> bool DELTAS (true = lay it, false = remove it). */
export const emptyStage = () => ({ los: {}, effects: {} });

/**
 * Accept anything a caller might mean by "nothing staged" and hand back a shape that can be read.
 *
 * ⚠ The readers here tolerated a missing stage and the writer did not, which is a trap for the
 * SECOND surface rather than the first: the sheet always holds a real stage, so a panel modelling
 * "nothing staged" as `null` or `{}` would be the thing that crashed. Both ends are guarded now.
 * This returns a COPY, so a reader can never quietly gain a key.
 */
export function readStage(staged) {
  return { los: { ...staged?.los }, effects: { ...staged?.effects } };
}

/** Is anything staged? The Apply button lives and dies by this. */
export function stageDirty(staged) {
  return Object.keys(staged?.los ?? {}).length > 0 || Object.keys(staged?.effects ?? {}).length > 0;
}

/** The effect ids a room is actually carrying right now, ignoring anything staged. */
export function committedEffects(area) {
  return new Set((area?.effects ?? []).map((e) => e?.id).filter(Boolean));
}

/** A sight field as it should READ: the staged value if one is staged, else the committed one.
 *  ⚠ Absent means ON. The flags are explicit-true/false, and a missing flag is an old record. */
export function sightShown(area, staged, field) {
  return staged?.los?.[field] ?? (area?.[field] !== false);
}

/** An effect as it should READ: the staged delta if one is staged, else whether it is laid. */
export function effectShown(area, staged, id) {
  return staged?.effects?.[id] ?? committedEffects(area).has(id);
}

/**
 * The MAP row: everything that is not this room's sight or its dressing.
 *
 * Four of the six are one gesture in two halves. New and Redraw say WHERE the next shape lands: a
 * fresh room, or over this one. Square and Line say HOW you draw it. New is the resting state, so
 * the two draw buttons always mean something even if you never touch the first pair.
 *
 * ⚠ REDRAW KEEPS EVERYTHING BUT THE OUTLINE: the name, the three sight switches, the effects, the
 *   blackout, the connections and the doorways on them all carry over to the new shape.
 *
 * ⚠ WITH NO ROOM (label null) it draws what still makes sense on an empty map: the two draw tools
 *   and the traffic rule. New/Redraw is a pair with nothing to redraw, and Connect needs two rooms.
 *   This is what makes the panel usable on a fresh scene instead of a card that says "trace a room
 *   first" and gives you no way to do it (user, 2026-09-23).
 *
 * @param {object}   [opts]
 * @param {?string}  [opts.label]    the room the row acts on, or null on an empty map
 * @param {?boolean} [opts.connect]  null: no control. true: connect mode is ON and every click on
 *                                   the map is picking rooms to join or cut.
 * @param {?boolean} [opts.draw]     null: no controls. false: the next shape is a NEW room. true:
 *                                   Redraw is armed and the next shape replaces this room.
 * @param {?string}  [opts.tool]     the drawing tool that is LIVE on the map right now, "square" or
 *                                   "line", or null when none is. It is lit, and so is the half of
 *                                   the pair its shape is for, in the same amber Connect wears while
 *                                   it is live: the next thing you do on the map is a drawing.
 * @param {?boolean} [opts.traffic]  null: no control. true: movement is held to the connections.
 * @returns {string}
 */
export function mapRowHTML({ label = null, connect = null, draw = null, tool = null, traffic = null } = {}) {
  if (connect === null && draw === null && traffic === null) return "";
  const redrawing = draw === true;
  const joined = connect === true;
  // ⚠ ONLY THE TWO NAMES THE BUTTONS WEAR light anything; a tool this row draws no button for is
  //   nobody's business here.
  const live = (tool === "square" || tool === "line") ? tool : null;
  const lit = (on, klass = " on") => (on ? klass : "");
  const mb = (how, icon, text, cls, hint) =>
    `<button type="button" class="atlas-mc-mb${cls}" data-atlas-draw="${how}" title="${esc(hint)}">
        <i class="fa-solid ${icon}"></i><span>${text}</span>
      </button>`;

  // ⚠ WHILE A DRAWING IS LIVE the pair says which room it is for, in amber, because that is the
  //   moment the answer matters: New is blue at rest, but a Square being dragged for a new room
  //   lights New the same way it lights Square (user, 2026-09-23: "the +new ... not highlighting").
  const pair = (draw !== null && label) ? `
      ${mb("new", "fa-plus", "New", live && !redrawing ? " armed" : lit(!redrawing), live
        ? (redrawing
          ? "Drop the drawing in flight and go back to drawing NEW rooms. This room's outline stays as it is."
          : "Drawing a NEW room right now. Press this, or Redraw, to drop that drawing and start over.")
        : redrawing
          ? "Go back to drawing NEW rooms, and leave this room's outline alone."
          : "The next shape you draw becomes a new room. This is where the pair rests.")}
      ${mb("redraw", "fa-arrows-rotate", "Redraw", lit(redrawing, " armed"), live && redrawing
        ? `Redrawing room ${label} right now: the shape you are making on the map replaces its outline. Press this again to drop that drawing and pick a tool again.`
        : redrawing
          ? `Armed: pick Square or Line and the shape you draw replaces room ${label}. Press this again to cancel.`
          : `Retrace room ${label}: the next shape you draw REPLACES its outline. Its name, its sight settings, its effects and every connection to it stay exactly as they are.`)}` : "";

  // ⚠ THE LIVE TOOL IS LIT, AND PRESSING IT AGAIN STOPS IT, exactly as Connect behaves (user,
  //   2026-09-23: "the tool square or line that tool should highlight similar to connect does").
  //   Without this the panel showed its resting state while a trace was in flight, and nothing on
  //   it said a tool was running.
  const tools = draw === null ? "" : `
      ${mb("square", "fa-vector-square", "Square", lit(live === "square", " armed"), live === "square"
        ? "Square is LIVE: drag a rectangle on the map. Press this again, or Escape, to stop."
        : redrawing
          ? `Drag a rectangle: it becomes room ${label}'s new outline.`
          : "Drag a rectangle to make a room. The fast one.")}
      ${mb("line", "fa-draw-polygon", "Line", lit(live === "line", " armed"), live === "line"
        ? "Line is LIVE: click the corners on the map. Enter or right-click finishes, Backspace undoes. Press this again, or Escape, to stop."
        : redrawing
          ? `Click the corners of room ${label}'s new outline. Enter or right-click finishes, Backspace undoes, Escape cancels.`
          : "Click a room's corners. Enter or right-click finishes, Backspace undoes, Escape cancels.")}`;

  // ⚠ CONNECT IS A MODE, NOT AN ARM (user, 2026-09-23: "we can leave the connect button live once
  //   it is pushed and the connection is made ... process continues until connect is toggled off").
  //   A map is wired in runs, usually out from one hub, so disarming after every pair would mean a
  //   press of the button per door. The readout that follows the cursor is what says where you are.
  const join = (connect === null || !label) ? "" : `
      <button type="button" class="atlas-mc-mb${lit(joined, " armed")}" data-atlas-connect
        title="${esc(joined
          ? "Connect is LIVE: click a room, then another, to join them, or to cut them if they are already joined. The readout by your cursor shows the pair. RIGHT-CLICK clears both slots, so you can start from a different room. Press this again, or Escape, to stop."
          : `Wire rooms up by pointing at them: click here, then click the two rooms you want joined. It stays live until you press it again, so a whole map goes in without coming back to this button. Two rooms already joined are cut loose instead, and any doorway on that connection goes with them. Right-click clears the pair and starts again.`)}">
        <i class="fa-solid fa-link"></i><span>Connect</span>
      </button>`;

  const light = traffic === null ? "" : `
      <button type="button" class="atlas-mc-mb atlas-mc-traffic ${traffic ? "stop" : "go"}" data-atlas-traffic
        title="${esc(traffic
          ? "Traffic control is ON. A player may only move a token between rooms that are connected, and a move to an unconnected room is refused. You are never restricted. Click for free movement."
          : "Traffic control is OFF: tokens move anywhere, and the connections only steer sight. Click to hold your players to the connection matrix.")}">
        <i class="fa-solid fa-traffic-light"></i><span>Traffic</span>
      </button>`;

  return `
    <div class="atlas-mc-sec">Map</div>
    <div class="atlas-mc-maprow">${pair}${tools}${join}${light}
    </div>`;
}

/**
 * The room card's markup.
 *
 * @param {object|null} ctx            { label, name, area }, or null for the placeholder card
 * @param {object}   [opts]
 * @param {object}   [opts.staged]     un-applied edits; an empty stage for a write-through surface
 * @param {object}   [opts.defs]       effect definitions, i.e. CONFIG.areaEffects
 * @param {boolean}  [opts.staging]    true: draw the amber staged state and the Apply footer (the
 *                                     sheet). false: the surface commits as you click, so neither
 *                                     is drawn and there is nothing to discard (the panel).
 * @param {?boolean} [opts.remove]     null: no delete control. true: draw it. It asks before it
 *                                     does anything, which is the only reason it belongs on a
 *                                     surface that re-points itself when you click the map.
 * @param {?boolean} [opts.move]       null: no move control. true: move mode is ON, and a drag
 *                                     inside ANY room moves that room.
 * @param {?boolean} [opts.doorway]    null: no doorway control. false: idle. true: ARMED, waiting
 *                                     for the next room clicked to be the other side.
 * @param {?boolean} [opts.blackout]   null: no blackout control. true/false: draw the toggle in
 *                                     that state. Only the panel passes it, because switching it
 *                                     is a scene write and the surface showing it must commit it.
 * @param {boolean}  [opts.rename]     draw a name field. OFF by default: the double-clicked sheet
 *                                     has never had one, and a room's name is a scene write, so a
 *                                     surface that shows the field must also commit it.
 * @param {?boolean} [opts.connect]    null: no connect control. false: idle. true: ARMED, waiting
 *                                     for the next room clicked to be joined to (or cut from) this
 *                                     one. The same gesture as the doorway, one step earlier.
 * @param {?boolean} [opts.draw]       null: no draw controls. false: the next shape drawn becomes
 *                                     a NEW room, which is where the pair rests. true: REDRAW is
 *                                     armed, so the next shape drawn replaces THIS room's outline.
 * @param {?string}  [opts.tool]       the drawing tool live on the map right now, "square" or
 *                                     "line", or null. Lit while it runs, with the half of the
 *                                     pair its shape is for, and the note says what to do.
 * @param {?boolean} [opts.traffic]    null: no traffic control. true: movement is held to the
 *                                     connection matrix (red). false: tokens move freely (green).
 *                                     A world rule, not a property of this room.
 * @returns {string}
 */
export function roomCardHTML(ctx, { staged, defs = {}, staging = true, rename = false, blackout = null, doorway = null, move = null, remove = null, connect = null, draw = null, tool = null, traffic = null } = {}) {
  const stage = readStage(staged);
  if (!ctx) {
    return `<div class="atlas-marker-card">
      <i class="fa-solid fa-draw-polygon"></i>
      <h3>Area-label host</h3>
      <p>This hidden actor only backs the room labels Atlas drops on your scenes. There's nothing to edit here — please don't delete it.</p>
    </div>`;
  }

  const tog = (field, label, hint) => {
    const shown = sightShown(ctx.area, stage, field);
    const isStaged = staging && (field in stage.los);
    return `<button type="button" class="atlas-mc-tog${shown ? " on" : ""}${isStaged ? " staged" : ""}" data-atlas-los="${field}" title="${esc(hint)}">
        <i class="fa-solid ${shown ? "fa-eye" : "fa-eye-slash"}"></i>
        <span class="atlas-mc-t">${label}</span>
        <span class="atlas-mc-s">${shown ? "on" : "off"}</span>
      </button>`;
  };

  // Effects STACK — each button shows its own desired state: staged delta if present, else committed.
  const desired = (id) => effectShown(ctx.area, stage, id);
  const fxBtn = (id, def) => {
    const on = desired(id);
    const isStaged = staging && (id in stage.effects);
    return `<button type="button" class="atlas-mc-fx${on ? " on" : ""}${isStaged ? " staged" : ""}" data-atlas-fx="${id}"
        title="${esc(def.label)}${def.los ? " — seals this room's LOS In/Out when applied" : ""}">
        <i class="fa-solid ${def.icon}"></i><span>${esc(def.label)}</span>
      </button>`;
  };

  const fxIds = Object.keys(defs ?? {});
  const fxRow = fxIds.map((id) => fxBtn(id, defs[id])).join("");
  const clearOn = fxIds.every((id) => !desired(id));
  const dirty = stageDirty(stage);
  // ⚠ The copy has to follow the mode. On the sheet nothing has happened until Apply; on the
  //   panel the click IS the change, and a tooltip saying "stage" would be a lie about what
  //   just occurred.
  const clearTitle = staging
    ? "Stage ALL effects off (LOS stays as it stands — re-toggle by hand)"
    : "Clear ALL effects (LOS stays as it stands, re-toggle by hand)";

  // ONE ROW when the surface can rename: the letter is the handle and the field IS the name, so
  // the name is not printed twice and a line is saved. Without rename the row is a plain readout.
  // Emptying the field is a legal rename back to the bare letter.
  // Hiding a whole room from the table is not a sight setting and does not belong with the three
  // that are, so it sits on the room's own row rather than in the In/Out/Through group.
  const dark = blackout === true;
  const hide = blackout === null ? "" : `<button type="button" class="atlas-mc-dark${dark ? " on" : ""}" data-atlas-blackout
      title="${esc(dark
        ? "This room is hidden from your players: no outline, no label, nothing inside it seen, and no way in. Click to reveal it."
        : "Hide this room from your players entirely, and refuse anyone entry. You still see it, hatched.")}"><i class="fa-solid fa-mask"></i></button>`;

  // Move mode is not about THIS room: while it is on, a drag inside any room moves that room. It
  // leads the row because it changes what the whole map does, where everything after it is about
  // the one room the panel is showing.
  const moving = move === true;
  const mover = move === null ? "" : `<button type="button" class="atlas-mc-move${moving ? " on" : ""}" data-atlas-move
      title="${esc(moving
        ? "Move mode is ON: drag inside any room to move it, and let go to put it down. Escape, or this button, turns it off."
        : "Move rooms: drag inside any room to move it. While this is on, dragging inside a room will not pan the map or move a token.")}"><i class="fa-solid fa-arrows-up-down-left-right"></i></button>`;

  const armed = doorway === true;
  // ⚠ SHAPED LIKE A SIGHT TOGGLE, because it is one: the other three are this room's sight rules
  //   and this is the sight rule on one connection. It wears AMBER rather than green when live,
  //   because unlike them it is a MODE and changes what your next click on the map does.
  const door = doorway === null ? "" : `<button type="button" class="atlas-mc-tog atlas-mc-door${armed ? " armed" : ""}" data-atlas-doorway
      title="${esc(armed
        ? `Doorway mode is LIVE: click a room, then another, to put a doorway on the connection between them, or take one off. The readout by your cursor shows the pair. RIGHT-CLICK clears both slots. Press this again, or Escape, to stop.`
        : `Put doorways in by pointing at rooms: click here, then click the two rooms whose connection you want blocked. It stays live so a run of doors goes in without coming back to this button. Sight stops at a doorway; movement never does. Right-click clears the pair and starts again.`)}">
        <i class="fa-solid fa-door-closed"></i>
        <span class="atlas-mc-t">Door</span>
        <span class="atlas-mc-s">${armed ? "live" : "off"}</span>
      </button>`;

  // ⚠ Last on the row, and it ASKS FIRST. This panel re-points itself when you click the map, so a
  //   one-press delete would sit a single stray click away from taking a room off the scene.
  const kill = remove === null ? "" : `<button type="button" class="atlas-mc-kill" data-atlas-delete
      title="${esc(`Delete room ${ctx.label}, its outline, its label and every connection to it. You will be asked first.`)}"><i class="fa-solid fa-trash-can"></i></button>`;

  const head = rename
    ? `<div class="atlas-mc-room">${mover}<b>${esc(ctx.label)}</b><input type="text" class="atlas-mc-name"
      data-atlas-name="${esc(ctx.label)}" value="${esc(ctx.name ?? "")}" placeholder="unnamed"
      title="${esc(`Name room ${ctx.label}. Players see this. Clear it to go back to the letter alone.`)}">${hide}${kill}</div>`
    : `<div class="atlas-mc-room">${mover}<b>${esc(ctx.label)}</b>${ctx.name ? ` · ${esc(ctx.name)}` : ""}${hide}${kill}</div>`;

  const redrawing = draw === true;
  const joined = connect === true;
  const live = (tool === "square" || tool === "line") ? tool : null;
  const mapRow = mapRowHTML({ label: ctx.label, connect, draw, tool, traffic });

  // While armed, the card says so: a tool that has quietly changed what your next click means is
  // the kind that makes people distrust the whole panel. A drawing in flight comes first: it owns
  // the map until it lands, whatever else was armed.
  const drawn = redrawing ? `room ${esc(ctx.label)}'s new outline` : "a new room";
  const armedNote = live === "square"
    ? `<p class="atlas-mc-arm">Drag a rectangle on the map for ${drawn}. Escape cancels.</p>`
    : live === "line"
      ? `<p class="atlas-mc-arm">Click the corners of ${drawn} on the map. Enter or right-click finishes, Backspace undoes, Escape cancels.</p>`
      : armed
        ? `<p class="atlas-mc-arm">Click a room, then another, to door or open the connection between them. Right-click clears both slots.</p>`
        : joined
          ? `<p class="atlas-mc-arm">Click a room, then another, to join or cut them. Right-click clears both slots.</p>`
          : redrawing
            ? `<p class="atlas-mc-arm">Pick Square or Line, then draw room ${esc(ctx.label)}'s new outline.</p>`
            : "";

  const hint = staging
    ? `<p class="atlas-mc-hint">Stage line-of-sight + effect changes, then Apply. ✕ discards.</p>`
    : "";
  const foot = staging
    ? `<div class="atlas-mc-foot">
      <button type="button" class="atlas-mc-apply" data-atlas-apply ${dirty ? "" : "disabled"}><i class="fa-solid fa-check"></i> Apply</button>
      <span class="atlas-mc-note">${dirty ? "staged — Apply commits & closes" : "no changes staged"}</span>
    </div>`
    : "";

  return `<div class="atlas-marker-card atlas-los-card">
    ${head}
    ${armedNote}
    ${hint}
    <div class="atlas-mc-los">
      ${tog("losIn", "In", "Can this room be seen INTO from outside?")}
      ${tog("losOut", "Out", "Can tokens in it see / shoot OUT?")}
      ${tog("losThrough", "Through", "Can sight pass THROUGH it to somewhere beyond?")}
      ${door}
    </div>
    <div class="atlas-mc-sec">Effect</div>
    <div class="atlas-mc-fxrow">
      ${fxRow}
      <button type="button" class="atlas-mc-fx clear${clearOn ? " on" : ""}" data-atlas-fx="" title="${esc(clearTitle)}">
        <i class="fa-solid fa-ban"></i><span>None</span>
      </button>
    </div>
    ${mapRow}
    ${foot}
  </div>`;
}

/**
 * What a click landed on, or null when it landed on nothing that acts.
 *
 * Takes the event target so both surfaces read a click the same way. The only DOM it touches is
 * `closest` and `dataset`, so a plain stand-in tests it.
 *
 * @returns {{kind: "los", field: string} | {kind: "fx", id: string|null} | {kind: "draw", how: string}
 *           | {kind: "delete"|"move"|"doorway"|"connect"|"traffic"|"blackout"|"apply"} | null}
 */
export function cardTarget(el) {
  const killEl = el?.closest?.("[data-atlas-delete]");
  if (killEl) return { kind: "delete" };
  const moveEl = el?.closest?.("[data-atlas-move]");
  if (moveEl) return { kind: "move" };
  const doorEl = el?.closest?.("[data-atlas-doorway]");
  if (doorEl) return { kind: "doorway" };
  const joinEl = el?.closest?.("[data-atlas-connect]");
  if (joinEl) return { kind: "connect" };
  const drawEl = el?.closest?.("[data-atlas-draw]");
  if (drawEl) return { kind: "draw", how: drawEl.dataset?.atlasDraw };
  const trafEl = el?.closest?.("[data-atlas-traffic]");
  if (trafEl) return { kind: "traffic" };
  const dark = el?.closest?.("[data-atlas-blackout]");
  if (dark) return { kind: "blackout" };
  const los = el?.closest?.("[data-atlas-los]");
  if (los) return { kind: "los", field: los.dataset?.atlasLos };
  const fx = el?.closest?.("[data-atlas-fx]");
  if (fx) return { kind: "fx", id: fx.dataset?.atlasFx || null };   // "" is the None chip
  const apply = el?.closest?.("[data-atlas-apply]");
  if (apply) return { kind: "apply" };
  return null;
}

/**
 * Fold a click into a set of staged edits, in place.
 *
 * ⚠ A toggle back to the committed value DELETES its key rather than staging the same value again,
 * which is what keeps `stageDirty` honest: returning a switch to where it started leaves nothing
 * staged, and Apply goes back to disabled.
 *
 * @param {object} area    the room's committed record
 * @param {object} staged  mutated in place
 * @param {object} hit     from `cardTarget`
 */
export function stageClick(area, staged, hit) {
  if (!hit || !staged) return staged;
  staged.los ??= {};                            // in place: the sheet hands out its own live object
  staged.effects ??= {};
  if (hit.kind === "los") {
    const cur = area?.[hit.field] !== false;
    const next = !(staged.los[hit.field] ?? cur);
    if (next === cur) delete staged.los[hit.field]; else staged.los[hit.field] = next;
  } else if (hit.kind === "fx") {
    const committed = committedEffects(area);
    if (hit.id === null) {                      // None: stage every laid effect off
      staged.effects = {};
      for (const cid of committed) staged.effects[cid] = false;
    } else {
      const next = !(staged.effects[hit.id] ?? committed.has(hit.id));
      if (next === committed.has(hit.id)) delete staged.effects[hit.id]; else staged.effects[hit.id] = next;
    }
  }
  return staged;
}
