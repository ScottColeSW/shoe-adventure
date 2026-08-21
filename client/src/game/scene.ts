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

export async function createBestAvailableEngine(canvas: HTMLCanvasElement): Promise<RenderEngine> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
  if (gpu) {
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
  scene.clearColor = new Color4(0.025, 0.035, 0.105, 0);
  scene.imageProcessingConfiguration.toneMappingEnabled = true;
  scene.imageProcessingConfiguration.exposure = 1.03;
  scene.imageProcessingConfiguration.contrast = 1.14;

  const camera = new FreeCamera("shoeAdventureCamera", new Vector3(0, -0.55, -16), scene);
  camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
  camera.minZ = 0.1;
  camera.maxZ = 100;
  camera.setTarget(new Vector3(1.2, -0.4, 0));

  const setOrthoBounds = () => {
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    const aspect = Math.max(0.44, width / height);
    const narrowViewport = aspect < 0.92;
    // Super Run is a spectator sequence: show the hero, the next encounter, and the previous device rather than magnifying one shoe.
    const baselineVertical = narrowViewport ? 21.6 : width < 760 ? 19.6 : 18.4;
    const minimumHorizontalSpan = narrowViewport ? 13.2 : 35.6;
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
