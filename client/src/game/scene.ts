// The Lost Pair visual reminder: elevated browser graphics should enhance the tactile rescue fantasy—warm lamp light, navy dusk, and Rescue Coral emotion—without obscuring platforming clarity.

import { Engine } from "@babylonjs/core/Engines/engine";
import { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Camera } from "@babylonjs/core/Cameras/camera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { GameWorld } from "./GameWorld";

export type RenderEngine = Engine | WebGPUEngine;

export interface GameHandle {
  scene: Scene;
  dispose: () => void;
}

// WebGPU is currently forced off under `pnpm dev` (see DISABLE_WEBGPU_IN_DEV below):
// live-tested against a real WebGPU-capable Chrome, `webGpuEngine.initAsync()` succeeds,
// but every subsequent shader compile fails immediately with "Error while parsing WGSL:
// unexpected token <!doctype html>" -- Babylon's WebGPU shader loader is fetching
// something that resolves to Vite's dev-server SPA-fallback HTML instead of real WGSL
// source, most likely a Vite dev dependency-pre-bundling quirk specific to
// @babylonjs/core's WebGPU shader files. The scene still runs (physics/audio/HUD are
// unaffected -- WebGPU validation errors don't throw), it just never draws anything,
// which reads as "the shoe and the board are just gone." WebGL has no such issue and is
// this project's long-documented fallback path, so it's the safe default until the
// WebGPU/Vite-dev interaction is root-caused. This has only been confirmed under `pnpm
// dev`; it may well be fine in a production build (`pnpm build && pnpm start`), which
// doesn't go through Vite's dev dependency pre-bundling at all -- worth re-testing there
// before assuming this is a real WebGPU-support bug rather than a dev-only one.
const DISABLE_WEBGPU_IN_DEV = true;

export async function createBestAvailableEngine(canvas: HTMLCanvasElement): Promise<RenderEngine> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
  if (gpu && !(DISABLE_WEBGPU_IN_DEV && import.meta.env.DEV)) {
    try {
      const adapter = await gpu.requestAdapter();
      if (adapter) {
        const webGpuEngine = new WebGPUEngine(canvas, {
          adaptToDeviceRatio: true,
          antialias: true,
          stencil: true,
        });
        await webGpuEngine.initAsync();
        return webGpuEngine;
      }
      console.info("No WebGPU adapter is exposed; Shoe Adventure is using accelerated WebGL.");
    } catch (error) {
      console.info("WebGPU was unavailable; Shoe Adventure is using accelerated WebGL instead.", error);
    }
  }

  return new Engine(canvas, true, {
    preserveDrawingBuffer: true,
    stencil: true,
    adaptToDeviceRatio: true,
  });
}

export async function createGameScene(engine: RenderEngine, canvas: HTMLCanvasElement): Promise<GameHandle> {
  const scene = new Scene(engine);
  // Was near-black (0.025, 0.035, 0.105) -- read as pitch night rather than the lit-up
  // evening blue the rest of the theme is going for (see index.css's own header comment).
  scene.clearColor = new Color4(0.08, 0.13, 0.29, 0);
  scene.imageProcessingConfiguration.toneMappingEnabled = true;
  // "brightness down a titch, contrast up" -- exposure 1.03->0.94, contrast 1.14->1.26.
  scene.imageProcessingConfiguration.exposure = 0.94;
  scene.imageProcessingConfiguration.contrast = 1.26;

  // y=2.1 vs. the -0.4 target below gives roughly a 9-degree downward tilt over the 16-unit
  // view distance -- keep in sync with GameWorld.ts's CAMERA_TILT_HEIGHT, which applies the
  // same pitch every frame during actual play; this is only what the title screen (which
  // never runs updateCamera) sees before a run starts.
  const camera = new FreeCamera("shoeAdventureCamera", new Vector3(0, 2.1, -16), scene);
  camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
  camera.minZ = 0.1;
  camera.maxZ = 100;
  camera.setTarget(new Vector3(1.2, -0.4, 0));

  const setOrthoBounds = () => {
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    const aspect = Math.max(0.44, width / height);
    const narrowViewport = aspect < 0.92;
    // Zoomed out ~30% from the previous values (18.4-21.6 / 13.2-35.6) -- "too close, not
    // enough of the surrounding action visible" was the live complaint, wanting a wider,
    // more cinematic frame (comic-book/Viewtiful-Joe-style action camera) rather than a
    // tight shot on one shoe. This is the lever to retune if a size still reads too tight
    // or too loose.
    const baselineVertical = narrowViewport ? 28 : width < 760 ? 25.5 : 24;
    const minimumHorizontalSpan = narrowViewport ? 17.2 : 46.3;
    const verticalSize = Math.max(baselineVertical, minimumHorizontalSpan / aspect);
    camera.orthoTop = verticalSize / 2;
    camera.orthoBottom = -verticalSize / 2;
    camera.orthoLeft = (-verticalSize * aspect) / 2;
    camera.orthoRight = (verticalSize * aspect) / 2;
  };
  setOrthoBounds();
  engine.onResizeObservable.add(setOrthoBounds);

  const quality = window.innerWidth < 760 ? "gentle" : "cinematic";
  const glow = new GlowLayer("rescueGlow", scene, {
    mainTextureSamples: quality === "cinematic" ? 2 : 1,
    blurKernelSize: quality === "cinematic" ? 42 : 24,
  });
  glow.intensity = quality === "cinematic" ? 0.52 : 0.34;

  const world = new GameWorld(scene, canvas, camera, glow);

  return {
    scene,
    dispose: () => {
      world.dispose();
      glow.dispose();
      scene.dispose();
    },
  };
}
