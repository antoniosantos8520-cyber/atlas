// Atlas — shared runtime config. A host system can override via ATLAS.configure({...}).
// Pure-importable (the default functions only touch Foundry globals when CALLED, not at import).

export const CONFIG = {
  // namespace for scene/token flags
  flagScope: "atlas",
  // "is this token one I (the viewing user) own?" — ownership-based, no actor-type strings
  isOwnView: (doc) => !!doc?.actor?.testUserPermission?.(game.user, "OWNER"),
  // which tokens are subject to LOS hiding (markers are excluded — they're the always-visible labels)
  filterToken: (doc) => !!doc?.actor && !doc?.flags?.[CONFIG.flagScope]?.areaMarker,
  // actor type used for the module's own marker actor (null = auto-pick a valid one at runtime) — Phase 5
  markerActorType: null,
  // host hook: ADDITIONAL areas to reveal beyond normal LOS (e.g. a "tremor sense" spell that hears
  // through walls). Called per-client as extraAreas(ownAreas:Set, data, { neighbors }) → an iterable of
  // area labels (or null/undefined for none). Default null = no-op. The host supplies only the *rule*
  // (when/which); `neighbors` is handed in so the host never needs Atlas's graph internals.
  extraAreas: null,
  // host hook: "this token is not a creature walking through rooms, leave it alone". Called as
  // skipMovementGate(doc, movement) -> true to exempt, and only consulted when the movement
  // restriction setting is on. ATLAS can recognise its own room labels and nothing else; a host's
  // party markers, ward lamps and thrown props are invisible to it, and a token TYPE test cannot
  // tell them apart either, because a room label wears a host actor type too. ONE top-level key,
  // so two hosts calling configure() cannot stomp each other the way a sub-object would.
  skipMovementGate: () => false,
  // Area EFFECTS the GM can lay on a room (the marker card's Effects row / ATLAS.setAreaEffect):
  // id → { label, icon, tint, los? }. `tint` recolors the room's outline while the effect holds; `los` is a
  // set of LOS flags WRITTEN ONCE when the effect is applied (Web seals its room) — clearing an effect never
  // writes LOS back (the GM re-toggles by hand). Any game MECHANICS (movement costs, damage, blinding) are
  // the host system's business, keyed by the effect id. Hosts extend/replace via ATLAS.configure({ areaEffects }).
  areaEffects: {
    web:   { label: "Web",   icon: "fa-spider", tint: "#d8dee6", los: { losIn: false, losOut: false } },
    fire:  { label: "Fire",  icon: "fa-fire",   tint: "#ff6b2e" },
    smoke: { label: "Smoke", icon: "fa-smog",   tint: "#8a8f98" },
  }
};

export function configure(opts = {}) {
  Object.assign(CONFIG, opts);
  return CONFIG;
}
