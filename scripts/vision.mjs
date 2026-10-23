// Override prepared client data only. Never update the persisted Scene source.
const installed = new WeakSet();

export function installVisionOverride(SceneClass, enabled) {
  const prototype = SceneClass.prototype;
  if (installed.has(prototype)) return;
  const prepareBaseData = prototype.prepareBaseData;
  prototype.prepareBaseData = function (...args) {
    const result = prepareBaseData.apply(this, args);
    if (enabled()) this.tokenVision = false;
    return result;
  };
  installed.add(prototype);
}

export function syncSceneVision(scenes, viewedScene, enabled) {
  let redraw = false;
  for (const scene of scenes) {
    const effective = enabled ? false : Boolean(scene._source.tokenVision);
    if (scene.tokenVision === effective) continue;
    scene.tokenVision = effective;
    scene.prepareData();
    if (scene === viewedScene) redraw = true;
  }
  return redraw;
}

export function darknessOpacity(isGM, configured) {
  if (!isGM) return 1;
  const opacity = Number(configured);
  return Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : 0.65;
}
