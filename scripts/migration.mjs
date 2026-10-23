// Read the former package namespace only to preserve existing world/browser choices.
export const LEGACY_ID = "linternas-narrativas";
const ID = "flashlights";
const WORLD_KEYS = ["enabled", "radius", "softness", "gmLight", "playerPermissions"];
const CLIENT_KEYS = ["preview", "gmOpacity"];

export async function migrateLegacySettings(game) {
  if (!game.user.isGM) return;
  const world = game.settings.storage?.get("world");
  const client = game.settings.storage?.get("client");
  // Only one connected GM migrates world settings. Every GM migrates their own browser.
  if (!game.users.activeGM || game.users.activeGM.id === game.user.id) {
    for (const key of WORLD_KEYS) {
      if (world?.getSetting(`${ID}.${key}`)) continue;
      const legacy = world?.getSetting(`${LEGACY_ID}.${key}`);
      if (legacy) await game.settings.set(ID, key, legacy.value);
    }
  }
  for (const key of CLIENT_KEYS) {
    if (client?.getItem(`${ID}.${key}`) != null) continue;
    const legacy = client?.getItem(`${LEGACY_ID}.${key}`);
    if (legacy != null) await game.settings.set(ID, key, JSON.parse(legacy));
  }
}
