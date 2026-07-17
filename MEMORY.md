# Shoe Adventure — Development Memory

## Graphics Platform Decision

The game is a browser-delivered React/Babylon project, so it should remain on **Babylon.js** rather than be rewritten around Unity or Unreal. Unity supports Web builds on 64-bit, WebGL2-capable, HTML5-compliant browsers with WebAssembly support, but adopting it now would replace the game’s existing web project and add a larger build/runtime payload rather than extend the present implementation. [Unity Web browser compatibility](https://docs.unity3d.com/6000.5/Documentation/Manual/webgl-browsercompatibility.html)

Unreal’s HTML5 platform was removed from Unreal Engine 4.23 and became a community-supported extension, making it a poor fit for a quick, reliable browser handoff. [Khronos / Wonder Interactive overview](https://www.khronos.org/developers/linkto/bringing-unreal-engine-to-the-browser-july-2022)

NVIDIA-native features such as DLSS and RTX SDK integrations are not portable JavaScript dependencies for a hosted browser game. NVIDIA hardware can still accelerate WebGL/WebGPU through the player’s browser and graphics driver, but the game must not require an NVIDIA GPU or a native SDK.

## Selected Approach: WebGPU-Ready Babylon Cinematic Pipeline

Use Babylon.js as the compatibility layer and attempt `WebGPUEngine` when the browser exposes `navigator.gpu`; otherwise, immediately fall back to the standard WebGL `Engine`. Babylon.js documents WebGPU support as backward-compatible with WebGL, with asynchronous engine initialization and potential benefits including compute shaders and improved performance. [Babylon.js WebGPU support](https://github.com/BabylonJS/Documentation/blob/master/content/setup/support/webGPU.md)

The visible upgrade will be inspired by Unity/Unreal-style presentation rather than claiming their native libraries: physically informed material highlights, layered lighting, soft shadow-like depth treatment, bloom/glow accents, a color-grading pass, parallax environment layers, stitched particles, and adaptive quality settings. Gameplay readability and broad browser support remain the primary constraints.

## Game Design Lock

The visual philosophy remains **The Lost Pair**: a tactile, toy-scale rescue platformer with deep navy and dusk-teal ambience, warm cream and gold light, and **Rescue Coral `#FF5A4F`** reserved for the Right Shoe, love/rescue progress, and player-facing calls to action.

## Visual Verification Finding

The initial gameplay screenshot showed that the visual-target artwork successfully loaded for the title screen, while the secondary background, logo, hero, and power-up images returned visible “Image generation failed” placeholders. These failed remote assets must not remain in the final game. The runtime will temporarily reuse the successful visual target as the background source and use CSS/procedural motifs for the logo and power-up cards unless a focused recovery generation succeeds.

## Responsive QA Finding

At 375×812, the title composition remains legible and maintains the rescue-story hierarchy without horizontal overflow. The active mode exposes a dedicated left/right, dash, and jump touch-control layout, while the mission and life HUD remain readable above it. The deterministic gameplay mode also showed a successful WebGL fallback path after WebGPU adapter availability was checked first.

## Final Review Note

The trusted full-page visual review produced blank captures because the game scene and HUD are intentionally fixed-position layers and the capture process suppresses non-top fixed chrome. Earlier standard viewport captures remain the valid visual evidence. The review’s useful refinement points are nevertheless accepted: make the left-to-right rescue stage, coral Right Shoe, Left Shoe objective, stitched patch HUD, and footwear-specific voice more explicit in the active play view.

## Realistic Footwear Asset Fallback

The generated `right-shoe-realistic` asset at `/manus-storage/right-shoe-realistic_a31b4b73.png` renders successfully in the game as the realistic hero. The reserved Left Shoe asset at `/manus-storage/left-shoe-realistic_35dfc931.png` did not resolve into usable art during visual validation, so the game now mirrors the successful Right Shoe asset for Left Shoe via CSS. The roller-skate asset remains registered at `/manus-storage/roller-skate-realistic_8767122a.png`; retain procedural meshes as subtle fallback geometry beneath its billboard.
