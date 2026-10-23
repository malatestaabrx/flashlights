import test from "node:test";
import assert from "node:assert/strict";

test("GM configuration lists connected players, preserves choices, and serializes changes", async () => {
  globalThis.foundry = { applications: { api: {
    ApplicationV2: class {
      rendered = true;
      renders = 0;
      async _prepareContext() { return {}; }
      async _onRender() {}
      _onClose() {}
      render() { this.renders++; }
    }, HandlebarsApplicationMixin: Base => Base
  } } };
  const hooks = new Map();
  globalThis.Hooks = { on: (name, fn) => { hooks.set(name, fn); return fn; },
    off: (name, fn) => { if (hooks.get(name) === fn) hooks.delete(name); } };
  const users = new Map([
    ["a", { id: "a", name: "Alice", active: true, isGM: false }],
    ["b", { id: "b", name: "Bob", active: true, isGM: false }],
    ["c", { id: "c", name: "Charlie", active: false, isGM: false }],
    ["gm", { id: "gm", name: "GM", active: true, isGM: true }]
  ]);
  Object.defineProperty(users, "contents", { get: () => [...users.values()] });
  let permissions = { c: false };
  const writes = [];
  globalThis.game = { user: { isGM: true }, users, settings: {
    get: () => permissions,
    async set(id, key, value) { await Promise.resolve(); permissions = value; writes.push(value); }
  } };
  const { PlayerFlashlightsConfig } = await import("../scripts/players-config.mjs");
  const app = new PlayerFlashlightsConfig();
  assert.deepEqual((await app._prepareContext({})).players,
    [{ id: "a", name: "Alice", enabled: true }, { id: "b", name: "Bob", enabled: true }]);
  await app._onRender({}, {});
  await app._onRender({}, {});
  assert.equal(hooks.size, 4, "rerendering does not register duplicate connection listeners");
  users.get("c").active = true;
  hooks.get("userConnected")();
  assert.equal(app.renders, 1);
  assert.equal((await app._prepareContext({})).players[2].enabled, false,
    "a reconnecting player retains their saved choice");
  const save = PlayerFlashlightsConfig.DEFAULT_OPTIONS.form.handler;
  await Promise.all([
    save.call(app, { target: { dataset: { userId: "a" }, checked: false } }),
    save.call(app, { target: { dataset: { userId: "b" }, checked: false } })
  ]);
  assert.deepEqual(permissions, { a: false, b: false, c: false });
  assert.equal(writes.length, 2);
  users.get("b").active = false;
  await PlayerFlashlightsConfig.DEFAULT_OPTIONS.actions.refreshPlayers.call(app);
  assert.equal(app.renders, 2, "the manual refresh button rerenders the list");
  assert.deepEqual((await app._prepareContext({})).players.map(player => player.id), ["a", "c"]);
  assert.equal(writes.length, 2, "refreshing preserves saved flashlight choices");
  game.user.isGM = false;
  await assert.rejects(save.call(app, { target: { dataset: { userId: "a" }, checked: true } }), /Only the GM/);
  await assert.rejects(app._prepareContext({}), /Only the GM/);
  assert.equal(writes.length, 2);
  app._onClose({});
  assert.equal(hooks.size, 0, "closing releases the connection listeners");
});
