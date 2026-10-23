import test from "node:test";
import assert from "node:assert/strict";

test("mask, cursor, synchronization, zoom, and cleanup in a simulated client", async () => {
  const hooks = new Map(), listeners = new Map(), settings = new Map(), definitions = new Map();
  const frames = new Map(), intervals = new Map(), socketMessages = [], drawing = [];
  const fills = [];
  let counter = 0, receiver, boardTarget = true;
  const board = { id: "board" };
  const ctx = {
    setTransform() {}, clearRect() { drawing.push("clear"); },
    fillRect() { drawing.push("black"); fills.push(this.fillStyle); }, beginPath() {},
    arc(x, y, r) { drawing.push({ x, y, r }); }, fill() {},
    createRadialGradient() { return { addColorStop() {} }; }
  };
  let overlay;
  globalThis.Hooks = { once: (name, fn) => hooks.set(name, fn), on: (name, fn) => hooks.set(name, fn) };
  globalThis.requestAnimationFrame = fn => { const id = ++counter; frames.set(id, fn); return id; };
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  globalThis.setInterval = fn => { const id = ++counter; intervals.set(id, fn); return id; };
  globalThis.clearInterval = id => intervals.delete(id);
  globalThis.window = { innerWidth: 1200, innerHeight: 800, devicePixelRatio: 1,
    addEventListener: (name, fn) => listeners.set(name, fn) };
  globalThis.document = {
    hidden: false, getElementById: () => board,
    elementFromPoint: () => boardTarget ? board : {},
    addEventListener: (name, fn) => listeners.set(name, fn),
    createElement: () => ({ width: 0, height: 0, setAttribute() {}, getContext: () => ctx,
      remove() { overlay = null; } }), body: { append(value) { overlay = value; } }
  };
  const users = new Map([["self", { id: "self", active: true }], ["other", { id: "other", active: true }]]);
  globalThis.game = {
    user: { id: "self", isGM: false }, users, modules: new Map([["flashlights", {}]]),
    settings: {
      settings: new Map(), menus: new Map(),
      registerMenu(id, key, options) { this.menus.set(`${id}.${key}`, options); },
      register(id, key, options) {
        definitions.set(key, options); settings.set(key, options.default);
        this.settings.set(`${id}.${key}`, options);
      },
      get: (id, key) => settings.get(key),
      async set(id, key, value) { settings.set(key, value); definitions.get(key).onChange(); }
    },
    socket: { on(channel, fn) { receiver = fn; }, emit(channel, message) { socketMessages.push(message); } }
  };
  let zoom = 1;
  globalThis.canvas = {
    ready: true, scene: { id: "scene", tokenVision: false }, level: { id: "level" },
    dimensions: { sceneRect: { x: 0, y: 0, width: 2000, height: 2000 } },
    canvasCoordinatesFromClient: p => ({ x: p.x / zoom, y: p.y / zoom }),
    clientCoordinatesFromCanvas: p => ({ x: p.x * zoom, y: p.y * zoom })
  };
  globalThis.ui = { notifications: { warn() {} } };
  class Scene {
    constructor() { this.id = "scene"; this._source = Object.freeze({ tokenVision: true }); this.tokenVision = true; }
    prepareBaseData() {}
    prepareData() { this.prepareBaseData(); }
  }
  globalThis.CONFIG = { Scene: { documentClass: Scene } };
  globalThis.foundry = { applications: { api: {
    ApplicationV2: class {}, HandlebarsApplicationMixin: Base => Base
  } } };
  canvas.scene = new Scene();
  game.scenes = [canvas.scene];
  let redraws = 0;
  canvas.draw = async () => { redraws++; };
  const animate = () => {
    const [id, fn] = frames.entries().next().value;
    frames.delete(id); fn(performance.now() + 100);
  };
  const transmit = () => [...intervals.values()][0]();
  await import("../scripts/main.mjs");
  hooks.get("init")();
  await hooks.get("ready")();
  assert.equal([...definitions.values()].some(definition => definition.config), false,
    "players see none of the module settings, including GM client preferences");
  assert.equal(game.settings.menus.has("flashlights.players"), false);
  assert.ok(overlay);
  assert.equal(canvas.scene.tokenVision, false);
  assert.equal(canvas.scene._source.tokenVision, true, "does not modify saved token vision");
  assert.equal(redraws, 1);
  assert.equal(drawing.at(-1), "black");
  assert.equal(fills.at(-1), "rgba(0,0,0,1)");
  listeners.get("pointermove")({ target: board, pointerType: "mouse", clientX: 300, clientY: 400 });
  animate();
  assert.deepEqual(drawing.at(-1), { x: 300, y: 400, r: 200 });
  transmit();
  assert.deepEqual(socketMessages.at(-1), { v: 1, type: "move", userId: "self",
    sceneId: "scene", levelId: "level", x: 300, y: 400 });
  const sent = socketMessages.length;
  transmit();
  assert.equal(socketMessages.length, sent, "does not repeat stationary cursor messages before the heartbeat");
  receiver({ v: 1, type: "move", userId: "other", sceneId: "scene", levelId: "level", x: 900, y: 200 });
  drawing.length = 0;
  animate();
  assert.equal(drawing.filter(d => typeof d === "object").length, 2);
  await game.settings.set("flashlights", "shareVision", "individual");
  assert.equal(socketMessages.at(-1).type, "hide", "switching to individual vision withdraws shared light");
  drawing.length = 0;
  animate();
  assert.deepEqual(drawing.filter(d => typeof d === "object"), [{ x: 300, y: 400, r: 200 }],
    "individual vision keeps the local flashlight but removes remote openings");
  const privateMessages = socketMessages.length;
  transmit();
  assert.equal(socketMessages.length, privateMessages, "individual vision does not broadcast cursor movement");
  receiver({ v: 1, type: "move", userId: "other", sceneId: "scene", levelId: "level", x: 900, y: 200 });
  animate();
  assert.equal(drawing.filter(d => typeof d === "object").length, 1,
    "in-flight remote messages cannot reveal another flashlight in individual vision");
  await game.settings.set("flashlights", "playerPermissions", { self: false });
  drawing.length = 0;
  animate();
  assert.equal(drawing.filter(d => typeof d === "object").length, 0,
    "a player without a flashlight sees no openings in individual vision");
  await game.settings.set("flashlights", "playerPermissions", {});
  await game.settings.set("flashlights", "shareVision", "shared");
  transmit();
  assert.equal(socketMessages.at(-1).type, "move", "shared mode resumes without a browser reload");
  receiver({ v: 1, type: "move", userId: "other", sceneId: "scene", levelId: "level", x: 900, y: 200 });
  drawing.length = 0;
  animate();
  assert.equal(drawing.filter(d => typeof d === "object").length, 2);
  zoom = 2;
  animate();
  assert.deepEqual(drawing.at(-1), { x: 300, y: 400, r: 400 });
  await game.settings.set("flashlights", "playerPermissions", { self: false });
  assert.equal(socketMessages.at(-1).type, "hide", "revoking a local flashlight immediately hides it for peers");
  drawing.length = 0;
  animate();
  assert.equal(drawing.filter(d => typeof d === "object").length, 1,
    "a player without a flashlight still sees a teammate's flashlight, without a local opening");
  const messagesWithoutFlashlight = socketMessages.length;
  transmit();
  assert.equal(socketMessages.length, messagesWithoutFlashlight, "disabled players do not broadcast movement");
  await game.settings.set("flashlights", "playerPermissions", { self: false, other: false });
  drawing.length = 0;
  animate();
  assert.equal(drawing.filter(d => typeof d === "object").length, 0,
    "revoking a teammate's flashlight removes its existing opening immediately");
  receiver({ v: 1, type: "move", userId: "other", sceneId: "scene", levelId: "level", x: 900, y: 200 });
  drawing.length = 0;
  animate();
  assert.equal(drawing.filter(d => typeof d === "object").length, 0,
    "movement packets cannot restore a disabled flashlight");
  await game.settings.set("flashlights", "playerPermissions", {});
  receiver({ v: 1, type: "move", userId: "other", sceneId: "scene", levelId: "level", x: 900, y: 200 });
  transmit();
  boardTarget = false;
  transmit();
  assert.equal(socketMessages.at(-1).type, "hide");
  game.user.isGM = true;
  hooks.get("updateUser")(game.user);
  assert.equal(definitions.get("preview").config, true);
  assert.equal(definitions.get("gmOpacity").config, true);
  assert.equal(game.settings.menus.has("flashlights.players"), true);
  await game.settings.set("flashlights", "preview", true);
  await game.settings.set("flashlights", "gmOpacity", 0.4);
  drawing.length = 0;
  animate();
  assert.equal(fills.at(-1), "rgba(0,0,0,0.4)");
  assert.deepEqual(drawing.slice(0, 2), ["clear", "black"], "clears the previous mask to prevent opacity accumulation");
  assert.equal(redraws, 1, "changing opacity does not reload the scene");
  boardTarget = true;
  listeners.get("pointermove")({ target: board, pointerType: "mouse", clientX: 300, clientY: 400 });
  drawing.length = 0;
  animate();
  assert.equal(drawing.filter(d => typeof d === "object").length, 1, "the GM sees only the shared player flashlight");
  await game.settings.set("flashlights", "gmLight", true);
  drawing.length = 0;
  animate();
  assert.equal(drawing.filter(d => typeof d === "object").length, 2, "the GM adds their own flashlight when sharing is enabled");
  await game.settings.set("flashlights", "shareVision", "individual");
  drawing.length = 0;
  animate();
  assert.equal(drawing.filter(d => typeof d === "object").length, 1,
    "the GM preview follows individual vision and shows only the GM flashlight");
  await game.settings.set("flashlights", "shareVision", "shared");
  for (const opacity of [0, 1]) {
    await game.settings.set("flashlights", "gmOpacity", opacity);
    animate();
    assert.equal(fills.at(-1), `rgba(0,0,0,${opacity})`);
  }
  game.user.isGM = false;
  await game.settings.set("flashlights", "gmOpacity", 0);
  animate();
  assert.equal(fills.at(-1), "rgba(0,0,0,1)", "players always have opaque darkness");
  hooks.get("canvasTearDown")();
  assert.equal(drawing.at(-1), "black", "switching scenes closes all openings immediately");
  await game.settings.set("flashlights", "enabled", false);
  assert.equal(overlay, null);
  assert.equal(frames.size, 0);
  assert.equal(intervals.size, 0);
  assert.equal(canvas.scene.tokenVision, true, "disabling flashlights restores original vision");
  assert.equal(redraws, 2);
  assert.throws(() => game.modules.get("flashlights").api.setEnabled(true), /GM/);
});
