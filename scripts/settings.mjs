// Atlas — module settings + the pure readers that depend on them.
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
export const BLACKOUT_FILL = "#0d0b14";
export const BLACKOUT_EDGE = "#5b9bff";

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

// A table rule rather than a look: is a player held to the connection matrix when they move?
// Strict false, so a setting that has never been touched, or is read before init, is OFF.
export function movementRestricted() { return raw("restrictMovement") === true; }

/**
 * Turn the traffic rule on or off from a surface other than the settings menu.
 *
 * ⚠ GM ONLY, and a WORLD setting: this is one switch for the whole table, not a per-client
 *   preference, so a player pressing it would fail at the socket rather than quietly do nothing.
 */
export async function setMovementRestricted(on) {
  if (!game.user?.isGM) return false;
  await game.settings.set(MODULE_ID, "restrictMovement", !!on);
  return true;
}

export function labelFontSize() { return num("labelFontSize", LABEL_FS_DEFAULT); }
export function labelOpacity() { return num("labelOpacity", LABEL_OPACITY_DEFAULT); }
export function overlayColor() { return hex("overlayColor", OVERLAY_COLOR_DEFAULT); }
export function overlayOpacity() { return num("overlayOpacity", OVERLAY_OPACITY_DEFAULT); }

// A tiled diagonal hatch, generated once and reused, so a scene with ten hidden rooms carries one
// small data URL rather than ten. Base64 image data is a valid value for a Drawing's texture field
// (FilePathField accepts it alongside a file extension), which is the same trick the room labels
// already use for their own generated textures.
let _hatch = null;
export function hatchTexture() {
  if (_hatch) return _hatch;
  const S = 16;
  const c = document.createElement("canvas");
  c.width = S; c.height = S;
  const ctx = c.getContext("2d");
  ctx.fillStyle = BLACKOUT_FILL;
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = "rgba(255,255,255,0.13)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  // three passes so the 45 degree stripes meet cleanly across the tile seam
  for (let i = -S; i <= S * 2; i += S / 2) { ctx.moveTo(i, S); ctx.lineTo(i + S, 0); }
  ctx.stroke();
  _hatch = c.toDataURL();
  return _hatch;
}

/**
 * How a BLACKED-OUT room is drawn, and it is only ever drawn for the Keeper: a player's client
 * zeroes the outline's alpha entirely (⚓ blackout.mjs). So this can be as loud as it likes; the
 * point is that the Keeper can never mistake a hidden room for an ordinary one.
 */
export function blackoutStyle() {
  return {
    fillType: 2,                                  // PATTERN, so the hatch reads as "not really here"
    texture: hatchTexture(),
    fillColor: BLACKOUT_FILL,
    fillAlpha: 0.94,
    strokeColor: BLACKOUT_EDGE,
    strokeAlpha: 0.9,
  };
}

/**
 * The full Drawing style for a room outline. `tint` is an effect's colour, or null
 * for a clean room, which then wears the colour picker's setting.
 */
export function overlayStyle(tint = null) {
  const color = tint || overlayColor();
  return { fillType: 1, fillColor: color, strokeColor: color, ...overlayAlphas(overlayOpacity(), !!tint) };
}

// The handlers are passed in so this file stays free of label and drawing internals.
export function registerSettings({ onRebuild, onRefresh, onOverlay, onTraffic } = {}) {
  game.settings.register(MODULE_ID, "restrictMovement", {
    name: "Restrict movement to connected rooms",
    hint: "A player may only move a token between rooms joined in the connection matrix; a move to a room that is not connected is refused and the token stays where it is. Connections are doors, not adjacency, so two rooms can share a wall and still not be joined. The GM is never restricted. A token standing outside every traced room is free to move anywhere, and a map with no connections yet is left alone.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    // ⚠ The panel draws this switch too, so it has to hear about the settings menu, and about
    //   the other GM. A surface that shows a world rule and does not watch it goes stale silently.
    onChange: () => onTraffic?.()
  });

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
