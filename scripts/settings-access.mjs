// Foundry does not apply world-setting restrictions to client-scoped settings.
// Keep the settings registered for runtime reads, but expose configuration only to GMs.
export function createSettingsAccess(clientSettings, namespace) {
  const visibleKeys = ["enabled", "radius", "softness", "gmLight", "preview", "gmOpacity"];
  const menuKey = `${namespace}.players`;
  const playerMenu = clientSettings.menus.get(menuKey);
  return isGM => {
    for (const key of visibleKeys) {
      clientSettings.settings.get(`${namespace}.${key}`).config = isGM === true;
    }
    clientSettings.settings.get(`${namespace}.playerPermissions`).config = false;
    // Hide the menu even for a player role granted SETTINGS_MODIFY by another configuration.
    if (isGM === true) clientSettings.menus.set(menuKey, playerMenu);
    else clientSettings.menus.delete(menuKey);
  };
}
