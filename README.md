# Flashlights! — Foundry VTT 14

Version 0.3.5. A black mask covers the players' scene. Each cursor opens a circular area visible to everyone viewing the same scene and level. Areas turn black again as the cursor moves away; exploration is not saved. No tokens are required, and flashlights ignore walls and fog of war. No dependencies. Works with any game system.

## Installation and testing

After the GitHub release is published, install from **Add-on Modules → Install Module** using this manifest URL:

```text
https://github.com/malatestaabrx/flashlights/releases/latest/download/module.json
```

Alternatively, install manually:

1. Copy the `flashlights` folder to `Data/modules/` in your Foundry 14 user data directory. The manifest must be at `Data/modules/flashlights/module.json`. Modules are installed in the shared modules directory and enabled separately in each world.
2. Restart Foundry if it was running. Open your world and enable **Flashlights!** in **Manage Modules**.
3. Use a scene with a background image and darkness set to 0 to see its original colors. While flashlights are enabled, the module treats token vision as disabled on all clients, even if it is checked in the scene settings. The saved value remains unchanged and takes effect again when flashlights are disabled. This also applies when scenes are loaded, created, or updated.
All module settings and the player-assignment menu are visible only to GMs. Players cannot open the assignment window or use the GM configuration API.

4. In **Configure Settings → Flashlights!**, adjust activation, radius, and edge softness. The radius is measured in scene pixels and scales with zoom.
5. Open **Configure Settings → Flashlights! → Configure connected players**. Check or uncheck **Has a flashlight** for each connected player. Changes are saved automatically and applied to all clients. The list updates when players connect or disconnect. Click **Refresh player list** to update it manually without changing any saved choices. Players without a flashlight can still see light shared by their teammates. Choices are remembered after reconnecting; players have a flashlight by default. The GM flashlight remains controlled separately by **Share the GM flashlight**.
6. As GM, enable **View as players (GM)** to see the same shared flashlights. Set **GM darkness opacity** between 0 (no darkening) and 1 (fully black, as seen by players); the default is 0.65. Both settings are local to your browser and do not affect players, whose darkness is always opaque. Your cursor only illuminates the scene when **Share the GM flashlight** is enabled. By default, the GM retains the full scene view.
7. To test synchronization, connect two players using separate browsers or profiles and open the same scene. They do not need assigned tokens or permission to display Foundry's native cursor.

The flashlight disappears when the cursor leaves the image, moves over the interface, or the window loses focus. Other users' flashlights remain visible. Disconnected flashlights expire after 2.5 seconds. A stationary cursor keeps its flashlight active with a heartbeat every 500 ms. Movement is transmitted at most 20 times per second, with interpolation for remote cursors.

Scene panning is handled entirely by Foundry. The module does not cancel or override mouse dragging.

The interface, chat, and windows remain accessible. The GM view and opacity settings are local browser preferences. The module works on the scene canvas; it does not darken image popouts or journal pages. It is a narrative visual effect, not an image access control mechanism.

## Upgrading from the former package ID

Version 0.3.5 uses the package ID `flashlights`. Earlier versions used `linternas-narrativas` and are separate packages in Foundry. Install the new package, disable the old package, and enable only `flashlights` in Manage Modules. Do not run both together. The module imports saved world settings, player flashlight assignments, and each GM browser's preview preferences the first time it runs. Existing settings under `flashlights` take precedence. Older settings are retained so the previous package can still be restored if needed. Macros must use the new `flashlights` ID.

## Script macros (GM)

Toggle flashlights globally:

```js
const api = game.modules.get("flashlights").api;
await api.setEnabled(!game.settings.get("flashlights", "enabled"));
```

Toggle the GM's player preview:

```js
await game.modules.get("flashlights").api.preview();
```

## Validation

Run `node --test tests/*.test.mjs` and `node --check scripts/main.mjs`. Automated tests cover isolation between scenes and levels, permissions, image bounds, interpolation, disconnections, token vision override and restoration, GM opacity, per-player flashlight assignment, connected-player configuration, preserved reconnect choices, and prevention of accumulating darkness. Testing with multiple real Foundry clients is still needed to check compatibility with other modules that modify the canvas.

Run `./build.ps1` to generate an installable ZIP with the module folder at its root.
