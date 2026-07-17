# Shoe Adventure — Asset Manifest

## Art Direction

**The Lost Pair** is a tactile, toy-scale cinematic platformer. The playable world combines a warm, storybook rescue narrative with clean 2.5D game-engine rendering: leather, canvas, rubber, cardboard, yarn, and thread read as touchable materials. Action stays clear against a deep navy and dusk-teal bedroom, with **Rescue Coral `#FF5A4F`** anchoring the Right Shoe hero and the emotional rescue objective.

## Generated Assets

| Asset | Role | Runtime URL | Notes |
| --- | --- | --- | --- |
| Visual target | Visual QA target and opening-scene artwork | `/manus-storage/shoe-adventure-visual-target_93950542.png` | 16:9 gameplay composition showing the intended enemies, pickups, HUD, platforms, and rescue target. |
| Bedroom backdrop | Parallax-ready scene background | `/manus-storage/shoe-adventure-bedroom-backdrop_a7dae85d.png` | 16:9; canvas/texture background behind collision terrain. |
| Right Shoe hero | Hero art for title overlay and character texture reference | `/manus-storage/right-shoe-hero_366b91a3.png` | Transparent cutout; right-facing red shoe. |
| Power-up tray | Visual source for the four power-up types | `/manus-storage/shoe-adventure-powerups_622ad4f9.png` | Transparent 2×2 tray: Wingtip Feather, Lace Dash, Heart Sole, Moon Insole. |
| Stitched-heart logo | Header/title emblem and favicon candidate | `/manus-storage/shoe-adventure-logo_cc0bdbb2.png` | Transparent logo without wordmark. |

## Asset Use Plan

The background image will be used as the main distant environmental layer. The hero and visual target will inform procedural game shapes and title UI; the logo will appear prominently on the opening overlay. The final gameplay will use Babylon meshes and material colors for collision clarity while echoing the generated art’s tactile palette. This avoids committing large media to the project tree while preserving the art direction at runtime.
