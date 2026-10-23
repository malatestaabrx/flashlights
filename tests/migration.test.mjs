import test from "node:test";
import assert from "node:assert/strict";
import { LEGACY_ID, migrateLegacySettings } from "../scripts/migration.mjs";

function setup() {
  const worldValues = new Map([
    [`${LEGACY_ID}.enabled`, { value: false }],
    [`${LEGACY_ID}.radius`, { value: 350 }],
    [`${LEGACY_ID}.softness`, { value: 0 }],
    [`${LEGACY_ID}.gmLight`, { value: true }],
    [`${LEGACY_ID}.playerPermissions`, { value: { alice: false, bob: true } }]
  ]);
  const clientValues = new Map([[`${LEGACY_ID}.preview`, "true"], [`${LEGACY_ID}.gmOpacity`, "0"]]);
  const writes = [];
  const game = { user: { id: "gm", isGM: true }, users: { activeGM: { id: "gm" } }, settings: {
    storage: new Map([
      ["world", { getSetting: key => worldValues.get(key) }],
      ["client", { getItem: key => clientValues.get(key) ?? null }]
    ]),
    async set(namespace, key, value) {
      assert.equal(namespace, "flashlights");
      writes.push({ key, value });
      if (["preview", "gmOpacity"].includes(key)) clientValues.set(`${namespace}.${key}`, JSON.stringify(value));
      else worldValues.set(`${namespace}.${key}`, { value });
    }
  } };
  return { game, writes, worldValues, clientValues };
}

test("package ID migration preserves settings, player choices, and zero/false preferences", async () => {
  const s = setup();
  await migrateLegacySettings(s.game);
  assert.equal(s.writes.length, 7);
  assert.equal(s.worldValues.get("flashlights.enabled").value, false);
  assert.equal(s.worldValues.get("flashlights.softness").value, 0);
  assert.deepEqual(s.worldValues.get("flashlights.playerPermissions").value, { alice: false, bob: true });
  assert.equal(s.clientValues.get("flashlights.gmOpacity"), "0");
  assert.equal(s.worldValues.get(`${LEGACY_ID}.radius`).value, 350, "keeps the old settings intact");
  await migrateLegacySettings(s.game);
  assert.equal(s.writes.length, 7, "existing new-package settings are never overwritten");
});

test("only the active GM migrates shared settings; players never write settings", async () => {
  const s = setup();
  s.game.users.activeGM.id = "another-gm";
  await migrateLegacySettings(s.game);
  assert.deepEqual(s.writes.map(write => write.key), ["preview", "gmOpacity"]);
  s.game.user.isGM = false;
  await migrateLegacySettings(s.game);
  assert.equal(s.writes.length, 2);
});
