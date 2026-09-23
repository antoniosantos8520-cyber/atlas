// Atlas — WHAT IS UNDER THE CURSOR.
//
// Two of our gestures have to stand down for something else, and both need the same answer:
//
//   · the double click that opens the room panel stands down for a CREATURE, so double clicking an
//     actor standing in a room opens that actor's sheet and nothing else (user, 2026-09-23: "if a
//     actor is in a area and we duble click that actor that actor sheet opens not the room tool");
//
//   · move mode stands down for a room LABEL, so a name plate lying inside its own room can still
//     be picked up on its own instead of the room underneath swallowing the drag. That is the
//     "labels sit above the room's interior" the user asked for: the room is a polygon in a scene
//     flag and the label is a token, so there is no shared z-order to sort them by. What decides
//     is which one gets asked first, and that is here.
//
// ⚠ The pick is PURE and tested; the canvas read around it is a filter and a map. Foundry cannot be
//   asked "what is at this point": every placeable owns a MouseInteractionManager and learns about
//   the pointer only once the event reaches it, which is too late for a handler that has to decide
//   whether to consume that same event. So this is a box test over Token#bounds, which is exactly
//   the rectangle core lays the token out in.
import { CONFIG } from "./config.mjs";
import { isNamed } from "./labels.mjs";

/** Does this world point land inside the box? Half-open, so two touching boxes never both claim it. */
export function inBox(box, x, y) {
  if (!box) return false;
  return x >= box.x && y >= box.y && x < box.x + box.width && y < box.y + box.height;
}

/**
 * The TOPMOST box containing the point, or null.
 *
 * Entries are `{ box: {x,y,width,height}, elevation?, sort?, ... }` and whatever else the caller
 * wants carried through. Foundry stacks tokens by elevation first and sort second, so this does
 * too; a tie goes to the LATER entry, which is the later-drawn one.
 */
export function topBoxAt(entries = [], x, y) {
  let best = null;
  for (const e of entries) {
    if (!inBox(e?.box, x, y)) continue;
    if (!best) { best = e; continue; }
    const ae = e.elevation ?? 0, be = best.elevation ?? 0;
    if (ae > be || (ae === be && (e.sort ?? 0) >= (best.sort ?? 0))) best = e;
  }
  return best;
}

const isMarker = (t) => !!t?.document?.flags?.[CONFIG.flagScope]?.areaMarker;
const markerOf = (t) => t?.document?.flags?.[CONFIG.flagScope]?.areaMarker ?? null;

const entry = (t) => ({
  token: t,
  box: t.bounds,
  elevation: t.document?.elevation ?? 0,
  sort: t.document?.sort ?? 0,
});

function placeables() {
  return canvas?.tokens?.placeables ?? [];
}

/**
 * The creature under this world point, or null: any token on the scene that is not one of ours.
 *
 * ⚠ `visible` is the test, not ownership or disposition. A token you cannot see must not silently
 *   block a gesture, and a GM sees hidden tokens, so a GM's double click on one still opens it.
 * ⚠ Drag ghosts are skipped. A ghost carries the real token's id and sits under the cursor by
 *   definition, so an unguarded read would report a creature at every point of every drag.
 */
export function creatureAt(x, y) {
  const list = placeables().filter((t) => !t.isPreview && t.visible && !isMarker(t));
  return topBoxAt(list.map(entry), x, y)?.token ?? null;
}

/**
 * The room LABEL under this world point, or null.
 *
 * ⚠ ONLY A LABEL THAT IS ACTUALLY ON SCREEN. An unnamed room's label token still exists, sitting
 *   at alpha 0 (labels.mjs targetAlpha), and letting an invisible token claim a press would be the
 *   worst kind of bug: move mode would stand down for something the GM cannot see, the room would
 *   not move, and nothing on screen would say why.
 */
export function labelAt(x, y) {
  const list = placeables().filter((t) => !t.isPreview && t.visible && isNamed(markerOf(t)));
  return topBoxAt(list.map(entry), x, y)?.token ?? null;
}
