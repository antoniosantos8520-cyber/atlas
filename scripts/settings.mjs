// A.T.L.A.S. — module settings + the pure readers that depend on them.
//
// Two sliders govern how room labels LOOK (never where they are):
//   labelOpacity:  the resting opacity of every label. Hover always goes to full.
//   labelFontSize: the point size the label texture is drawn at.
//
// Font size is a DOCUMENT property (the texture, and the token's width/height in
// grid units are derived from the drawn pixel box), so changing it rewrites the
// marker tokens. Opacity is per-client display only and never touches a document.
//
// Kept in its own file so marker.mjs can read the sliders without importing the
// label display layer, which imports marker.mjs back.

const MODULE_ID = "atlas";

export const LABEL_FS_DEFAULT = 20;
export const LABEL_OPACITY_DEFAULT = 0.75;
export const OVERLAY_COLOR_DEFAULT = "#3d7bd0";
export const OVERLAY_OPACITY_DEFAULT = 0.1;

// A room's overlay is two parts: the wash across it and the outline around it. ONE
// slider drives both, so turning it to 0 switches the overlay off completely instead
// of stranding a bright outline over an invisible fill. PURE.
//
// Neither part scales linearly with the slider, for a reason each:
//
//   The OUTLINE carries the room's boundary, which you want to keep seeing long after
//   the wash has faded, so it rides a steep curve. At the default 0.1 that lands on
//   ~0.71, which is the 0.7 the module shipped with.
//
//   An EFFECT room LIFTS toward full rather than being multiplied up. A multiplier
//   saturates at 1 partway along the slider, after which a burning room and a clean
//   one look identical; lifting keeps the dressed room strictly stronger at every
//   position below full opacity, which is the whole point of tinting it.
export function overlayAlphas(v, effect = false) {
  if (!(v > 0)) return { fillAlpha: 0, strokeAlpha: 0 };
  const lift = (a, k) => a + (1 - a) * k;
  const stroke = Math.pow(Math.min(1, v), 0.15);
  const fill = Math.min(1, v);
  return effect
    ? { fillAlpha: lift(fill, 0.1), strokeAlpha: lift(stroke, 0.65) }
    : { fillAlpha: fill, strokeAlpha: stroke };
}

// The unnamed-room letter disc is drawn into a fixed 64px texture and scaled down
// to sit inside its grid cell. Tie that scale to the font slider so both kinds of
// label grow and shrink together; clamped so a disc never fills or vanishes from
// its cell.
export function discScale(fs = LABEL_FS_DEFAULT) {
  return Math.min(0.75, Math.max(0.18, 0.4 * (fs / LABEL_FS_DEFAULT)));
}

function raw(key) {
  try { return game.settings.get(MODULE_ID, key); }
  catch (_) { return undefined; }                     // called before init, or in Node
}

function num(key, fallback) {
  const v = raw(key);
  return Number.isFinite(v) ? v : fallback;
}

// A ColorField setting reads back as a Color instance, not the hex string it stores,
// so accept either and always hand out a plain "#rrggbb" a Drawing can wear.
function hex(key, fallback) {
  const v = raw(key);
  if (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v)) return v;
  if (v && typeof v.css === "string") return v.css;
  return fallback;
}

export function labelFontSize() { return num("labelFontSize", LABEL_FS_DEFAULT); }
export function labelOpacity() { return num("labelOpacity", LABEL_OPACITY_DEFAULT); }
export function overlayColor() { return hex("overlayColor", OVERLAY_COLOR_DEFAULT); }
export function overlayOpacity() { return num("overlayOpacity", OVERLAY_OPACITY_DEFAULT); }

/**
 * The full Drawing style for a room outline. `tint` is an effect's colour, or null
 * for a clean room, which then wears the colour picker's setting.
 */
export function overlayStyle(tint = null) {
  const color = tint || overlayColor();
  return { fillType: 1, fillColor: color, strokeColor: color, ...overlayAlphas(overlayOpacity(), !!tint) };
}

// The handlers are passed in so this file stays free of label and drawing internals.
export function registerSettings({ onRebuild, onRefresh, onOverlay } = {}) {
  game.settings.register(MODULE_ID, "labelOpacity", {
    name: "Room label opacity",
    hint: "How strongly room labels sit on the map at rest. Hovering a label always brings it to full. At 0 labels are invisible until hovered, and stay draggable, so you can still move a room by grabbing where its label sits.",
    scope: "world",
    config: true,
    type: Number,
    range: { min: 0, max: 1, step: 0.05 },
    default: LABEL_OPACITY_DEFAULT,
    onChange: () => onRefresh?.()
  });

  game.settings.register(MODULE_ID, "labelFontSize", {
    name: "Room label size",
    hint: "Point size for room label text. Changing this redraws every label on the current scene, keeping each one centred exactly where it already sits so no room moves.",
    scope: "world",
    config: true,
    type: Number,
    range: { min: 10, max: 40, step: 1 },
    default: LABEL_FS_DEFAULT,
    onChange: () => onRebuild?.()
  });

  game.settings.register(MODULE_ID, "overlayColor", {
    name: "Area overlay colour",
    hint: "The colour a traced room is washed and outlined in. A room carrying an effect (web, fire, smoke) shows that effect's colour instead while it holds.",
    scope: "world",
    config: true,
    type: new foundry.data.fields.ColorField({ required: true, nullable: false, initial: OVERLAY_COLOR_DEFAULT }),
    default: OVERLAY_COLOR_DEFAULT,
    onChange: () => onOverlay?.()
  });

  game.settings.register(MODULE_ID, "overlayOpacity", {
    name: "Area overlay opacity",
    hint: "How strongly room overlays sit on the map. The wash and the outline move together, so 0 turns them off entirely and leaves the bare map. Rooms carrying an effect stay proportionally stronger so they still read at a glance.",
    scope: "world",
    config: true,
    type: Number,
    range: { min: 0, max: 1, step: 0.05 },
    default: OVERLAY_OPACITY_DEFAULT,
    onChange: () => onOverlay?.()
  });
}
