import test from "node:test";
import assert from "node:assert/strict";
import { installVisionOverride, syncSceneVision, darknessOpacity } from "../scripts/vision.mjs";

test("ignores token vision on load, update, and scene change without saving changes", () => {
  let enabled = true;
  class Scene {
    constructor(vision) { this._source = { tokenVision: vision }; this.reset(); }
    prepareBaseData() { this.basePrepared = true; }
    prepareData() { this.prepareBaseData(); this.availableWithoutToken = !this.tokenVision; }
    reset() { this.tokenVision = this._source.tokenVision; this.prepareData(); }
  }
  installVisionOverride(Scene, () => enabled);
  const first = new Scene(true), second = new Scene(false);
  assert.equal(first.tokenVision, false);
  assert.equal(first.availableWithoutToken, true);
  assert.equal(first._source.tokenVision, true);
  assert.equal(first.basePrepared, true);
  first.reset();
  assert.equal(first.tokenVision, false, "document updates preserve narrative mode");
  enabled = false;
  assert.equal(syncSceneVision([first, second], first, enabled), true);
  assert.equal(first.tokenVision, true);
  assert.equal(first.availableWithoutToken, false);
  assert.equal(second.tokenVision, false);
  enabled = true;
  assert.equal(syncSceneVision([first, second], first, enabled), true);
  assert.equal(first.tokenVision, false);
  assert.equal(syncSceneVision([first, second], first, enabled), false);
  assert.equal(first._source.tokenVision, true);
  const third = new Scene(true);
  assert.equal(third.tokenVision, false, "also applies to new scenes");
});

test("clamps GM opacity to 0–1 and keeps player darkness opaque", () => {
  for (const value of [0, 0.2, 0.65, 1]) assert.equal(darknessOpacity(true, value), value);
  assert.equal(darknessOpacity(true, -4), 0);
  assert.equal(darknessOpacity(true, 7), 1);
  assert.equal(darknessOpacity(true, NaN), 0.65);
  for (const value of [0, 0.2, 1, NaN]) assert.equal(darknessOpacity(false, value), 1);
});
