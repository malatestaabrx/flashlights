import { BeamStore, contains, interpolate, canIlluminate } from "./model.mjs";
import { installVisionOverride, syncSceneVision, darknessOpacity } from "./vision.mjs";
import { PlayerFlashlightsConfig, refreshPlayerWindows } from "./players-config.mjs";
import { createSettingsAccess } from "./settings-access.mjs";

const ID = "linternas-narrativas";
const CHANNEL = `module.${ID}`;
const store = new BeamStore();
let mask, ctx, frame, networkTimer, pointer = null, sceneId = null, levelId = null;
let local = null, lastSent = null, lastSentAt = 0, lastDrawing = "", dirty = true;
let started = false, drawingReady = false;
let updateConfigurationAccess;
const setting = key => game.settings.get(ID, key);
const running = () => started && setting("enabled");
const preview = () => game.user.isGM && setting("preview");
const masked = () => running() && (!game.user.isGM || preview());
const sharing = () => running() && canIlluminate(game.user, setting("playerPermissions"), setting("gmLight"));
const board = () => document.getElementById("board");

Hooks.once("init", () => {
  // The current user is not available during init. Expose settings after user setup.
  const options = { scope: "world", config: false, restricted: true, onChange: refresh };
  game.settings.register(ID, "playerPermissions", { ...options, config: false,
    type: Object, default: {}, onChange: () => { refresh(); refreshPlayerWindows(); } });
  game.settings.registerMenu(ID, "players", {
    name: "Player flashlights", label: "Configure connected players",
    hint: "Choose who has a flashlight. Players without one still see their teammates' light.",
    icon: "fa-solid fa-lightbulb", type: PlayerFlashlightsConfig, restricted: true
  });
  game.settings.register(ID, "enabled", { ...options, name: "Enable flashlights",
    hint: "Darkens scenes and shares cursor flashlights. While enabled, token vision is ignored without changing the saved scene settings.",
    type: Boolean, default: true });
  game.settings.register(ID, "radius", { ...options, name: "Flashlight radius (scene pixels)",
    hint: "Scales with zoom. A radius of 200 reveals a circle 400 pixels across on the scene image.",
    type: Number, default: 200, range: { min: 20, max: 2000, step: 10 } });
  game.settings.register(ID, "softness", { ...options, name: "Edge softness (%)",
    hint: "0 gives a sharp circle. 20 softens the outer 20% of the radius.",
    type: Number, default: 20, range: { min: 0, max: 80, step: 5 } });
  game.settings.register(ID, "gmLight", { ...options, name: "Share the GM flashlight",
    hint: "Shares the flashlight around the GM cursor with the players.",
    type: Boolean, default: false });
  game.settings.register(ID, "preview", { ...options, scope: "client", name: "View as players (GM)",
    hint: "Shows the same shared flashlights, using the darkness opacity below. The GM cursor only illuminates the scene if Share the GM flashlight is enabled.",
    type: Boolean, default: false });
  game.settings.register(ID, "gmOpacity", { ...options, scope: "client", name: "GM darkness opacity",
    hint: "Applies when View as players is enabled. 0: no darkening. 1: fully black, as seen by players. Only affects this GM browser.",
    type: Number, default: 0.65, range: { min: 0, max: 1, step: 0.05 } });
  installVisionOverride(CONFIG.Scene.documentClass, () => setting("enabled"));
  const applyAccess = createSettingsAccess(game.settings, ID);
  updateConfigurationAccess = () => applyAccess(game.user?.isGM === true);
  updateConfigurationAccess();
});

Hooks.on("setup", () => updateConfigurationAccess?.());
Hooks.on("updateUser", user => {
  if (user.id === game.user?.id) updateConfigurationAccess?.();
});

Hooks.once("ready", () => {
  started = true;
  updateConfigurationAccess();
  game.socket.on(CHANNEL, receive);
  document.addEventListener("pointermove", onPointer, { passive: true });
  document.addEventListener("pointerout", event => { if (!event.relatedTarget) hideLocal(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) hideLocal(); });
  window.addEventListener("blur", hideLocal);
  window.addEventListener("pagehide", hideLocal);
  window.addEventListener("resize", () => { dirty = true; });
  game.modules.get(ID).api = Object.freeze({
    setEnabled: enabled => {
      if (!game.user.isGM) throw new Error("Only the GM can enable flashlights.");
      return game.settings.set(ID, "enabled", !!enabled);
    },
    preview: () => {
      if (!game.user.isGM) throw new Error("Only the GM can toggle the player preview.");
      return game.settings.set(ID, "preview", !setting("preview"));
    }
  });
  if (canvas.ready) enterScene();
  else refresh();
});

Hooks.on("canvasReady", () => { if (started) enterScene(); });
Hooks.on("canvasTearDown", () => {
  if (!started) return;
  hideLocal();
  drawingReady = false;
  sceneId = levelId = null;
  store.beams.clear();
  dirty = true;
  if (mask) paint([]);
});
Hooks.on("canvasPan", () => { dirty = true; });

function enterScene() {
  hideLocal();
  sceneId = canvas.scene?.id ?? null;
  levelId = canvas.level?.id ?? null;
  store.beams.clear();
  drawingReady = true;
  refresh();
}

function refresh() {
  if (!started) return;
  if (!running()) {
    hideLocal();
    store.beams.clear();
  }
  if (!sharing() && lastSent) sendHide();
  store.prune(game.users, performance.now(), setting("gmLight"), setting("playerPermissions"));
  if (masked()) ensureMask();
  else { mask?.remove(); mask = ctx = null; }
  // Redraw only when the effective token-vision mode changes. Radius/opacity changes
  // do not reload the scene. New and updated Scenes also pass through data preparation.
  if (syncSceneVision(game.scenes, canvas.scene, running()) && canvas.ready) {
    void canvas.draw().catch(error => {
      console.error(`${ID} | Failed to update scene vision`, error);
      ui.notifications.error("Flashlights!: could not update the scene. Reload your browser.");
    });
  }
  dirty = true;
  lastDrawing = "";
  cancelAnimationFrame(frame);
  clearInterval(networkTimer);
  if (running()) {
    frame = requestAnimationFrame(tick);
    networkTimer = setInterval(transmit, 50);
  }
}

function ensureMask() {
  if (mask) return;
  mask = document.createElement("canvas");
  mask.id = `${ID}-mask`;
  mask.setAttribute("aria-hidden", "true");
  ctx = mask.getContext("2d");
  paint([]);
  document.body.append(mask);
}

function onPointer(event) {
  if (event.pointerType === "touch") return;
  if (event.target !== board()) { hideLocal(); return; }
  pointer = { x: event.clientX, y: event.clientY };
  dirty = true;
}

function hideLocal() {
  pointer = local = null;
  if (lastSent) sendHide();
  dirty = true;
}

function sendHide() {
  game.socket.emit(CHANNEL, { v: 1, type: "hide", userId: game.user.id,
    sceneId: lastSent?.sceneId ?? sceneId, levelId: lastSent?.levelId ?? levelId });
  lastSent = null;
  lastSentAt = 0;
}

function updateLocal() {
  local = null;
  if (!pointer || !drawingReady || !canvas.ready || document.hidden || !sceneId) return;
  // A camera move may put UI or another part of the image beneath a stationary cursor.
  if (document.elementFromPoint(pointer.x, pointer.y) !== board()) return;
  const point = canvas.canvasCoordinatesFromClient(pointer);
  if (contains(canvas.dimensions?.sceneRect, point)) local = point;
}

function transmit() {
  updateLocal();
  if (!sharing() || !local) { if (lastSent) sendHide(); return; }
  const now = performance.now();
  if (lastSent && lastSent.x === local.x && lastSent.y === local.y && now - lastSentAt < 500) return;
  const message = { v: 1, type: "move", userId: game.user.id, sceneId, levelId, x: local.x, y: local.y };
  game.socket.emit(CHANNEL, message);
  lastSent = message;
  lastSentAt = now;
}

function receive(message) {
  if (!running() || !drawingReady || !sceneId) return;
  if (store.receive(message, { sceneId, levelId, rect: canvas.dimensions?.sceneRect,
    users: game.users, ownId: game.user.id, gmLight: setting("gmLight"),
    playerPermissions: setting("playerPermissions"), now: performance.now() })) dirty = true;
}

function tick(now) {
  if (!running()) return;
  updateLocal();
  if (store.prune(game.users, now, setting("gmLight"), setting("playerPermissions"))) dirty = true;
  if (mask) {
    const points = [];
    if (drawingReady && canvas.ready) {
      for (const beam of store.beams.values()) points.push(interpolate(beam, now));
      if (local && sharing()) points.push(local);
    }
    const circles = points.map(point => {
      const center = canvas.clientCoordinatesFromCanvas(point);
      const edge = canvas.clientCoordinatesFromCanvas({ x: point.x + Number(setting("radius")), y: point.y });
      return { x: center.x, y: center.y, radius: Math.hypot(edge.x - center.x, edge.y - center.y) };
    });
    const signature = circles.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)},${p.radius.toFixed(2)}`).join(";");
    if (dirty || signature !== lastDrawing) {
      paint(circles);
      dirty = false;
      lastDrawing = signature;
    }
  }
  frame = requestAnimationFrame(tick);
}

function paint(circles) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = window.innerWidth, height = window.innerHeight;
  const w = Math.ceil(width * dpr), h = Math.ceil(height * dpr);
  if (mask.width !== w || mask.height !== h) { mask.width = w; mask.height = h; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  // Clear before painting translucent darkness so opacity does not accumulate.
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = `rgba(0,0,0,${darknessOpacity(game.user.isGM, setting("gmOpacity"))})`;
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = "destination-out";
  const softness = Math.max(0, Math.min(0.8, Number(setting("softness")) / 100));
  for (const { x, y, radius } of circles) {
    if (!Number.isFinite(radius) || radius <= 0) continue;
    ctx.fillStyle = "#000";
    if (softness) {
      const gradient = ctx.createRadialGradient(x, y, radius * (1 - softness), x, y, radius);
      gradient.addColorStop(0, "rgba(0,0,0,1)");
      gradient.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = gradient;
    }
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
}
