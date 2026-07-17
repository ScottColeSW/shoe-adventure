// The Lost Pair visual reminder: a tactile, toy-scale rescue platformer in deep navy and teal, with Rescue Coral #FF5A4F signaling the Right Shoe’s courage and the route to the Left Shoe.
// This module owns gameplay and Babylon scene objects only; React is deliberately kept out of the game rules.

import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Camera } from "@babylonjs/core/Cameras/camera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { gameAssets } from "./assets";

export type GameMode = "title" | "playing" | "paused" | "won" | "lost";
type PickupKind = "button" | "feather" | "dash" | "heart" | "moon" | "chrome" | "moonstep" | "lash" | "gum";
type ShoeForm = "starter" | "coralChrome" | "moonstep";
type EnemyKind = "lace" | "slime" | "skate";
type GameCommand =
  | "start"
  | "restart"
  | "pause"
  | "jump"
  | "dash"
  | "lash"
  | "stomp"
  | "holdLeft"
  | "holdRight"
  | "releaseLeft"
  | "releaseRight"
  | "superRun"
  | "celebrate";

interface Platform {
  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  mesh: Mesh;
}

interface PlayerState {
  root: TransformNode;
  x: number;
  bottom: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  grounded: boolean;
  hearts: number;
  invulnerable: number;
  jumpUsed: boolean;
  dashTimer: number;
  dashCooldown: number;
  doubleJumps: number;
  dashCharges: number;
  moonTimer: number;
  shoeForm: ShoeForm;
  laceLash: boolean;
  gumStomp: boolean;
  lashCooldown: number;
  stompCooldown: number;
  lashTimer: number;
  stompTimer: number;
}

interface Enemy {
  kind: EnemyKind;
  root: TransformNode;
  x: number;
  bottom: number;
  minX: number;
  maxX: number;
  speed: number;
  width: number;
  height: number;
  alive: boolean;
  phase: number;
}

interface Pickup {
  kind: PickupKind;
  root: TransformNode;
  x: number;
  y: number;
  radius: number;
  collected: boolean;
  phase: number;
}

interface Checkpoint {
  x: number;
  activated: boolean;
  label: string;
  root: TransformNode;
}

interface Spark {
  mesh: Mesh;
  velocity: Vector3;
  life: number;
  maxLife: number;
}

export interface UiSnapshot {
  mode: GameMode;
  hearts: number;
  buttons: number;
  doubleJumps: number;
  dashCharges: number;
  moonSeconds: number;
  message: string;
  checkpoint: string;
  rescued: boolean;
  superRun: boolean;
  superRunAction: string;
  shoeForm: ShoeForm;
  laceLash: boolean;
  gumStomp: boolean;
}

const WORLD_END = 66;
const PLAYER_WIDTH = 1.12;
const PLAYER_HEIGHT = 1.48;
const RESCUE_CORAL = new Color3(1, 0.35, 0.31);
const CREAM = new Color3(1, 0.88, 0.66);
const NAVY = new Color3(0.035, 0.055, 0.13);
const TEAL = new Color3(0.05, 0.33, 0.39);
const GOLD = new Color3(1, 0.67, 0.18);
const VIOLET = new Color3(0.47, 0.25, 0.72);
const CYAN = new Color3(0.18, 0.84, 0.92);
const MOSS = new Color3(0.24, 0.63, 0.34);

export class GameWorld {
  private readonly scene: Scene;
  private readonly canvas: HTMLCanvasElement;
  private readonly camera: FreeCamera;
  private readonly glow: GlowLayer;
  private readonly quality: "cinematic" | "gentle";
  private readonly platforms: Platform[] = [];
  private readonly enemies: Enemy[] = [];
  private readonly pickups: Pickup[] = [];
  private readonly checkpoints: Checkpoint[] = [];
  private readonly sparks: Spark[] = [];
  private readonly parallax: Mesh[] = [];
  private readonly held = { left: false, right: false };
  private readonly isDemo: boolean;
  private readonly isSuperRunPreview: boolean;
  private readonly isReunionPreview: boolean;
  private player: PlayerState;
  private mode: GameMode = "title";
  private buttons = 0;
  private message = "Lace up. The rescue starts now.";
  private activeCheckpoint = "Bedroom Threshold";
  private demoJumpTimer = 0;
  private superRun = false;
  private superRunAction = "AI standing by.";
  private superRunKickTimer = 0;
  private lastUiSignature = "";
  private titleTime = 0;
  private leftShoe: TransformNode | null = null;
  private leftShoeHalo: Mesh | null = null;
  private heroSprite: Mesh | null = null;
  private heroSpriteMaterial: StandardMaterial | null = null;
  private heroHalo: Mesh | null = null;
  private onKeyDownBound = (event: KeyboardEvent) => this.onKeyDown(event);
  private onKeyUpBound = (event: KeyboardEvent) => this.onKeyUp(event);
  private onCommandBound = (event: Event) => this.onCommand(event as CustomEvent<GameCommand>);

  constructor(scene: Scene, canvas: HTMLCanvasElement, camera: FreeCamera, glow: GlowLayer) {
    this.scene = scene;
    this.canvas = canvas;
    this.camera = camera;
    this.glow = glow;
    this.quality = window.innerWidth < 760 ? "gentle" : "cinematic";
    const query = new URLSearchParams(window.location.search);
    this.isDemo = query.has("demo");
    this.isSuperRunPreview = query.has("superrun");
    this.isReunionPreview = query.has("dance");
    this.player = this.createPlayer();
    this.createWorld();
    this.bindInput();
    if (this.isSuperRunPreview) this.startSuperRun();
    else if (this.isReunionPreview) this.previewReunion();
    else this.publishUi(true);

    this.scene.onBeforeRenderObservable.add(() => {
      const delta = Math.min(this.scene.getEngine().getDeltaTime() / 1000, 0.05);
      this.update(delta);
    });
  }

  dispose() {
    window.removeEventListener("keydown", this.onKeyDownBound);
    window.removeEventListener("keyup", this.onKeyUpBound);
    window.removeEventListener("shoe-adventure:command", this.onCommandBound);
    this.sparks.forEach((spark) => spark.mesh.dispose());
  }

  private createWorld() {
    this.scene.clearColor = new Color4(0.025, 0.035, 0.105, 0);
    this.scene.ambientColor = new Color3(0.3, 0.34, 0.48);
    this.configureLights();
    this.createBackdrop();
    this.createLevelGeometry();
    this.createEnemies();
    this.createPickups();
    this.createCheckpoints();
    this.createRescueDome();
    this.createForegroundDetails();
  }

  private configureLights() {
    const sky = new HemisphericLight("twilightSky", new Vector3(0, 1, -0.2), this.scene);
    sky.intensity = 0.84;
    sky.diffuse = new Color3(0.44, 0.6, 0.9);
    sky.groundColor = new Color3(0.13, 0.065, 0.11);

    const key = new DirectionalLight("warmKey", new Vector3(-0.35, -1, -0.55), this.scene);
    key.position = new Vector3(22, 11, -13);
    key.intensity = 1.22;
    key.diffuse = new Color3(1, 0.73, 0.48);

    const lamp = new PointLight("rescueLamp", new Vector3(58, 6.2, -4), this.scene);
    lamp.diffuse = new Color3(1, 0.42, 0.29);
    lamp.intensity = this.quality === "cinematic" ? 9.5 : 6.2;
    lamp.range = 17;

    const rim = new PointLight("moonRim", new Vector3(20, 5.4, 3), this.scene);
    rim.diffuse = new Color3(0.2, 0.7, 0.95);
    rim.intensity = 5;
    rim.range = 20;
  }

  private createBackdrop() {
    const moon = MeshBuilder.CreateDisc("windowMoon", { radius: 1.15, tessellation: 40 }, this.scene);
    moon.position = new Vector3(-4.2, 5.3, 5.2);
    moon.material = this.createMaterial("windowMoonMat", new Color3(0.65, 0.88, 1), new Color3(0.19, 0.38, 0.72));
    this.parallax.push(moon);

    for (let index = 0; index < 10; index += 1) {
      const star = MeshBuilder.CreateDisc(`paperStar${index}`, { radius: 0.05 + (index % 3) * 0.025, tessellation: 12 }, this.scene);
      star.position = new Vector3(-8 + index * 5.6, 3 + ((index * 7) % 4), 6.2);
      star.material = this.createMaterial(`paperStarMat${index}`, CREAM, GOLD);
      this.parallax.push(star);
    }

    const rug = MeshBuilder.CreateBox("softRug", { width: 80, height: 0.12, depth: 3.6 }, this.scene);
    rug.position = new Vector3(31, -5.14, 1.7);
    rug.material = this.createMaterial("rugMat", new Color3(0.11, 0.28, 0.3), new Color3(0.02, 0.06, 0.08));
    rug.isPickable = false;
  }

  private createLevelGeometry() {
    this.createPlatform(4, -4.7, 17.5, 1.0, "cardboard");
    this.createPlatform(20.5, -4.7, 17.5, 1.0, "cardboard");
    this.createPlatform(38, -4.7, 17.5, 1.0, "cardboard");
    this.createPlatform(56, -4.7, 18, 1.0, "cardboard");

    this.createPlatform(15.8, -3.2, 4.6, 0.8, "shoeBox");
    this.createPlatform(21.8, -1.65, 4.1, 0.8, "shoeBox");
    this.createPlatform(28.4, -2.85, 5.1, 0.8, "laundry");
    this.createLaceBridge(34.4, -1.25, 5.4);
    this.createPlatform(41.7, -0.15, 4.4, 0.8, "shoeBox");
    this.createPlatform(47.4, -1.6, 4.2, 0.8, "shoeBox");
    this.createPlatform(52.8, 0.9, 4.3, 0.8, "shoeBox");
    this.createPlatform(58.1, 2.0, 3.2, 0.8, "shoeBox");
    this.createPlatform(62.4, 3.1, 5.2, 0.8, "tower");

    const spool = MeshBuilder.CreateCylinder("laceSpool", { height: 1.4, diameter: 1.25, tessellation: 24 }, this.scene);
    spool.position = new Vector3(7.8, -3.5, 0.6);
    spool.rotation.z = Math.PI / 2;
    spool.material = this.createMaterial("laceSpoolMat", CREAM, new Color3(0.18, 0.08, 0.04));
    const spoolRibbon = MeshBuilder.CreateTorus("spoolRibbon", { diameter: 1.28, thickness: 0.16, tessellation: 24 }, this.scene);
    spoolRibbon.position = new Vector3(7.8, -3.5, -0.12);
    spoolRibbon.rotation.x = Math.PI / 2;
    spoolRibbon.material = this.createMaterial("spoolRibbonMat", RESCUE_CORAL, new Color3(0.45, 0.05, 0.02));
  }

  private createPlatform(x: number, y: number, width: number, height: number, kind: "cardboard" | "shoeBox" | "laundry" | "tower"): Platform {
    const mesh = MeshBuilder.CreateBox(`platform-${kind}-${x}`, { width, height, depth: 1.45 }, this.scene);
    mesh.position = new Vector3(x, y, 0.9);
    mesh.isPickable = false;

    const palette = {
      cardboard: new Color3(0.45, 0.25, 0.12),
      shoeBox: new Color3(0.66, 0.38, 0.18),
      laundry: new Color3(0.18, 0.43, 0.53),
      tower: new Color3(0.55, 0.19, 0.16),
    } as const;
    const material = this.createMaterial(`platformMat-${kind}-${x}`, palette[kind], palette[kind].scale(0.16));
    material.specularColor = new Color3(0.35, 0.21, 0.1);
    mesh.material = material;

    const tape = MeshBuilder.CreateBox(`tape-${x}`, { width: Math.max(0.55, width * 0.22), height: 0.055, depth: 1.49 }, this.scene);
    tape.position = new Vector3(x + width * 0.08, y + height / 2 + 0.03, 0.9);
    tape.material = this.createMaterial(`tapeMat-${x}`, CREAM, new Color3(0.13, 0.08, 0.03));
    tape.isPickable = false;

    return this.addPlatform(x, y, width, height, mesh);
  }

  private createLaceBridge(x: number, y: number, width: number) {
    const platform = this.createPlatform(x, y, width, 0.5, "laundry");
    platform.mesh.visibility = 0.58;
    for (let index = 0; index < 7; index += 1) {
      const knot = MeshBuilder.CreateTorus(`laceKnot-${index}`, { diameter: 0.54, thickness: 0.11, tessellation: 18 }, this.scene);
      knot.position = new Vector3(x - width / 2 + 0.48 + index * 0.75, y + 0.42, -0.04);
      knot.rotation.x = Math.PI / 2;
      knot.material = this.createMaterial(`laceKnotMat-${index}`, CREAM, new Color3(0.15, 0.07, 0.03));
      knot.isPickable = false;
    }
  }

  private addPlatform(x: number, y: number, width: number, height: number, mesh: Mesh): Platform {
    const platform = { x, y, width, height, top: y + height / 2, mesh };
    this.platforms.push(platform);
    return platform;
  }

  private addFootwearBillboard(
    name: string,
    assetUrl: string,
    root: TransformNode,
    width: number,
    height: number,
    position: Vector3,
    glowColor: Color3,
  ): Mesh {
    const plane = MeshBuilder.CreatePlane(name, { width, height }, this.scene);
    plane.parent = root;
    plane.position = position;
    plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
    plane.isPickable = false;

    const material = new StandardMaterial(`${name}Mat`, this.scene);
    const texture = new Texture(assetUrl, this.scene);
    texture.hasAlpha = true;
    material.diffuseTexture = texture;
    material.opacityTexture = texture;
    material.useAlphaFromDiffuseTexture = true;
    material.emissiveColor = glowColor.scale(0.14);
    material.specularColor = Color3.Black();
    material.backFaceCulling = false;
    plane.material = material;
    return plane;
  }

  private createPlayer(): PlayerState {
    const root = new TransformNode("rightShoeRoot", this.scene);
    const sole = MeshBuilder.CreateBox("rightSole", { width: 1.55, height: 0.24, depth: 0.72 }, this.scene);
    sole.parent = root;
    sole.position = new Vector3(0.13, 0.3, 0);
    sole.material = this.createMaterial("rightSoleMat", CREAM, new Color3(0.15, 0.07, 0.03));

    const upper = MeshBuilder.CreateSphere("rightUpper", { diameter: 1, segments: 20 }, this.scene);
    upper.parent = root;
    upper.position = new Vector3(0.03, 0.63, 0);
    upper.scaling = new Vector3(0.95, 0.62, 0.6);
    upper.material = this.createMaterial("rightUpperMat", RESCUE_CORAL, new Color3(0.52, 0.06, 0.035));

    const heel = MeshBuilder.CreateBox("rightHeel", { width: 0.48, height: 0.7, depth: 0.63 }, this.scene);
    heel.parent = root;
    heel.position = new Vector3(-0.53, 0.67, 0);
    heel.material = this.createMaterial("rightHeelMat", RESCUE_CORAL, new Color3(0.42, 0.04, 0.02));

    const tongue = MeshBuilder.CreateBox("rightTongue", { width: 0.4, height: 0.48, depth: 0.08 }, this.scene);
    tongue.parent = root;
    tongue.position = new Vector3(-0.02, 0.98, -0.38);
    tongue.material = this.createMaterial("rightTongueMat", CREAM, new Color3(0.18, 0.09, 0.02));

    for (let index = 0; index < 3; index += 1) {
      const lace = MeshBuilder.CreateBox(`rightLace-${index}`, { width: 0.74, height: 0.07, depth: 0.09 }, this.scene);
      lace.parent = root;
      lace.position = new Vector3(0.04 + index * 0.03, 0.68 + index * 0.15, -0.46);
      lace.rotation.z = index % 2 === 0 ? 0.17 : -0.17;
      lace.material = this.createMaterial(`rightLaceMat-${index}`, CREAM, new Color3(0.13, 0.07, 0.02));
    }

    const eye = MeshBuilder.CreateSphere("rightShoeEye", { diameter: 0.16, segments: 16 }, this.scene);
    eye.parent = root;
    eye.position = new Vector3(0.31, 0.85, -0.49);
    eye.material = this.createMaterial("rightShoeEyeMat", new Color3(0.08, 0.2, 0.34), CYAN);

    const knot = MeshBuilder.CreateSphere("rightHeartEyelet", { diameter: 0.16, segments: 16 }, this.scene);
    knot.parent = root;
    knot.position = new Vector3(-0.36, 0.94, -0.45);
    knot.material = this.createMaterial("rightHeartEyeletMat", GOLD, new Color3(0.56, 0.22, 0.03));

    root.getChildMeshes().forEach((mesh) => { mesh.visibility = 0.08; });
    this.heroSprite = this.addFootwearBillboard(
      "rightShoeRealisticSprite",
      gameAssets.rightShoeRealistic,
      root,
      2.42,
      1.86,
      new Vector3(0.06, 0.9, -0.64),
      RESCUE_CORAL,
    );
    this.heroSpriteMaterial = this.heroSprite.material as StandardMaterial;
    this.heroSpriteMaterial.emissiveColor = RESCUE_CORAL.scale(0.34);
    this.heroSpriteMaterial.specularColor = new Color3(1, 0.92, 0.78);
    this.heroSpriteMaterial.specularPower = 96;

    const halo = MeshBuilder.CreateDisc("rightShoeGlowHalo", { radius: 1.34, tessellation: 40 }, this.scene);
    halo.parent = root;
    halo.position = new Vector3(0.08, 0.84, -0.72);
    const haloMaterial = this.createMaterial("rightShoeGlowHaloMat", RESCUE_CORAL, GOLD);
    haloMaterial.alpha = 0.19;
    haloMaterial.backFaceCulling = false;
    halo.material = haloMaterial;
    halo.isPickable = false;
    this.heroHalo = halo;

    root.position = new Vector3(0, -4.2, -0.4);
    return {
      root,
      x: 0,
      bottom: -4.2,
      vx: 0,
      vy: 0,
      facing: 1,
      grounded: true,
      hearts: 3,
      invulnerable: 0,
      jumpUsed: false,
      dashTimer: 0,
      dashCooldown: 0,
      doubleJumps: 0,
      dashCharges: 0,
      moonTimer: 0,
      shoeForm: "starter",
      laceLash: false,
      gumStomp: false,
      lashCooldown: 0,
      stompCooldown: 0,
      lashTimer: 0,
      stompTimer: 0,
    };
  }

  private createEnemies() {
    this.enemies.push(this.createLaceGoblin(11.8, -4.2, 8.5, 14.2));
    this.enemies.push(this.createSlime(23.4, -1.25, 20.2, 23.4));
    this.enemies.push(this.createRollerSkate(41.4, 0.55, 39.9, 43.5));
    this.enemies.push(this.createLaceGoblin(50.2, -4.2, 47.6, 53.6));
    this.enemies.push(this.createRollerSkate(56.7, 2.4, 55.2, 58.1));
  }

  private createLaceGoblin(x: number, bottom: number, minX: number, maxX: number): Enemy {
    const root = new TransformNode(`laceGoblin-${x}`, this.scene);
    const body = MeshBuilder.CreateSphere(`laceGoblinBody-${x}`, { diameter: 0.95, segments: 18 }, this.scene);
    body.parent = root;
    body.position.y = 0.55;
    body.scaling.y = 0.78;
    body.material = this.createMaterial(`laceGoblinBodyMat-${x}`, VIOLET, new Color3(0.2, 0.04, 0.32));
    for (let index = 0; index < 3; index += 1) {
      const lace = MeshBuilder.CreateTorus(`goblinLace-${x}-${index}`, { diameter: 0.38, thickness: 0.07, tessellation: 14 }, this.scene);
      lace.parent = root;
      lace.position = new Vector3(-0.18 + index * 0.2, 0.72 + (index % 2) * 0.08, -0.35);
      lace.rotation.x = Math.PI / 2;
      lace.material = this.createMaterial(`goblinLaceMat-${x}-${index}`, CREAM, new Color3(0.14, 0.06, 0.02));
    }
    const eye = MeshBuilder.CreateSphere(`goblinEye-${x}`, { diameter: 0.13, segments: 12 }, this.scene);
    eye.parent = root;
    eye.position = new Vector3(0.12, 0.59, -0.46);
    eye.material = this.createMaterial(`goblinEyeMat-${x}`, CREAM, GOLD);
    root.position = new Vector3(x, bottom, -0.3);
    return { kind: "lace", root, x, bottom, minX, maxX, speed: 1.28, width: 0.82, height: 0.92, alive: true, phase: x };
  }

  private createSlime(x: number, bottom: number, minX: number, maxX: number): Enemy {
    const root = new TransformNode(`stainSlime-${x}`, this.scene);
    const body = MeshBuilder.CreateSphere(`stainSlimeBody-${x}`, { diameter: 1, segments: 20 }, this.scene);
    body.parent = root;
    body.position.y = 0.33;
    body.scaling = new Vector3(0.82, 0.58, 0.56);
    body.material = this.createMaterial(`stainSlimeMat-${x}`, MOSS, new Color3(0.04, 0.23, 0.05));
    for (const offset of [-0.16, 0.16]) {
      const eye = MeshBuilder.CreateSphere(`slimeEye-${x}-${offset}`, { diameter: 0.1, segments: 12 }, this.scene);
      eye.parent = root;
      eye.position = new Vector3(offset, 0.46, -0.42);
      eye.material = this.createMaterial(`slimeEyeMat-${x}-${offset}`, CREAM, new Color3(0.08, 0.12, 0.16));
    }
    root.position = new Vector3(x, bottom, -0.3);
    return { kind: "slime", root, x, bottom, minX, maxX, speed: -0.86, width: 0.9, height: 0.65, alive: true, phase: x };
  }

  private createRollerSkate(x: number, bottom: number, minX: number, maxX: number): Enemy {
    const root = new TransformNode(`rogueSkate-${x}`, this.scene);
    const boot = MeshBuilder.CreateBox(`rogueSkateBoot-${x}`, { width: 1.12, height: 0.47, depth: 0.72 }, this.scene);
    boot.parent = root;
    boot.position = new Vector3(0, 0.68, 0);
    boot.material = this.createMaterial(`rogueSkateBootMat-${x}`, new Color3(0.16, 0.38, 0.75), new Color3(0.04, 0.1, 0.43));
    const blade = MeshBuilder.CreateBox(`rogueSkateBlade-${x}`, { width: 1.15, height: 0.1, depth: 0.14 }, this.scene);
    blade.parent = root;
    blade.position = new Vector3(0, 0.39, -0.18);
    blade.material = this.createMaterial(`rogueSkateBladeMat-${x}`, new Color3(0.45, 0.78, 0.94), new Color3(0.08, 0.2, 0.45));
    for (const offset of [-0.33, 0.33]) {
      const wheel = MeshBuilder.CreateCylinder(`skateWheel-${x}-${offset}`, { height: 0.22, diameter: 0.32, tessellation: 16 }, this.scene);
      wheel.parent = root;
      wheel.position = new Vector3(offset, 0.25, 0);
      wheel.rotation.z = Math.PI / 2;
      wheel.material = this.createMaterial(`skateWheelMat-${x}-${offset}`, new Color3(0.07, 0.1, 0.2), CYAN);
    }
    const hostileEye = MeshBuilder.CreateSphere(`skateEye-${x}`, { diameter: 0.14, segments: 12 }, this.scene);
    hostileEye.parent = root;
    hostileEye.position = new Vector3(0.22, 0.72, -0.4);
    hostileEye.material = this.createMaterial(`skateEyeMat-${x}`, VIOLET, RESCUE_CORAL);
    root.getChildMeshes().forEach((mesh) => { mesh.visibility = 0.08; });
    this.addFootwearBillboard(
      `rogueSkateRealisticSprite-${x}`,
      gameAssets.rollerSkateRealistic,
      root,
      1.9,
      1.58,
      new Vector3(0, 0.82, -0.58),
      new Color3(0.16, 0.42, 0.88),
    );
    root.position = new Vector3(x, bottom, -0.25);
    return { kind: "skate", root, x, bottom, minX, maxX, speed: 1.08, width: 1.12, height: 1.08, alive: true, phase: x };
  }

  private createPickups() {
    const buttonPositions = [2.7, 4.6, 6.5, 10.3, 14.5, 17.4, 20.2, 27.2, 32.8, 38.5, 45.7, 54.6, 60.2];
    buttonPositions.forEach((x, index) => {
      const y = index > 8 ? -2.95 : -3.1;
      this.pickups.push(this.createPickup("button", x, y + (index % 3) * 0.24));
    });
    this.pickups.push(this.createPickup("feather", 8.4, -2.7));
    this.pickups.push(this.createPickup("dash", 19.4, -2.05));
    this.pickups.push(this.createPickup("heart", 34.3, -0.55));
    this.pickups.push(this.createPickup("moon", 47.2, -0.82));
    this.pickups.push(this.createPickup("feather", 53.1, 2.0));
    this.pickups.push(this.createPickup("dash", 58.1, 3.0));
    this.pickups.push(this.createPickup("chrome", 13.0, -2.5));
    this.pickups.push(this.createPickup("moonstep", 30.2, -2.2));
    this.pickups.push(this.createPickup("lash", 42.0, 0.75));
    this.pickups.push(this.createPickup("gum", 55.0, 2.95));
  }

  private createPickup(kind: PickupKind, x: number, y: number): Pickup {
    const root = new TransformNode(`pickup-${kind}-${x}`, this.scene);
    let icon: Mesh;
    if (kind === "button") {
      icon = MeshBuilder.CreateDisc(`button-${x}`, { radius: 0.22, tessellation: 24 }, this.scene);
      icon.material = this.createMaterial(`buttonMat-${x}`, GOLD, new Color3(0.55, 0.19, 0.02));
      const holes = [-0.08, 0.08];
      holes.forEach((xOffset, index) => {
        const hole = MeshBuilder.CreateDisc(`buttonHole-${x}-${index}`, { radius: 0.035, tessellation: 12 }, this.scene);
        hole.parent = root;
        hole.position = new Vector3(xOffset, index === 0 ? 0.075 : -0.075, -0.04);
        hole.material = this.createMaterial(`buttonHoleMat-${x}-${index}`, new Color3(0.35, 0.1, 0.04), new Color3(0.12, 0.01, 0.01));
      });
    } else if (kind === "feather") {
      icon = MeshBuilder.CreateSphere(`feather-${x}`, { diameter: 0.48, segments: 20 }, this.scene);
      icon.scaling = new Vector3(0.54, 1.45, 0.3);
      icon.rotation.z = -0.45;
      icon.material = this.createMaterial(`featherMat-${x}`, GOLD, new Color3(0.65, 0.25, 0.04));
    } else if (kind === "dash") {
      icon = MeshBuilder.CreateTorus(`dashSpool-${x}`, { diameter: 0.62, thickness: 0.18, tessellation: 22 }, this.scene);
      icon.material = this.createMaterial(`dashMat-${x}`, CYAN, new Color3(0.03, 0.32, 0.54));
    } else if (kind === "heart") {
      icon = MeshBuilder.CreateSphere(`heartSole-${x}`, { diameter: 0.55, segments: 20 }, this.scene);
      icon.scaling = new Vector3(1.02, 0.74, 0.34);
      icon.material = this.createMaterial(`heartMat-${x}`, RESCUE_CORAL, new Color3(0.58, 0.035, 0.02));
    } else if (kind === "moon") {
      icon = MeshBuilder.CreateTorus(`moonInsole-${x}`, { diameter: 0.62, thickness: 0.16, tessellation: 22 }, this.scene);
      icon.material = this.createMaterial(`moonMat-${x}`, VIOLET, new Color3(0.18, 0.02, 0.38));
    } else if (kind === "chrome") {
      icon = MeshBuilder.CreateSphere(`coralChrome-${x}`, { diameter: 0.68, segments: 24 }, this.scene);
      icon.scaling = new Vector3(0.9, 0.9, 0.32);
      icon.material = this.createMaterial(`coralChromeMat-${x}`, RESCUE_CORAL, GOLD);
    } else if (kind === "moonstep") {
      icon = MeshBuilder.CreateTorus(`moonstepPatch-${x}`, { diameter: 0.7, thickness: 0.16, tessellation: 24 }, this.scene);
      icon.material = this.createMaterial(`moonstepPatchMat-${x}`, CYAN, new Color3(0.1, 0.22, 0.74));
    } else if (kind === "lash") {
      icon = MeshBuilder.CreateTorus(`laceLashPatch-${x}`, { diameter: 0.74, thickness: 0.105, tessellation: 24 }, this.scene);
      icon.scaling = new Vector3(1.05, 0.62, 1);
      icon.material = this.createMaterial(`laceLashPatchMat-${x}`, CREAM, RESCUE_CORAL);
    } else {
      icon = MeshBuilder.CreateDisc(`gumStompPatch-${x}`, { radius: 0.34, tessellation: 24 }, this.scene);
      icon.material = this.createMaterial(`gumStompPatchMat-${x}`, MOSS, new Color3(0.88, 0.16, 0.44));
    }
    icon.parent = root;
    icon.position.z = -0.25;
    root.position = new Vector3(x, y, -0.22);
    return { kind, root, x, y, radius: kind === "button" ? 0.32 : 0.5, collected: false, phase: x * 0.7 };
  }

  private createCheckpoints() {
    this.checkpoints.push(this.createCheckpoint(32.3, "Lace Bridge"));
    this.checkpoints.push(this.createCheckpoint(49.5, "Moonlit Shoeboxes"));
  }

  private createCheckpoint(x: number, label: string): Checkpoint {
    const root = new TransformNode(`checkpoint-${label}`, this.scene);
    const pole = MeshBuilder.CreateCylinder(`checkpointPole-${x}`, { height: 1.55, diameter: 0.08, tessellation: 12 }, this.scene);
    pole.parent = root;
    pole.position.y = 0.75;
    pole.material = this.createMaterial(`checkpointPoleMat-${x}`, GOLD, new Color3(0.55, 0.18, 0.01));
    const flag = MeshBuilder.CreateBox(`checkpointFlag-${x}`, { width: 0.78, height: 0.46, depth: 0.05 }, this.scene);
    flag.parent = root;
    flag.position = new Vector3(0.4, 1.2, -0.05);
    flag.material = this.createMaterial(`checkpointFlagMat-${x}`, RESCUE_CORAL, new Color3(0.4, 0.03, 0.02));
    const knot = MeshBuilder.CreateSphere(`checkpointKnot-${x}`, { diameter: 0.22, segments: 14 }, this.scene);
    knot.parent = root;
    knot.position = new Vector3(0, 1.57, -0.07);
    knot.material = this.createMaterial(`checkpointKnotMat-${x}`, CREAM, GOLD);
    root.position = new Vector3(x, -4.2, -0.12);
    return { x, activated: false, label, root };
  }

  private createRescueDome() {
    const base = MeshBuilder.CreateCylinder("rescueDomeBase", { height: 0.34, diameter: 2.8, tessellation: 28 }, this.scene);
    base.position = new Vector3(62.4, 3.68, -0.15);
    base.material = this.createMaterial("rescueDomeBaseMat", RESCUE_CORAL, new Color3(0.55, 0.03, 0.02));

    const dome = MeshBuilder.CreateSphere("rescueDome", { diameter: 2.65, segments: 28 }, this.scene);
    dome.position = new Vector3(62.4, 4.8, 0.15);
    const domeMaterial = this.createMaterial("rescueDomeMat", new Color3(0.35, 0.8, 0.98), new Color3(0.05, 0.32, 0.58));
    domeMaterial.alpha = 0.22;
    domeMaterial.backFaceCulling = false;
    dome.material = domeMaterial;

    const halo = MeshBuilder.CreateTorus("rescueHalo", { diameter: 3.05, thickness: 0.08, tessellation: 40 }, this.scene);
    halo.position = new Vector3(62.4, 3.88, -0.33);
    halo.rotation.x = Math.PI / 2;
    halo.material = this.createMaterial("rescueHaloMat", GOLD, RESCUE_CORAL);
    this.leftShoeHalo = halo;

    this.leftShoe = this.createLeftShoe();
    this.leftShoe.position = new Vector3(62.38, 3.95, -0.32);
  }

  private createLeftShoe(): TransformNode {
    const root = new TransformNode("leftShoeRoot", this.scene);
    const sole = MeshBuilder.CreateBox("leftSole", { width: 1.35, height: 0.22, depth: 0.62 }, this.scene);
    sole.parent = root;
    sole.position = new Vector3(-0.05, 0.25, 0);
    sole.material = this.createMaterial("leftSoleMat", CREAM, new Color3(0.18, 0.08, 0.02));
    const upper = MeshBuilder.CreateSphere("leftUpper", { diameter: 0.92, segments: 20 }, this.scene);
    upper.parent = root;
    upper.position = new Vector3(-0.02, 0.58, 0);
    upper.scaling = new Vector3(0.9, 0.58, 0.55);
    upper.material = this.createMaterial("leftUpperMat", new Color3(1, 0.72, 0.55), RESCUE_CORAL);
    const heart = MeshBuilder.CreateSphere("leftHeart", { diameter: 0.16, segments: 12 }, this.scene);
    heart.parent = root;
    heart.position = new Vector3(-0.12, 0.72, -0.43);
    heart.material = this.createMaterial("leftHeartMat", RESCUE_CORAL, GOLD);
    root.getChildMeshes().forEach((mesh) => { mesh.visibility = 0.08; });
    this.addFootwearBillboard(
      "leftShoeRealisticSprite",
      gameAssets.leftShoeRealistic,
      root,
      2.22,
      1.7,
      new Vector3(-0.03, 0.87, -0.62),
      RESCUE_CORAL,
    );
    return root;
  }

  private createForegroundDetails() {
    const wire = MeshBuilder.CreateTorus("laundryBasketRim", { diameter: 2.8, thickness: 0.14, tessellation: 24 }, this.scene);
    wire.position = new Vector3(28.4, -3.0, 0.2);
    wire.scaling.x = 1.55;
    wire.material = this.createMaterial("laundryBasketRimMat", new Color3(0.24, 0.74, 0.8), new Color3(0.03, 0.24, 0.37));

    for (let index = 0; index < 5; index += 1) {
      const sock = MeshBuilder.CreateBox(`sockProp-${index}`, { width: 0.22, height: 0.78, depth: 0.08 }, this.scene);
      sock.position = new Vector3(44 + index * 2.9, -3.55 + (index % 2) * 0.15, 1.55);
      sock.rotation.z = -0.28 + index * 0.13;
      sock.material = this.createMaterial(`sockPropMat-${index}`, index % 2 === 0 ? CREAM : RESCUE_CORAL, new Color3(0.1, 0.04, 0.04));
    }
  }

  private bindInput() {
    window.addEventListener("keydown", this.onKeyDownBound, { passive: false });
    window.addEventListener("keyup", this.onKeyUpBound, { passive: false });
    window.addEventListener("shoe-adventure:command", this.onCommandBound);
  }

  private onKeyDown(event: KeyboardEvent) {
    const key = event.key.toLowerCase();
    if (["arrowleft", "arrowright", "arrowup", " ", "a", "d", "w", "q", "e", "shift", "r", "escape"].includes(key)) {
      event.preventDefault();
    }
    if (this.superRun && key !== "escape") return;
    if (key === "arrowleft" || key === "a") this.held.left = true;
    if (key === "arrowright" || key === "d") this.held.right = true;
    if (key === "arrowup" || key === "w" || key === " ") this.tryJump();
    if (key === "shift") this.tryDash();
    if (key === "q") this.tryLaceLash();
    if (key === "e") this.tryGumStomp();
    if (key === "r") this.restart();
    if (key === "escape") this.togglePause();
    if ((key === "enter" || key === " ") && this.mode === "title") this.start();
  }

  private onKeyUp(event: KeyboardEvent) {
    const key = event.key.toLowerCase();
    if (key === "arrowleft" || key === "a") this.held.left = false;
    if (key === "arrowright" || key === "d") this.held.right = false;
  }

  private onCommand(event: CustomEvent<GameCommand>) {
    const command = event.detail;
    if (command === "start") this.start();
    if (command === "restart") this.restart();
    if (command === "pause") this.togglePause();
    if (command === "jump") this.tryJump();
    if (command === "dash") this.tryDash();
    if (command === "lash") this.tryLaceLash();
    if (command === "stomp") this.tryGumStomp();
    if (command === "holdLeft") this.held.left = true;
    if (command === "holdRight") this.held.right = true;
    if (command === "superRun") this.startSuperRun();
    if (command === "celebrate") this.previewReunion();
    if (this.superRun && !["pause", "restart"].includes(command)) return;
    if (command === "releaseLeft") this.held.left = false;
    if (command === "releaseRight") this.held.right = false;
  }

  private start() {
    if (this.mode === "title" || this.mode === "paused") {
      this.superRun = false;
      this.superRunAction = "AI standing by.";
      this.mode = "playing";
      this.message = this.mode === "playing" ? "Every leap gets you closer to your left." : this.message;
      this.publishUi(true);
    }
  }

  private togglePause() {
    if (this.mode === "playing") {
      this.mode = "paused";
      this.message = "Paused at the stitched route.";
      this.publishUi(true);
    } else if (this.mode === "paused") {
      this.mode = "playing";
      this.message = "Back on the rescue route.";
      this.publishUi(true);
    }
  }

  private restart() {
    this.superRun = false;
    this.superRunAction = "AI standing by.";
    this.mode = "playing";
    const checkpointX = this.activeCheckpoint === "Bedroom Threshold" ? 0 : this.activeCheckpoint === "Lace Bridge" ? 32.4 : 49.7;
    this.player.x = checkpointX;
    this.player.bottom = -4.2;
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.hearts = 3;
    this.player.invulnerable = 1.5;
    this.player.root.setEnabled(true);
    this.message = "Right Shoe is back on the trail.";
    this.publishUi(true);
  }

  private startSuperRun() {
    this.mode = "playing";
    this.superRun = true;
    this.superRunAction = "AI ROUTE LOCKED — scanning the button trail.";
    this.activeCheckpoint = "Bedroom Threshold";
    this.buttons = 0;
    this.player.x = 0;
    this.player.bottom = -4.2;
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.hearts = 3;
    this.player.doubleJumps = 0;
    this.player.dashCharges = 0;
    this.player.moonTimer = 0;
    this.player.shoeForm = "starter";
    this.player.laceLash = false;
    this.player.gumStomp = false;
    this.player.lashCooldown = 0;
    this.player.stompCooldown = 0;
    this.player.lashTimer = 0;
    this.player.stompTimer = 0;
    this.applyShoeForm("starter");
    this.player.invulnerable = 2;
    this.player.jumpUsed = false;
    this.player.root.setEnabled(true);
    this.held.left = false;
    this.held.right = true;
    this.pickups.forEach((pickup) => {
      pickup.collected = false;
      pickup.root.setEnabled(true);
    });
    this.enemies.forEach((enemy) => {
      enemy.alive = true;
      enemy.x = enemy.minX + 0.35;
      enemy.root.setEnabled(true);
    });
    this.checkpoints.forEach((checkpoint) => { checkpoint.activated = false; });
    if (this.leftShoeHalo) this.leftShoeHalo.scaling = Vector3.One();
    this.publishUi(true);
  }

  private previewReunion() {
    this.superRun = false;
    this.mode = "won";
    this.message = "Pair restored! Right Shoe and Left Shoe dance their stitches home.";
    this.held.left = false;
    this.held.right = false;
    if (this.leftShoeHalo) this.leftShoeHalo.scaling = new Vector3(1.52, 1.52, 1.52);
    this.spawnSparks(62.4, 4.2, RESCUE_CORAL, 46, 4.2);
    this.publishUi(true);
  }

  private tryJump() {
    if (this.mode === "title") {
      this.start();
      return;
    }
    if (this.mode !== "playing") return;
    if (this.player.grounded) {
      this.player.vy = 8.9;
      this.player.grounded = false;
      this.player.jumpUsed = false;
      this.spawnSparks(this.player.x - this.player.facing * 0.35, this.player.bottom + 0.18, CREAM, 6, 1.7);
    } else if (!this.player.jumpUsed && this.player.doubleJumps > 0) {
      this.player.doubleJumps -= 1;
      this.player.jumpUsed = true;
      this.player.vy = 8.25;
      this.message = "Wingtip Feather lifts the rescue route.";
      this.spawnSparks(this.player.x, this.player.bottom + 0.5, GOLD, 11, 2.3);
      this.publishUi(true);
    }
  }

  private tryDash() {
    if (this.mode !== "playing" || this.player.dashCharges <= 0 || this.player.dashCooldown > 0) return;
    this.player.dashCharges -= 1;
    this.player.dashTimer = 0.26;
    this.player.dashCooldown = 0.18;
    this.player.invulnerable = 0.28;
    this.player.vx = this.player.facing * 20;
    this.message = "Lace Dash burns a coral trail.";
    this.spawnSparks(this.player.x - this.player.facing * 0.42, this.player.bottom + 0.62, RESCUE_CORAL, 14, 3.4);
    this.publishUi(true);
  }

  private applyShoeForm(form: ShoeForm) {
    this.player.shoeForm = form;
    const asset = form === "coralChrome" ? gameAssets.rightShoeCoralChrome : form === "moonstep" ? gameAssets.rightShoeMoonstep : gameAssets.rightShoeRealistic;
    const glow = form === "moonstep" ? CYAN : form === "coralChrome" ? GOLD : RESCUE_CORAL;
    if (this.heroSpriteMaterial) {
      const texture = new Texture(asset, this.scene);
      texture.hasAlpha = true;
      this.heroSpriteMaterial.diffuseTexture = texture;
      this.heroSpriteMaterial.opacityTexture = texture;
      this.heroSpriteMaterial.useAlphaFromDiffuseTexture = true;
      this.heroSpriteMaterial.emissiveColor = glow.scale(form === "starter" ? 0.34 : 0.46);
      this.heroSpriteMaterial.specularColor = new Color3(1, 0.95, 0.83);
      this.heroSpriteMaterial.specularPower = form === "starter" ? 96 : 120;
    }
    if (this.heroHalo) {
      const material = this.heroHalo.material as StandardMaterial | null;
      if (material) {
        material.diffuseColor = glow;
        material.emissiveColor = glow.scale(0.46);
        material.alpha = form === "starter" ? 0.19 : 0.3;
      }
    }
    this.player.root.scaling.y = form === "moonstep" ? 1.07 : 1;
    this.player.root.scaling.z = form === "coralChrome" ? 1.04 : 1;
  }

  private tryLaceLash() {
    if (this.mode !== "playing" || !this.player.laceLash || this.player.lashCooldown > 0) return;
    this.player.lashCooldown = 0.72;
    this.player.lashTimer = 0.34;
    this.player.invulnerable = Math.max(this.player.invulnerable, 0.32);
    const targets = this.enemies.filter((enemy) =>
      enemy.alive && (enemy.x - this.player.x) * this.player.facing > -0.35 && (enemy.x - this.player.x) * this.player.facing < 3.45 && Math.abs(enemy.bottom - this.player.bottom) < 2.1,
    );
    this.spawnSparks(this.player.x + this.player.facing * 1.15, this.player.bottom + 0.72, CREAM, 16, 3.8);
    targets.forEach((enemy) => this.defeatEnemy(enemy));
    this.message = targets.length > 0 ? "Lace Lash snaps the shoe fiends off the route." : "Lace Lash cracks across the stitched air.";
    this.publishUi(true);
  }

  private tryGumStomp() {
    if (this.mode !== "playing" || !this.player.gumStomp || this.player.stompCooldown > 0) return;
    this.player.stompCooldown = 1.25;
    this.player.stompTimer = 0.42;
    this.player.invulnerable = Math.max(this.player.invulnerable, 0.48);
    if (this.player.grounded) this.player.vy = 4.2;
    const targets = this.enemies.filter((enemy) => enemy.alive && Math.abs(enemy.x - this.player.x) < 2.45 && Math.abs(enemy.bottom - this.player.bottom) < 2.35);
    this.spawnSparks(this.player.x, this.player.bottom + 0.34, MOSS, 22, 4.1);
    targets.forEach((enemy) => this.defeatEnemy(enemy));
    this.message = targets.length > 0 ? "Gum Stomp sticks the shoe fiends in place — then bounces clear!" : "Gum Stomp lands with a bright sticky bounce.";
    this.publishUi(true);
  }

  private update(delta: number) {
    this.titleTime += delta;
    this.updateDecor(delta);
    if (this.mode === "title") {
      if (this.isDemo) this.start();
      this.player.root.position.y = -4.2 + Math.sin(this.titleTime * 2.6) * 0.12;
      this.player.root.rotation.z = Math.sin(this.titleTime * 2.2) * 0.04;
      return;
    }
    if (this.mode !== "playing") return;

    if (this.isDemo) this.updateDemo(delta);
    if (this.superRun) this.updateSuperRun(delta);
    this.updatePlayer(delta);
    this.updateEnemies(delta);
    this.updatePickups(delta);
    this.updateCheckpoints();
    this.updateSparks(delta);
    this.updateCamera(delta);
    this.checkRescue();
    this.publishUi(false);
  }

  private updateDemo(delta: number) {
    this.held.right = this.player.x < 63.2;
    this.demoJumpTimer -= delta;
    const upcomingHeight = this.platforms.some(
      (platform) =>
        platform.x - platform.width / 2 > this.player.x &&
        platform.x - platform.width / 2 - this.player.x < 2.2 &&
        platform.top > this.player.bottom + 0.2,
    );
    if (this.player.grounded && this.demoJumpTimer <= 0 && (upcomingHeight || Math.floor(this.player.x) % 9 === 0)) {
      this.tryJump();
      this.demoJumpTimer = 1.25;
    }
    if (this.player.dashCharges > 0 && this.player.x > 21 && this.player.dashCooldown <= 0) this.tryDash();
  }

  private updateSuperRun(delta: number) {
    this.superRunKickTimer = Math.max(0, this.superRunKickTimer - delta);
    this.held.left = false;
    this.held.right = this.player.x < 63.2;

    if (this.player.x >= 6.6) this.claimSuperRunPowerup("feather", "WINGTIP FLIGHT — double-jump unlocked.");
    if (this.player.x >= 12.8) this.claimSuperRunPowerup("chrome", "CORAL CHROME — hero shine upgraded.");
    if (this.player.x >= 18.8) this.claimSuperRunPowerup("dash", "LACE DASH — coral boost charged.");
    if (this.player.x >= 30.0) this.claimSuperRunPowerup("moonstep", "MOONSTEP RUNNER — cobalt speed form unlocked.");
    if (this.player.x >= 33.1) this.claimSuperRunPowerup("heart", "HEART SOLE — route integrity restored.");
    if (this.player.x >= 41.7) this.claimSuperRunPowerup("lash", "LACE LASH — thread-whip armed.");
    if (this.player.x >= 45.8) this.claimSuperRunPowerup("moon", "MOON INSOLE — enemies slowed for the finale.");
    if (this.player.x >= 54.8) this.claimSuperRunPowerup("gum", "GUM STOMP — sticky sole impact armed.");

    const platformAhead = this.platforms.some(
      (platform) =>
        platform.x - platform.width / 2 > this.player.x &&
        platform.x - platform.width / 2 - this.player.x < 2.35 &&
        platform.top > this.player.bottom + 0.18,
    );
    const showcaseBeat = [7.4, 15.1, 21.1, 28.0, 35.1, 42.0, 51.1, 58.0].some((beat) => Math.abs(this.player.x - beat) < 0.16);
    if (this.player.grounded && (platformAhead || showcaseBeat)) this.tryJump();
    if (this.player.x > 19.4 && this.player.x < 25.6 && this.player.dashCharges > 0 && this.player.dashCooldown <= 0) {
      this.superRunAction = "LACE DASH — cutting through the laundry lane.";
      this.tryDash();
    }

    const target = this.enemies.find(
      (enemy) => enemy.alive && enemy.x - this.player.x < 1.38 && enemy.x >= this.player.x - 0.8,
    );
    if (target) {
      if (this.player.gumStomp && this.player.x > 54 && this.player.stompCooldown <= 0) {
        this.tryGumStomp();
        this.superRunAction = "GUM STOMP — rogue footwear pinned by a sticky sole burst.";
      } else if (this.player.laceLash && this.player.lashCooldown <= 0) {
        this.tryLaceLash();
        this.superRunAction = "LACE LASH — stitched thread snaps the lane clear.";
      } else {
        this.performSuperKick(target);
      }
    }
    if (this.player.x > 60.1 && this.mode === "playing") this.superRunAction = "RESCUE PROTOCOL — crossing into Lefty’s tower.";
  }

  private claimSuperRunPowerup(kind: PickupKind, callout: string) {
    const pickup = this.pickups.find((candidate) => candidate.kind === kind && !candidate.collected);
    if (!pickup) return;
    this.collectPickup(pickup);
    this.superRunAction = callout;
    this.message = `AI SUPER RUN: ${callout}`;
  }

  private performSuperKick(enemy: Enemy) {
    if (!enemy.alive) return;
    const move = enemy.kind === "skate" ? "TURBO HEEL KICK" : enemy.kind === "slime" ? "CRESCENT SOLE KICK" : "SOLE-FLIP KICK";
    if (enemy.kind === "skate" && this.player.dashCharges > 0 && this.player.dashCooldown <= 0) this.tryDash();
    this.superRunKickTimer = 0.52;
    this.defeatEnemy(enemy);
    this.player.vy = Math.max(this.player.vy, 7.4);
    this.superRunAction = `${move} — ${enemy.kind === "skate" ? "rogue skate grounded." : "shoe fiend cleared."}`;
    this.message = `AI SUPER RUN: ${this.superRunAction}`;
    this.spawnSparks(enemy.x, enemy.bottom + 0.78, RESCUE_CORAL, 12, 3.8);
  }

  private updatePlayer(delta: number) {
    this.player.invulnerable = Math.max(0, this.player.invulnerable - delta);
    this.player.dashTimer = Math.max(0, this.player.dashTimer - delta);
    this.player.dashCooldown = Math.max(0, this.player.dashCooldown - delta);
    this.player.lashCooldown = Math.max(0, this.player.lashCooldown - delta);
    this.player.stompCooldown = Math.max(0, this.player.stompCooldown - delta);
    this.player.lashTimer = Math.max(0, this.player.lashTimer - delta);
    this.player.stompTimer = Math.max(0, this.player.stompTimer - delta);
    this.player.moonTimer = Math.max(0, this.player.moonTimer - delta);

    const direction = (this.held.right ? 1 : 0) - (this.held.left ? 1 : 0);
    const targetSpeed = this.player.dashTimer > 0 ? this.player.facing * 19 : direction * 6.4;
    const response = this.player.grounded ? 18 : 10;
    this.player.vx += (targetSpeed - this.player.vx) * Math.min(1, response * delta);
    if (direction !== 0) this.player.facing = direction > 0 ? 1 : -1;

    const previousBottom = this.player.bottom;
    this.player.vy -= 21.5 * delta;
    this.player.x += this.player.vx * delta;
    this.player.bottom += this.player.vy * delta;
    this.player.x = Math.max(-3.5, Math.min(WORLD_END, this.player.x));
    this.player.grounded = false;

    if (this.player.vy <= 0) {
      for (const platform of this.platforms) {
        const overlapX = this.player.x + PLAYER_WIDTH / 2 > platform.x - platform.width / 2 && this.player.x - PLAYER_WIDTH / 2 < platform.x + platform.width / 2;
        const crossedTop = previousBottom >= platform.top - 0.04 && this.player.bottom <= platform.top;
        if (overlapX && crossedTop) {
          this.player.bottom = platform.top;
          this.player.vy = 0;
          this.player.grounded = true;
          this.player.jumpUsed = false;
          break;
        }
      }
    }

    if (this.player.bottom < -8) this.damagePlayer("The laundry chute tossed Right Shoe back.");

    const bob = this.player.grounded ? Math.abs(this.player.vx) * Math.sin(this.titleTime * 20) * 0.008 : 0;
    this.player.root.position.x = this.player.x;
    this.player.root.position.y = this.player.bottom + bob;
    this.player.root.scaling.x = this.player.facing;
    this.player.root.rotation.z = Math.max(-0.18, Math.min(0.18, -this.player.vx * 0.016));
    if (this.superRunKickTimer > 0) this.player.root.rotation.z = -this.player.facing * 0.62;
    if (this.player.lashTimer > 0) this.player.root.rotation.z = -this.player.facing * 0.4;
    if (this.player.stompTimer > 0) this.player.root.rotation.z = this.player.facing * 0.16;
    if (this.heroHalo) {
      const pulse = 1 + Math.sin(this.titleTime * 7.4) * 0.06 + (this.player.shoeForm === "starter" ? 0 : 0.07);
      this.heroHalo.scaling = new Vector3(pulse, pulse, 1);
    }
    if (this.player.dashTimer > 0) {
      this.spawnSparks(this.player.x - this.player.facing * 0.5, this.player.bottom + 0.65, RESCUE_CORAL, 1, 1.4);
    }
    if (this.player.lashTimer > 0) {
      this.spawnSparks(this.player.x + this.player.facing * 1.15, this.player.bottom + 0.8, CREAM, 1, 1.2);
    }
  }

  private updateEnemies(delta: number) {
    const slowFactor = this.player.moonTimer > 0 ? 0.36 : 1;
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      enemy.x += enemy.speed * slowFactor * delta;
      if (enemy.x < enemy.minX || enemy.x > enemy.maxX) {
        enemy.x = Math.max(enemy.minX, Math.min(enemy.maxX, enemy.x));
        enemy.speed *= -1;
      }
      const hover = enemy.kind === "skate" ? Math.sin(this.titleTime * 3.1 + enemy.phase) * 0.16 : 0;
      enemy.root.position.x = enemy.x;
      enemy.root.position.y = enemy.bottom + hover;
      enemy.root.rotation.z = Math.sin(this.titleTime * 4 + enemy.phase) * (enemy.kind === "slime" ? 0.07 : 0.025);
      enemy.root.scaling.x = enemy.speed < 0 ? -1 : 1;

      const horizontal = Math.abs(this.player.x - enemy.x) < (PLAYER_WIDTH + enemy.width) / 2;
      const playerTop = this.player.bottom + PLAYER_HEIGHT;
      const enemyTop = enemy.bottom + enemy.height;
      const stomp = horizontal && this.player.vy < -1.5 && this.player.bottom <= enemyTop + 0.28 && playerTop >= enemy.bottom;
      const sideHit = horizontal && this.player.bottom < enemyTop - 0.08 && playerTop > enemy.bottom + 0.12;
      if (stomp) {
        this.defeatEnemy(enemy);
      } else if (sideHit && this.player.dashTimer <= 0) {
        this.damagePlayer(enemy.kind === "skate" ? "Rogue skate clipped the rescue route." : "A shoe fiend knocked Right Shoe back.");
      }
    }
  }

  private updatePickups(delta: number) {
    for (const pickup of this.pickups) {
      if (pickup.collected) continue;
      pickup.root.position.y = pickup.y + Math.sin(this.titleTime * 3 + pickup.phase) * 0.11;
      pickup.root.rotation.z += delta * 0.8;
      if (Math.abs(this.player.x - pickup.x) < pickup.radius + 0.48 && Math.abs(this.player.bottom + 0.7 - pickup.root.position.y) < pickup.radius + 0.7) {
        this.collectPickup(pickup);
      }
    }
  }

  private updateCheckpoints() {
    for (const checkpoint of this.checkpoints) {
      if (!checkpoint.activated && this.player.x >= checkpoint.x) {
        checkpoint.activated = true;
        this.activeCheckpoint = checkpoint.label;
        checkpoint.root.getChildMeshes().forEach((mesh) => {
          const material = mesh.material as StandardMaterial | null;
          if (material) material.emissiveColor = GOLD;
        });
        this.message = `Checkpoint stitched: ${checkpoint.label}.`;
        this.spawnSparks(checkpoint.x, -3.1, GOLD, 16, 2.4);
        this.publishUi(true);
      }
    }
  }

  private updateSparks(delta: number) {
    for (let index = this.sparks.length - 1; index >= 0; index -= 1) {
      const spark = this.sparks[index];
      spark.life -= delta;
      spark.mesh.position.addInPlace(spark.velocity.scale(delta));
      spark.velocity.y -= 4.5 * delta;
      spark.mesh.scaling.scaleInPlace(0.98);
      if (spark.life <= 0) {
        spark.mesh.dispose();
        this.sparks.splice(index, 1);
      }
    }
  }

  private updateDecor(_delta: number) {
    this.parallax.forEach((mesh, index) => {
      mesh.position.x += Math.sin(this.titleTime * 0.23 + index) * 0.0007;
    });
    if (this.leftShoe) {
      this.leftShoe.position.y = 3.95 + Math.sin(this.titleTime * 2.1) * 0.07;
      this.leftShoe.rotation.z = Math.sin(this.titleTime * 1.8) * 0.035;
    }
    if (this.leftShoeHalo) this.leftShoeHalo.rotation.z += 0.006;
  }

  private updateCamera(delta: number) {
    const targetX = Math.max(0, Math.min(52, this.player.x - 1.8));
    this.camera.position.x += (targetX - this.camera.position.x) * Math.min(1, 4.2 * delta);
    this.camera.setTarget(new Vector3(this.camera.position.x + 1.2, -0.4, 0));
  }

  private defeatEnemy(enemy: Enemy) {
    enemy.alive = false;
    enemy.root.setEnabled(false);
    this.player.vy = 6.1;
    this.buttons += 4;
    this.message = "Sole stomp! A rescue spark lights the way.";
    this.spawnSparks(enemy.x, enemy.bottom + 0.6, GOLD, 16, 3.1);
    this.publishUi(true);
  }

  private damagePlayer(reason: string) {
    if (this.player.invulnerable > 0 || this.mode !== "playing") return;
    if (this.superRun) {
      this.player.invulnerable = 0.85;
      this.superRunAction = "AI RECOVERY — lace barrier absorbed the hit.";
      this.message = `AI SUPER RUN: ${this.superRunAction}`;
      this.spawnSparks(this.player.x, this.player.bottom + 0.65, CYAN, 9, 2.3);
      this.publishUi(true);
      return;
    }
    this.player.hearts -= 1;
    this.player.invulnerable = 1.35;
    this.player.vx = -this.player.facing * 7.8;
    this.player.vy = 5.2;
    this.message = reason;
    this.spawnSparks(this.player.x, this.player.bottom + 0.65, RESCUE_CORAL, 14, 2.6);
    if (this.player.hearts <= 0) {
      this.mode = "lost";
      this.message = "The route tangled. Press restart and try again.";
      this.player.root.setEnabled(false);
    }
    this.publishUi(true);
  }

  private collectPickup(pickup: Pickup) {
    pickup.collected = true;
    pickup.root.setEnabled(false);
    if (pickup.kind === "button") {
      this.buttons += 1;
      this.spawnSparks(pickup.x, pickup.y, GOLD, 5, 1.35);
    }
    if (pickup.kind === "feather") {
      this.player.doubleJumps += 1;
      this.message = "Wingtip Feather: one double jump stitched in.";
      this.spawnSparks(pickup.x, pickup.y, GOLD, 15, 2.7);
    }
    if (pickup.kind === "dash") {
      this.player.dashCharges += 1;
      this.message = "Lace Dash spool: Shift unlocks a burst.";
      this.spawnSparks(pickup.x, pickup.y, CYAN, 15, 2.7);
    }
    if (pickup.kind === "heart") {
      this.player.hearts = Math.min(3, this.player.hearts + 1);
      this.message = "Heart Sole: Right Shoe feels lighter.";
      this.spawnSparks(pickup.x, pickup.y, RESCUE_CORAL, 17, 2.8);
    }
    if (pickup.kind === "moon") {
      this.player.moonTimer = Math.max(this.player.moonTimer, 12);
      this.message = "Moon Insole: shoe fiends slow to a crawl.";
      this.spawnSparks(pickup.x, pickup.y, VIOLET, 18, 2.6);
    }
    if (pickup.kind === "chrome") {
      this.applyShoeForm("coralChrome");
      this.message = "Coral Chrome: Right Shoe shines brighter than the rescue stars.";
      this.spawnSparks(pickup.x, pickup.y, GOLD, 22, 3.1);
    }
    if (pickup.kind === "moonstep") {
      this.applyShoeForm("moonstep");
      this.message = "Moonstep Runner: a cobalt sneaker form is stitched in.";
      this.spawnSparks(pickup.x, pickup.y, CYAN, 24, 3.25);
    }
    if (pickup.kind === "lash") {
      this.player.laceLash = true;
      this.message = "Lace Lash unlocked: press Q or tap LASH to crack the thread whip.";
      this.spawnSparks(pickup.x, pickup.y, CREAM, 20, 3.0);
    }
    if (pickup.kind === "gum") {
      this.player.gumStomp = true;
      this.message = "Gum Stomp unlocked: press E or tap STOMP for sticky sole impact.";
      this.spawnSparks(pickup.x, pickup.y, MOSS, 24, 3.2);
    }
    this.publishUi(true);
  }

  private checkRescue() {
    if (this.player.x < 60.7 || this.mode !== "playing") return;
    this.mode = "won";
    this.superRunAction = this.superRun ? "PAIR RESTORED — BIG WIN!" : this.superRunAction;
    this.message = this.superRun ? "PAIR RESTORED! The AI Super Run found Left Shoe." : "Reunited! Right Shoe found the Left Shoe.";
    this.held.left = false;
    this.held.right = false;
    if (this.leftShoeHalo) this.leftShoeHalo.scaling = new Vector3(1.52, 1.52, 1.52);
    this.spawnSparks(62.4, 4.2, RESCUE_CORAL, 46, 4.2);
    this.publishUi(true);
  }

  private spawnSparks(x: number, y: number, color: Color3, count: number, speed: number) {
    if (this.sparks.length > 90) return;
    for (let index = 0; index < count; index += 1) {
      const spark = MeshBuilder.CreateDisc(`rescueSpark-${this.titleTime}-${index}`, { radius: 0.045 + (index % 3) * 0.018, tessellation: 10 }, this.scene);
      spark.position = new Vector3(x, y, -0.8);
      spark.material = this.createMaterial(`rescueSparkMat-${this.titleTime}-${index}`, color, color.scale(0.7));
      spark.isPickable = false;
      const angle = (Math.PI * 2 * index) / count + this.titleTime * 1.3;
      const magnitude = speed * (0.45 + (index % 5) * 0.11);
      this.sparks.push({
        mesh: spark,
        velocity: new Vector3(Math.cos(angle) * magnitude, Math.sin(angle) * magnitude + 0.8, 0),
        life: 0.4 + (index % 4) * 0.08,
        maxLife: 0.7,
      });
    }
  }

  private createMaterial(name: string, diffuse: Color3, emissive: Color3) {
    const material = new StandardMaterial(name, this.scene);
    material.diffuseColor = diffuse;
    material.emissiveColor = emissive.scale(0.14);
    material.specularColor = new Color3(0.45, 0.42, 0.38);
    material.specularPower = 48;
    return material;
  }

  private publishUi(force: boolean) {
    const snapshot: UiSnapshot = {
      mode: this.mode,
      hearts: this.player.hearts,
      buttons: this.buttons,
      doubleJumps: this.player.doubleJumps,
      dashCharges: this.player.dashCharges,
      moonSeconds: Math.ceil(this.player.moonTimer),
      message: this.message,
      checkpoint: this.activeCheckpoint,
      rescued: this.mode === "won",
      superRun: this.superRun,
      superRunAction: this.superRunAction,
      shoeForm: this.player.shoeForm,
      laceLash: this.player.laceLash,
      gumStomp: this.player.gumStomp,
    };
    const signature = JSON.stringify(snapshot);
    if (!force && signature === this.lastUiSignature) return;
    this.lastUiSignature = signature;
    window.dispatchEvent(new CustomEvent<UiSnapshot>("shoe-adventure:update", { detail: snapshot }));
  }
}
