import test from "node:test";
import assert from "node:assert/strict";
import { BeamStore, contains, interpolate, STALE_MS, canIlluminate } from "../scripts/model.mjs";

const rect = { x: 100, y: 200, width: 1000, height: 800 };
const users = new Map([
  ["p1", { id: "p1", active: true, isGM: false }], ["p2", { id: "p2", active: true, isGM: false }],
  ["gm", { id: "gm", active: true, isGM: true }], ["offline", { id: "offline", active: false, isGM: false }]
]);
const context = (extra = {}) => ({ sceneId: "scene", levelId: "ground", rect, users,
  ownId: "p1", gmLight: false, now: 100, ...extra });
const message = (extra = {}) => ({ v: 1, type: "move", userId: "p2", sceneId: "scene",
  levelId: "ground", x: 400, y: 500, ...extra });

test("accepts only finite points inside the image, including its edges", () => {
  assert.equal(contains(rect, { x: 100, y: 200 }), true);
  assert.equal(contains(rect, { x: 1100, y: 1000 }), true);
  for (const p of [{ x: 99, y: 500 }, { x: 500, y: 1001 }, { x: NaN, y: 500 },
    { x: Infinity, y: 500 }, { x: "400", y: 500 }]) assert.equal(contains(rect, p), false);
});

test("isolates scenes, levels, disconnected users, and invalid messages", () => {
  const store = new BeamStore();
  for (const m of [null, message({ v: 2 }), message({ type: "unknown" }),
    message({ sceneId: "other" }), message({ levelId: "upstairs" }),
    message({ userId: "offline" }), message({ userId: "unknown" }),
    message({ userId: "p1" }), message({ x: NaN }), message({ y: 1001 })]) {
    assert.equal(store.receive(m, context()), false);
  }
  assert.equal(store.beams.size, 0);
  assert.equal(store.receive(message(), context()), true);
});

test("the GM flashlight requires sharing to be enabled", () => {
  const store = new BeamStore();
  assert.equal(store.receive(message({ userId: "gm" }), context()), false);
  assert.equal(store.receive(message({ userId: "gm" }), context({ gmLight: true })), true);
  assert.equal(store.prune(users, 101, false), true);
  assert.equal(store.beams.size, 0);
});

test("per-player choices control illumination without affecting who can receive shared light", () => {
  assert.equal(canIlluminate(users.get("p1")), true, "existing players keep their flashlight by default");
  assert.equal(canIlluminate(users.get("p1"), { p1: false }), false);
  assert.equal(canIlluminate(users.get("gm"), { gm: true }, false), false);
  const store = new BeamStore();
  assert.equal(store.receive(message(), context({ playerPermissions: { p1: false } })), true,
    "a viewer without a flashlight receives an enabled teammate's flashlight");
  assert.equal(store.prune(users, 101, false, { p2: false }), true);
  assert.equal(store.beams.size, 0);
  assert.equal(store.receive(message(), context({ playerPermissions: { p2: false } })), false);
  assert.equal(store.receive(message(), context({ playerPermissions: { p2: true } })), true);
});

test("interpolates remote movement and holds the final position", () => {
  const store = new BeamStore();
  store.receive(message(), context());
  store.receive(message({ x: 800 }), context({ now: 200 }));
  const beam = store.beams.get("p2");
  assert.deepEqual(interpolate(beam, 200), { x: 400, y: 500 });
  assert.deepEqual(interpolate(beam, 240), { x: 600, y: 500 });
  assert.deepEqual(interpolate(beam, 5000), { x: 800, y: 500 });
});

test("heartbeats keep stationary flashlights active; disconnections and hide remove them", () => {
  const store = new BeamStore();
  store.receive(message(), context());
  store.receive(message(), context({ now: 2100 }));
  assert.equal(store.prune(users, 3000, false), false);
  assert.equal(store.beams.size, 1);
  assert.equal(store.prune(users, 2101 + STALE_MS, false), true);
  store.receive(message(), context());
  const disconnected = new Map(users);
  disconnected.set("p2", { active: false });
  assert.equal(store.prune(disconnected, 101, false), true);
  store.receive(message(), context());
  assert.equal(store.receive(message({ type: "hide" }), context()), true);
  assert.equal(store.beams.size, 0);
});
