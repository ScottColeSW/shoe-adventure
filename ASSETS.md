# Shoe Adventure — Asset Manifest

## Art Direction

**The Lost Pair** is a tactile, toy-scale cinematic platformer. The playable world combines a warm, storybook rescue narrative with clean 2.5D game-engine rendering: leather, canvas, rubber, cardboard, yarn, and thread read as touchable materials. Action stays clear against a deep navy and dusk-teal bedroom, with **Rescue Coral `#FF5A4F`** anchoring the Right Shoe hero and the emotional rescue objective.

## No external image assets

This project no longer references any externally hosted images. It originally pulled a handful of generated reference images (a visual target, a bedroom backdrop, hero art, a power-up tray, a logo) through a Manus-platform storage proxy at `/manus-storage/...`. Now that the project runs outside Manus, that proxy has no backend to reach, so those URLs were removed rather than left to fail silently.

Every character, enemy, and prop in the game is Babylon.js procedural geometry and material colors, following the palette above: Rescue Coral for the Right Shoe, a warm cream-and-gold tone for the Left Shoe, and material-tinted meshes for enemies and terrain. The favicon is a small inline SVG in `client/index.html` rather than an image file. If real artwork is ever produced, it can be dropped into `client/public/` and referenced with a local path the same way real audio files already work (see `SOUND_LIST.md`); nothing here needs an external storage service.
