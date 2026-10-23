import test from "node:test";
import assert from "node:assert/strict";
import { createSettingsAccess } from "../scripts/settings-access.mjs";

test("only GMs see module configuration; runtime settings and unrelated menus are preserved", () => {
  const namespace = "flashlights";
  const keys = ["enabled", "shareVision", "radius", "softness", "gmLight", "preview", "gmOpacity", "playerPermissions"];
  const menu = { restricted: true };
  const settings = {
    settings: new Map(keys.map(key => [`${namespace}.${key}`, { config: true, default: key }])),
    menus: new Map([[`${namespace}.players`, menu], ["other.config", {}]])
  };
  const applyAccess = createSettingsAccess(settings, namespace);
  applyAccess(undefined);
  assert.equal([...settings.settings.values()].some(definition => definition.config), false);
  assert.equal(settings.menus.has(`${namespace}.players`), false);
  assert.equal(settings.settings.size, 8, "players retain runtime access to shared settings");
  assert.equal(settings.menus.has("other.config"), true);
  applyAccess(true);
  assert.equal([...settings.settings.values()].filter(definition => definition.config).length, 7);
  assert.equal(settings.settings.get(`${namespace}.playerPermissions`).config, false);
  assert.equal(settings.menus.get(`${namespace}.players`), menu);
  applyAccess(false);
  assert.equal([...settings.settings.values()].some(definition => definition.config), false);
  assert.equal(settings.menus.has(`${namespace}.players`), false, "demotion hides configuration again");
});
