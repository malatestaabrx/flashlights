import { canIlluminate } from "./model.mjs";

const ID = "linternas-narrativas";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const openWindows = new Set();
let pendingSave = Promise.resolve();

export function refreshPlayerWindows() {
  for (const window of openWindows) if (window.rendered) window.render({ force: true });
}

async function savePlayer(event) {
  if (!game.user.isGM) throw new Error("Only the GM can assign flashlights.");
  const userId = event.target?.dataset?.userId;
  if (!userId) return;
  const enabled = event.target.checked;
  // Serialize changes so rapidly toggling several players preserves every selection.
  const save = pendingSave.catch(() => {}).then(async () => {
    if (!game.user.isGM) throw new Error("Only the GM can assign flashlights.");
    const user = game.users.get(userId);
    if (!user || user.isGM) return;
    const permissions = { ...game.settings.get(ID, "playerPermissions"), [userId]: enabled };
    await game.settings.set(ID, "playerPermissions", permissions);
  });
  pendingSave = save;
  try { await save; }
  catch (error) { refreshPlayerWindows(); throw error; }
}

export class PlayerFlashlightsConfig extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "flashlights-players-config", tag: "form",
    position: { width: 480, height: "auto" },
    window: { title: "Flashlights! — Connected players", icon: "fa-solid fa-lightbulb", resizable: true },
    actions: {
      refreshPlayers: async function () {
        if (!game.user.isGM) throw new Error("Only the GM can refresh the player list.");
        await pendingSave.catch(() => {});
        await this.render({ force: true });
      }
    },
    form: { submitOnChange: true, closeOnSubmit: false, handler: savePlayer }
  };

  static PARTS = { form: { template: `modules/${ID}/templates/players.hbs` } };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    if (!game.user.isGM) throw new Error("Only the GM can assign flashlights.");
    const permissions = game.settings.get(ID, "playerPermissions");
    const players = game.users.contents.filter(user => user.active && !user.isGM)
      .map(user => ({ id: user.id, name: user.name, enabled: canIlluminate(user, permissions) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { ...context, players };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    if (openWindows.has(this)) return;
    openWindows.add(this);
    this._rosterHooks = ["userConnected", "createUser", "updateUser", "deleteUser"]
      .map(name => [name, Hooks.on(name, refreshPlayerWindows)]);
  }

  _onClose(options) {
    openWindows.delete(this);
    for (const [name, hookId] of this._rosterHooks ?? []) Hooks.off(name, hookId);
    this._rosterHooks = [];
    super._onClose(options);
  }
}
