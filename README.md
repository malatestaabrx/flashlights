# Flashlights!

Cursor-controlled flashlights for narrative scenes in **Foundry VTT 14**. Players explore a background image while the rest stays dark. No tokens, walls, or fog of war required. Revealed areas turn dark again when the cursor moves away.

## Installation

In **Add-on Modules → Install Module**, paste this manifest URL:

```text
https://github.com/malatestaabrx/flashlights/releases/latest/download/module.json
```

Enable **Flashlights!** in your world's **Manage Modules** menu.

## Settings

All settings are GM-only, under **Configure Settings → Flashlights!**:

- Enable flashlights and adjust their radius and edge softness.
- Choose shared vision (everyone sees teammates' flashlights) or individual vision (each player sees only their own).
- Assign flashlights to connected players. Use **Refresh player list** to reload the list.
- Optionally share the GM's flashlight.
- Preview the players' view as GM, with darkness opacity from **0** (transparent) to **1** (fully black).

Use a scene background with darkness set to **0** for its original colors. Token vision is temporarily ignored while flashlights are enabled; the saved scene setting is preserved.

## Upgrading from the old ID

If you used `linternas-narrativas`, disable that module and enable only `flashlights`. Saved settings and player assignments are imported automatically.
