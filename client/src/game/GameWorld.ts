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
type PickupKind =
  | "button"
  | "feather"
  | "dash"
  | "heart"
  | "moon"
  | "chrome"
  | "moonstep"
  | "lash"
  | "gum"
  | "superJump"
  | "bonus"
  | "pump"
  | "hightop"
  | "loafer"
  | "cowboy"
  | "sneaker"
  | "ultra";
type ShoeForm = "starter" | "coralChrome" | "moonstep" | "pump" | "hightop" | "loafer" | "cowboy" | "sneaker";
type EnemyKind = "lace" | "slime" | "skate";
type ContraptionKind = "buttonRun" | "laceLever" | "gumPress" | "spoolLift";
type GameCommand =
  | "start"
  | "restart"
  | "pause"
  | "jump"
  | "dash"
  | "lash"
  | "stomp"
  | "formAttack"
  | "ultra"
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
  superJump: boolean;
  superJumpTimer: number;
  shoeForm: ShoeForm;
  laceLash: boolean;
  gumStomp: boolean;
  lashCooldown: number;
  stompCooldown: number;
  lashTimer: number;
  stompTimer: number;
  formAttackTimer: number;
  formAttackCooldown: number;
  formShieldTimer: number;
  ultraMove: boolean;
  ultraTimer: number;
  ultraCooldown: number;
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
  bossTier?: "mini" | "boss";
  bossName?: string;
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

interface Contraption {
  kind: ContraptionKind;
  root: TransformNode;
  x: number;
  activated: boolean;
  progress: number;
  parts: Mesh[];
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
  superRunStage: number;
  superRunStageLabel: string;
  superRunCoverage: string;
  shoeForm: ShoeForm;
  laceLash: boolean;
  gumStomp: boolean;
  superJump: boolean;
  shoeFormAttack: string;
  formAttackReady: boolean;
  ultraMove: boolean;
  bossName: string;
  bossDefeated: boolean;
  reunionSeconds: number;
  contraptionsActivated: number;
  contraptionStatus: string;
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
  private readonly contraptions: Contraption[] = [];
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
  private superRunPauseTimer = 0;
  private superRunStage = 0;
  private superRunStageLabel = "STANDBY";
  private readonly superRunMilestones = new Set<string>();
  private bossDefeated = false;
  private reunionTimer = 0;
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
    this.createContraptions();
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

  private createContraptions() {
    this.createButtonBallRun(11.2, -3.95);
    this.createLaceLever(42.4, 0.25);
    this.createGumPress(55.2, 2.15);
    this.createSpoolLift(59.4, 3.15);
  }

  private createButtonBallRun(x: number, y: number) {
    const root = new TransformNode("buttonBallRun", this.scene);
    root.position = new Vector3(x, y, -0.3);
    const track = MeshBuilder.CreateBox("buttonBallTrack", { width: 3.15, height: 0.18, depth: 0.42 }, this.scene);
    track.parent = root;
    track.position = new Vector3(0, 0.48, 0);
    track.rotation.z = -0.13;
    track.material = this.createMaterial("buttonBallTrackMat", new Color3(0.58, 0.31, 0.13), new Color3(0.12, 0.045, 0.01));
    const ball = MeshBuilder.CreateSphere("coralButtonBall", { diameter: 0.44, segments: 18 }, this.scene);
    ball.parent = root;
    ball.position = new Vector3(-1.18, 0.72, -0.16);
    ball.material = this.createMaterial("coralButtonBallMat", RESCUE_CORAL, GOLD);
    const bell = MeshBuilder.CreateTorus("buttonRunBell", { diameter: 0.54, thickness: 0.12, tessellation: 18 }, this.scene);
    bell.parent = root;
    bell.position = new Vector3(1.2, 0.72, -0.08);
    bell.material = this.createMaterial("buttonRunBellMat", GOLD, new Color3(0.52, 0.2, 0.01));
    const railParts = [track, ball, bell];
    [-1.35, 1.35].forEach((offset, index) => {
      const post = MeshBuilder.CreateCylinder(`buttonRunPost-${index}`, { height: 0.72, diameter: 0.12, tessellation: 12 }, this.scene);
      post.parent = root;
      post.position = new Vector3(offset, 0.36, 0.1);
      post.material = this.createMaterial(`buttonRunPostMat-${index}`, CREAM, new Color3(0.2, 0.08, 0.02));
      railParts.push(post);
    });
    this.contraptions.push({ kind: "buttonRun", root, x, activated: false, progress: 0, parts: railParts });
  }

  private createLaceLever(x: number, y: number) {
    const root = new TransformNode("laceLeverContraption", this.scene);
    root.position = new Vector3(x, y, -0.28);
    const base = MeshBuilder.CreateBox("laceLeverBase", { width: 1.25, height: 0.32, depth: 0.68 }, this.scene);
    base.parent = root;
    base.position = new Vector3(0, 0.16, 0);
    base.material = this.createMaterial("laceLeverBaseMat", new Color3(0.56, 0.29, 0.12), new Color3(0.1, 0.035, 0.01));
    const arm = MeshBuilder.CreateBox("laceLeverArm", { width: 1.8, height: 0.15, depth: 0.15 }, this.scene);
    arm.parent = root;
    arm.position = new Vector3(0.12, 0.88, -0.06);
    arm.rotation.z = 0.24;
    arm.material = this.createMaterial("laceLeverArmMat", RESCUE_CORAL, new Color3(0.48, 0.03, 0.02));
    const handle = MeshBuilder.CreateTorus("laceLeverHandle", { diameter: 0.38, thickness: 0.075, tessellation: 18 }, this.scene);
    handle.parent = root;
    handle.position = new Vector3(0.93, 1.08, -0.12);
    handle.material = this.createMaterial("laceLeverHandleMat", CREAM, GOLD);
    const parts = [base, arm, handle];
    for (let index = 0; index < 6; index += 1) {
      const domino = MeshBuilder.CreateBox(`laceLeverDomino-${index}`, { width: 0.18, height: 0.72, depth: 0.12 }, this.scene);
      domino.parent = root;
      domino.position = new Vector3(1.55 + index * 0.31, 0.38, -0.06);
      domino.material = this.createMaterial(`laceLeverDominoMat-${index}`, index % 2 === 0 ? CREAM : RESCUE_CORAL, new Color3(0.15, 0.04, 0.02));
      parts.push(domino);
    }
    this.contraptions.push({ kind: "laceLever", root, x, activated: false, progress: 0, parts });
  }

  private createGumPress(x: number, y: number) {
    const root = new TransformNode("gumPressContraption", this.scene);
    root.position = new Vector3(x, y, -0.28);
    const plate = MeshBuilder.CreateBox("gumPressPlate", { width: 2.05, height: 0.2, depth: 0.9 }, this.scene);
    plate.parent = root;
    plate.position = new Vector3(0, 0.24, 0);
    plate.material = this.createMaterial("gumPressPlateMat", new Color3(0.51, 0.3, 0.16), new Color3(0.08, 0.03, 0.01));
    const gum = MeshBuilder.CreateDisc("gumPressPad", { radius: 0.48, tessellation: 24 }, this.scene);
    gum.parent = root;
    gum.position = new Vector3(0, 0.39, -0.49);
    gum.material = this.createMaterial("gumPressPadMat", MOSS, new Color3(0.55, 0.11, 0.26));
    const ramp = MeshBuilder.CreateBox("gumPressRamp", { width: 1.75, height: 0.22, depth: 0.5 }, this.scene);
    ramp.parent = root;
    ramp.position = new Vector3(1.8, 0.82, 0.02);
    ramp.rotation.z = 0.34;
    ramp.material = this.createMaterial("gumPressRampMat", new Color3(0.62, 0.36, 0.17), new Color3(0.12, 0.04, 0.01));
    const parts = [plate, gum, ramp];
    [-0.65, 0.65].forEach((offset, index) => {
      const spring = MeshBuilder.CreateTorus(`gumPressSpring-${index}`, { diameter: 0.35, thickness: 0.075, tessellation: 16 }, this.scene);
      spring.parent = root;
      spring.position = new Vector3(offset, 0.08, -0.08);
      spring.rotation.x = Math.PI / 2;
      spring.material = this.createMaterial(`gumPressSpringMat-${index}`, GOLD, new Color3(0.45, 0.16, 0.02));
      parts.push(spring);
    });
    this.contraptions.push({ kind: "gumPress", root, x, activated: false, progress: 0, parts });
  }

  private createSpoolLift(x: number, y: number) {
    const root = new TransformNode("spoolLiftContraption", this.scene);
    root.position = new Vector3(x, y, -0.3);
    const spool = MeshBuilder.CreateCylinder("spoolLiftCore", { height: 1.15, diameter: 0.82, tessellation: 20 }, this.scene);
    spool.parent = root;
    spool.rotation.z = Math.PI / 2;
    spool.position = new Vector3(0, 0.52, 0);
    spool.material = this.createMaterial("spoolLiftCoreMat", CYAN, new Color3(0.03, 0.18, 0.4));
    const wheel = MeshBuilder.CreateTorus("spoolLiftWheel", { diameter: 1.18, thickness: 0.12, tessellation: 24 }, this.scene);
    wheel.parent = root;
    wheel.position = new Vector3(0, 0.52, -0.08);
    wheel.material = this.createMaterial("spoolLiftWheelMat", GOLD, new Color3(0.5, 0.16, 0.01));
    const cable = MeshBuilder.CreateBox("spoolLiftCable", { width: 0.08, height: 2.65, depth: 0.07 }, this.scene);
    cable.parent = root;
    cable.position = new Vector3(0.82, 1.5, 0);
    cable.material = this.createMaterial("spoolLiftCableMat", CREAM, new Color3(0.16, 0.06, 0.01));
    const hook = MeshBuilder.CreateTorus("spoolLiftHook", { diameter: 0.32, thickness: 0.08, tessellation: 16 }, this.scene);
    hook.parent = root;
    hook.position = new Vector3(0.82, 2.75, -0.05);
    hook.material = this.createMaterial("spoolLiftHookMat", RESCUE_CORAL, GOLD);
    this.contraptions.push({ kind: "spoolLift", root, x, activated: false, progress: 0, parts: [spool, wheel, cable, hook] });
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

    // Keep the crafted shoe body intentionally visible beneath the sprite so the hero never reads as translucent.
    root.getChildMeshes().forEach((mesh) => { mesh.visibility = 0.94; });
    this.heroSprite = this.addFootwearBillboard(
      "rightShoeRealisticSprite",
      gameAssets.rightShoeRealistic,
      root,
      2.56,
      1.98,
      new Vector3(0.06, 0.9, -0.64),
      RESCUE_CORAL,
    );
    this.heroSpriteMaterial = this.heroSprite.material as StandardMaterial;
    this.heroSpriteMaterial.alpha = 1;
    this.heroSpriteMaterial.emissiveColor = RESCUE_CORAL.scale(0.22);
    this.heroSpriteMaterial.specularColor = new Color3(1, 0.96, 0.84);
    this.heroSpriteMaterial.specularPower = 128;

    const halo = MeshBuilder.CreateDisc("rightShoeGlowHalo", { radius: 1.34, tessellation: 40 }, this.scene);
    halo.parent = root;
    halo.position = new Vector3(0.08, 0.84, -0.72);
    const haloMaterial = this.createMaterial("rightShoeGlowHaloMat", RESCUE_CORAL, GOLD);
    // The halo is deliberately restrained: it frames the hero instead of bleaching through it.
    haloMaterial.alpha = 0.1;
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
      superJump: false,
      superJumpTimer: 0,
      shoeForm: "starter",
      laceLash: false,
      gumStomp: false,
      lashCooldown: 0,
      stompCooldown: 0,
      lashTimer: 0,
      stompTimer: 0,
      formAttackTimer: 0,
      formAttackCooldown: 0,
      formShieldTimer: 0,
      ultraMove: false,
      ultraTimer: 0,
      ultraCooldown: 0,
    };
  }

  private createEnemies() {
    // Each transformation gate has two light foes just beyond it, so its instant move reads clearly in motion.
    this.enemies.push(this.createLaceGoblin(8.05, -4.2, 7.7, 8.4));
    this.enemies.push(this.createSlime(8.9, -4.2, 8.55, 9.25));
    this.enemies.push(this.createLaceGoblin(17.18, -2.8, 16.8, 17.55));
    this.enemies.push(this.createSlime(17.88, -2.8, 17.58, 18.12));
    this.enemies.push(this.createLaceGoblin(27.45, -2.45, 27.1, 27.85));
    this.enemies.push(this.createSlime(28.22, -2.45, 27.92, 28.6));
    this.enemies.push(this.createLaceGoblin(40.92, 0.25, 40.55, 41.28));
    this.enemies.push(this.createSlime(41.42, 0.25, 41.18, 41.7));
    this.enemies.push(this.createLaceGoblin(47.78, -1.2, 47.42, 48.16));
    this.enemies.push(this.createSlime(48.45, -1.2, 48.16, 48.9));
    this.enemies.push(this.createLaceGoblin(11.8, -4.2, 8.5, 14.2));
    this.enemies.push(this.createSlime(23.4, -1.25, 20.2, 23.4));
    this.enemies.push(this.createMiniBoss(41.9, 0.55, 39.9, 43.7, "Lace Captain"));
    this.enemies.push(this.createLaceGoblin(49.3, -1.2, 47.8, 50.0));
    this.enemies.push(this.createLaceGoblin(50.2, -4.2, 47.6, 53.6));
    this.enemies.push(this.createMiniBoss(56.7, 2.4, 55.2, 58.1, "Gum Marshal"));
    this.enemies.push(this.createTrueBoss(59.05, 2.4, 58.3, 59.55));
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

  private createMiniBoss(x: number, bottom: number, minX: number, maxX: number, bossName: string): Enemy {
    const boss = this.createRollerSkate(x, bottom, minX, maxX);
    boss.bossTier = "mini";
    boss.bossName = bossName;
    boss.width = 1.38;
    boss.height = 1.34;
    boss.speed *= 0.76;
    boss.root.scaling.y = 1.24;
    boss.root.scaling.z = 1.24;
    const crown = MeshBuilder.CreateTorus(`miniBossCrown-${x}`, { diameter: 0.65, thickness: 0.075, tessellation: 18 }, this.scene);
    crown.parent = boss.root;
    crown.position = new Vector3(0, 1.44, -0.62);
    crown.material = this.createMaterial(`miniBossCrownMat-${x}`, GOLD, RESCUE_CORAL);
    return boss;
  }

  private createTrueBoss(x: number, bottom: number, minX: number, maxX: number): Enemy {
    const boss = this.createRollerSkate(x, bottom, minX, maxX);
    boss.bossTier = "boss";
    boss.bossName = "The Tangled Titan";
    boss.width = 2.18;
    boss.height = 2.08;
    boss.speed *= 0.44;
    boss.root.scaling = new Vector3(1.72, 1.72, 1.72);
    const halo = MeshBuilder.CreateTorus(`trueBossHalo-${x}`, { diameter: 1.46, thickness: 0.12, tessellation: 24 }, this.scene);
    halo.parent = boss.root;
    halo.position = new Vector3(0, 1.42, -0.66);
    halo.material = this.createMaterial(`trueBossHaloMat-${x}`, VIOLET, RESCUE_CORAL);
    const spike = MeshBuilder.CreateCylinder(`trueBossSpur-${x}`, { height: 0.56, diameterTop: 0, diameterBottom: 0.38, tessellation: 12 }, this.scene);
    spike.parent = boss.root;
    spike.position = new Vector3(0.72, 0.92, -0.64);
    spike.rotation.z = -Math.PI / 2;
    spike.material = this.createMaterial(`trueBossSpurMat-${x}`, GOLD, CREAM);
    return boss;
  }

  private createPickups() {
    const buttonPositions = [2.7, 4.6, 6.5, 10.3, 14.5, 17.4, 20.2, 27.2, 32.8, 38.5, 45.7, 54.6, 60.2];
    buttonPositions.forEach((x, index) => {
      const y = index > 8 ? -2.95 : -3.1;
      this.pickups.push(this.createPickup("button", x, y + (index % 3) * 0.24));
    });
    this.pickups.push(this.createPickup("pump", 7.15, -3.45));
    this.pickups.push(this.createPickup("feather", 8.4, -2.7));
    this.pickups.push(this.createPickup("superJump", 12.2, -1.4));
    this.pickups.push(this.createPickup("bonus", 15.4, 0.55));
    this.pickups.push(this.createPickup("hightop", 16.35, -2.1));
    this.pickups.push(this.createPickup("dash", 19.4, -2.05));
    this.pickups.push(this.createPickup("loafer", 26.6, -1.75));
    this.pickups.push(this.createPickup("heart", 34.3, -0.55));
    this.pickups.push(this.createPickup("moon", 47.2, -0.82));
    this.pickups.push(this.createPickup("sneaker", 47.02, -0.5));
    this.pickups.push(this.createPickup("feather", 53.1, 2.0));
    this.pickups.push(this.createPickup("dash", 58.1, 3.0));
    this.pickups.push(this.createPickup("ultra", 58.45, 3.1));
    this.pickups.push(this.createPickup("chrome", 13.0, -2.5));
    this.pickups.push(this.createPickup("moonstep", 30.2, -2.2));
    this.pickups.push(this.createPickup("cowboy", 40.1, 0.95));
    this.pickups.push(this.createPickup("lash", 42.0, 0.75));
    this.pickups.push(this.createPickup("gum", 55.0, 2.95));
    // A dedicated final-stage recovery pickup makes the Tower Break’s health-management decision visible in the spectator run.
    this.pickups.push(this.createPickup("heart", 53.6, 1.6));
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
    } else if (kind === "pump") {
      icon = MeshBuilder.CreateBox(`pumpCharm-${x}`, { width: 0.7, height: 0.25, depth: 0.18 }, this.scene);
      icon.rotation.z = -0.16;
      icon.material = this.createMaterial(`pumpCharmMat-${x}`, RESCUE_CORAL, GOLD);
      const heel = MeshBuilder.CreateBox(`pumpHeel-${x}`, { width: 0.14, height: 0.48, depth: 0.16 }, this.scene);
      heel.parent = root;
      heel.position = new Vector3(-0.23, -0.2, -0.22);
      heel.material = this.createMaterial(`pumpHeelMat-${x}`, RESCUE_CORAL, GOLD);
    } else if (kind === "hightop") {
      icon = MeshBuilder.CreateBox(`hightopCharm-${x}`, { width: 0.6, height: 0.62, depth: 0.18 }, this.scene);
      icon.scaling = new Vector3(1, 1.15, 1);
      icon.material = this.createMaterial(`hightopCharmMat-${x}`, CYAN, CREAM);
      const collar = MeshBuilder.CreateTorus(`hightopCollar-${x}`, { diameter: 0.48, thickness: 0.08, tessellation: 18 }, this.scene);
      collar.parent = root;
      collar.position = new Vector3(0, 0.3, -0.22);
      collar.material = this.createMaterial(`hightopCollarMat-${x}`, CREAM, CYAN);
    } else if (kind === "loafer") {
      icon = MeshBuilder.CreateSphere(`loaferCharm-${x}`, { diameter: 0.72, segments: 20 }, this.scene);
      icon.scaling = new Vector3(1.18, 0.5, 0.28);
      icon.material = this.createMaterial(`loaferCharmMat-${x}`, MOSS, GOLD);
      const tassel = MeshBuilder.CreateSphere(`loaferTassel-${x}`, { diameter: 0.18, segments: 12 }, this.scene);
      tassel.parent = root;
      tassel.position = new Vector3(0.2, 0.1, -0.25);
      tassel.material = this.createMaterial(`loaferTasselMat-${x}`, GOLD, CREAM);
    } else if (kind === "cowboy") {
      icon = MeshBuilder.CreateBox(`cowboyCharm-${x}`, { width: 0.58, height: 0.78, depth: 0.18 }, this.scene);
      icon.rotation.z = -0.1;
      icon.material = this.createMaterial(`cowboyCharmMat-${x}`, new Color3(0.62, 0.24, 0.08), GOLD);
      const spur = MeshBuilder.CreateTorus(`cowboySpur-${x}`, { diameter: 0.33, thickness: 0.075, tessellation: 16 }, this.scene);
      spur.parent = root;
      spur.position = new Vector3(-0.37, -0.18, -0.22);
      spur.material = this.createMaterial(`cowboySpurMat-${x}`, GOLD, CREAM);
    } else if (kind === "sneaker") {
      icon = MeshBuilder.CreateSphere(`sneakerCharm-${x}`, { diameter: 0.72, segments: 20 }, this.scene);
      icon.scaling = new Vector3(1.18, 0.48, 0.3);
      icon.material = this.createMaterial(`sneakerCharmMat-${x}`, VIOLET, CYAN);
      const stripe = MeshBuilder.CreateBox(`sneakerStripe-${x}`, { width: 0.5, height: 0.08, depth: 0.07 }, this.scene);
      stripe.parent = root;
      stripe.position = new Vector3(0.08, 0.08, -0.25);
      stripe.rotation.z = -0.28;
      stripe.material = this.createMaterial(`sneakerStripeMat-${x}`, CREAM, CYAN);
    } else if (kind === "ultra") {
      icon = MeshBuilder.CreateTorus(`ultraMoveCore-${x}`, { diameter: 0.88, thickness: 0.16, tessellation: 28 }, this.scene);
      icon.material = this.createMaterial(`ultraMoveCoreMat-${x}`, VIOLET, GOLD);
      const core = MeshBuilder.CreateSphere(`ultraMoveStar-${x}`, { diameter: 0.36, segments: 16 }, this.scene);
      core.parent = root;
      core.position = new Vector3(0, 0, -0.28);
      core.material = this.createMaterial(`ultraMoveStarMat-${x}`, GOLD, CREAM);
    } else if (kind === "lash") {
      icon = MeshBuilder.CreateTorus(`laceLashPatch-${x}`, { diameter: 0.74, thickness: 0.105, tessellation: 24 }, this.scene);
      icon.scaling = new Vector3(1.05, 0.62, 1);
      icon.material = this.createMaterial(`laceLashPatchMat-${x}`, CREAM, RESCUE_CORAL);
    } else if (kind === "superJump") {
      icon = MeshBuilder.CreateTorus(`superJumpPatch-${x}`, { diameter: 0.78, thickness: 0.14, tessellation: 24 }, this.scene);
      icon.scaling = new Vector3(0.88, 1.14, 1);
      icon.material = this.createMaterial(`superJumpPatchMat-${x}`, GOLD, CYAN);
    } else if (kind === "bonus") {
      icon = MeshBuilder.CreateSphere(`bonusCapture-${x}`, { diameter: 0.56, segments: 20 }, this.scene);
      icon.scaling = new Vector3(1, 1.18, 0.32);
      icon.material = this.createMaterial(`bonusCaptureMat-${x}`, CYAN, GOLD);
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
    if (["arrowleft", "arrowright", "arrowup", " ", "a", "d", "w", "q", "e", "f", "u", "shift", "r", "escape"].includes(key)) {
      event.preventDefault();
    }
    if (this.superRun && key !== "escape") return;
    if (key === "arrowleft" || key === "a") this.held.left = true;
    if (key === "arrowright" || key === "d") this.held.right = true;
    if (key === "arrowup" || key === "w" || key === " ") this.tryJump();
    if (key === "shift") this.tryDash();
    if (key === "q") this.tryLaceLash();
    if (key === "e") this.tryGumStomp();
    if (key === "f") this.tryShoeFormAttack();
    if (key === "u") this.tryUltraMove();
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
    if (command === "formAttack") this.tryShoeFormAttack();
    if (command === "ultra") this.tryUltraMove();
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
    this.resetContraptions();
    this.message = "Right Shoe is back on the trail.";
    this.publishUi(true);
  }

  private startSuperRun() {
    this.mode = "playing";
    this.superRun = true;
    this.superRunStage = 1;
    this.superRunStageLabel = "SHOEBOX SPRINT";
    this.superRunMilestones.clear();
    this.superRunPauseTimer = 0.8;
    this.superRunAction = "STAGE 1/3 — SHOEBOX SPRINT. AI route locked; scanning the button trail.";
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
    this.player.superJump = false;
    this.player.superJumpTimer = 0;
    this.player.shoeForm = "starter";
    this.player.laceLash = false;
    this.player.gumStomp = false;
    this.player.lashCooldown = 0;
    this.player.stompCooldown = 0;
    this.player.lashTimer = 0;
    this.player.stompTimer = 0;
    this.player.formAttackTimer = 0;
    this.player.formAttackCooldown = 0;
    this.player.formShieldTimer = 0;
    this.player.ultraMove = false;
    this.player.ultraTimer = 0;
    this.player.ultraCooldown = 0;
    this.bossDefeated = false;
    this.reunionTimer = 0;
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
    this.resetContraptions();
    if (this.leftShoeHalo) this.leftShoeHalo.scaling = Vector3.One();
    this.publishUi(true);
  }

  private previewReunion() {
    this.superRun = false;
    this.reunionTimer = 6;
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
      const jumpPower = this.player.superJump ? 12.6 : 8.9;
      this.player.vy = jumpPower;
      this.player.superJumpTimer = this.player.superJump ? 0.46 : 0;
      this.player.grounded = false;
      this.player.jumpUsed = false;
      this.message = this.player.superJump ? "SUPER JUMP! Right Shoe launches toward the bonus lane." : this.message;
      this.spawnSparks(this.player.x - this.player.facing * 0.35, this.player.bottom + 0.18, this.player.superJump ? CYAN : CREAM, this.player.superJump ? 16 : 6, this.player.superJump ? 3.3 : 1.7);
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
    const styles: Record<ShoeForm, { glow: Color3; y: number; z: number }> = {
      starter: { glow: RESCUE_CORAL, y: 1, z: 1 },
      coralChrome: { glow: GOLD, y: 1, z: 1.04 },
      moonstep: { glow: CYAN, y: 1.07, z: 1 },
      pump: { glow: RESCUE_CORAL, y: 1.1, z: 0.94 },
      hightop: { glow: CYAN, y: 1.16, z: 1.04 },
      loafer: { glow: MOSS, y: 0.94, z: 1.12 },
      cowboy: { glow: new Color3(0.9, 0.38, 0.08), y: 1.14, z: 1.08 },
      sneaker: { glow: VIOLET, y: 1.02, z: 1.16 },
    };
    const style = styles[form];
    const asset = form === "coralChrome" ? gameAssets.rightShoeCoralChrome : form === "moonstep" ? gameAssets.rightShoeMoonstep : gameAssets.rightShoeRealistic;
    if (this.heroSpriteMaterial) {
      const texture = new Texture(asset, this.scene);
      texture.hasAlpha = true;
      this.heroSpriteMaterial.diffuseTexture = texture;
      this.heroSpriteMaterial.opacityTexture = texture;
      this.heroSpriteMaterial.useAlphaFromDiffuseTexture = true;
      this.heroSpriteMaterial.alpha = 1;
      this.heroSpriteMaterial.emissiveColor = style.glow.scale(form === "starter" ? 0.22 : 0.38);
      this.heroSpriteMaterial.specularColor = new Color3(1, 0.95, 0.83);
      this.heroSpriteMaterial.specularPower = form === "starter" ? 96 : 132;
    }
    if (this.heroHalo) {
      const material = this.heroHalo.material as StandardMaterial | null;
      if (material) {
        material.diffuseColor = style.glow;
        material.emissiveColor = style.glow.scale(0.52);
        material.alpha = form === "starter" ? 0.1 : 0.18;
      }
    }
    this.player.root.scaling.y = style.y;
    this.player.root.scaling.z = style.z;
  }

  private shoeFormAttackLabel(form = this.player.shoeForm) {
    const attacks: Partial<Record<ShoeForm, string>> = {
      pump: "HEEL STRIKE",
      hightop: "ANKLE GUARD",
      loafer: "SLIP SLIDE",
      cowboy: "SPUR KICK",
      sneaker: "SPRINT BURST",
    };
    return attacks[form] ?? "";
  }

  private tryShoeFormAttack() {
    const form = this.player.shoeForm;
    const attack = this.shoeFormAttackLabel(form);
    if (this.mode !== "playing" || !attack || this.player.formAttackCooldown > 0) return;

    this.player.formAttackCooldown = form === "hightop" ? 1.25 : 0.8;
    this.player.formAttackTimer = form === "hightop" ? 0.62 : 0.46;
    this.player.invulnerable = Math.max(this.player.invulnerable, form === "hightop" ? 1.45 : 0.42);

    const near = (range: number, forward = false) => this.enemies.filter((enemy) =>
      enemy.alive && Math.abs(enemy.bottom - this.player.bottom) < 2.55 && Math.abs(enemy.x - this.player.x) < range && (!forward || (enemy.x - this.player.x) * this.player.facing > -0.28),
    );
    let targets: Enemy[] = [];
    let color = RESCUE_CORAL;

    if (form === "pump") {
      targets = near(2.75).filter((enemy) => !enemy.bossTier);
      color = RESCUE_CORAL;
      if (this.player.grounded) this.player.vy = 4.9;
      this.spawnSparks(this.player.x, this.player.bottom + 0.28, color, 28, 4.4);
    }
    if (form === "hightop") {
      this.player.formShieldTimer = 1.45;
      targets = near(1.65).filter((enemy) => !enemy.bossTier);
      color = CYAN;
      this.spawnSparks(this.player.x, this.player.bottom + 0.78, color, 22, 3.1);
    }
    if (form === "loafer") {
      targets = near(3.45, true).filter((enemy) => !enemy.bossTier);
      color = MOSS;
      this.player.vx = this.player.facing * 16.5;
      this.spawnSparks(this.player.x - this.player.facing * 0.35, this.player.bottom + 0.48, color, 20, 3.8);
    }
    if (form === "cowboy") {
      targets = near(5.15, true).filter((enemy) => !enemy.bossTier);
      color = GOLD;
      this.player.vx = this.player.facing * 8.4;
      this.spawnSparks(this.player.x + this.player.facing * 1.55, this.player.bottom + 0.78, color, 24, 4.6);
    }
    if (form === "sneaker") {
      targets = near(4.9, true).filter((enemy) => enemy.bossTier !== "mini" && enemy.bossTier !== "boss");
      color = VIOLET;
      this.player.vx = this.player.facing * 21;
      this.spawnSparks(this.player.x - this.player.facing * 0.44, this.player.bottom + 0.62, color, 26, 4.8);
    }

    targets.forEach((enemy) => this.defeatEnemy(enemy));
    const suffix = targets.length > 0 ? `clears ${targets.length} shoe fiend${targets.length === 1 ? "" : "s"}.` : "charges the route ahead.";
    this.message = `${attack} — ${suffix}`;
    if (this.superRun) this.superRunAction = `${attack} — transformation attack demonstrated.`;
    this.publishUi(true);
  }

  private tryUltraMove() {
    if (this.mode !== "playing" || !this.player.ultraMove || this.player.ultraCooldown > 0) return;
    // The automated finale uses a wider, vertical-tolerant strike lane so a cinematic jump or recovery cannot leave the Boss unreachable.
    const strikeRange = this.superRun ? 8.8 : 5.6;
    const verticalRange = this.superRun ? 12 : 7.4;
    const boss = this.enemies.find((enemy) =>
      enemy.alive && enemy.bossTier === "boss" && Math.abs(enemy.x - this.player.x) < strikeRange && Math.abs(enemy.bottom - this.player.bottom) < verticalRange,
    );
    if (!boss) {
      this.message = "ULTRA MOVE is charged — bring The Tangled Titan into the stitched strike lane.";
      this.publishUi(true);
      return;
    }
    this.player.ultraCooldown = 1.5;
    this.player.ultraTimer = 1.08;
    this.player.invulnerable = Math.max(this.player.invulnerable, 1.15);
    this.player.vx = this.player.facing * 13.5;
    this.spawnLightningSuperSmash(boss.x, boss.bottom + 0.72);
    this.spawnSparks(this.player.x + this.player.facing * 1.35, this.player.bottom + 0.82, VIOLET, 46, 5.5);
    this.defeatEnemy(boss);
    this.bossDefeated = true;
    this.message = "LIGHTNING SUPER SMASH — Prismatic Sole Breaker unravels The Tangled Titan!";
    if (this.superRun) this.superRunAction = "LIGHTNING SUPER SMASH — the AI discharges the Boss-kill finisher and opens Left Shoe’s tower.";
    this.publishUi(true);
  }

  private spawnLightningSuperSmash(x: number, y: number) {
    // Three brief, jagged bolts create a readable lightning finisher without leaving persistent scene objects behind.
    [-0.46, 0, 0.46].forEach((offset, index) => {
      const bolt = MeshBuilder.CreateLines(`superSmashBolt-${this.titleTime}-${index}`, {
        points: [
          new Vector3(x + offset, y + 5.4, -0.78),
          new Vector3(x - 0.22 + offset, y + 3.45, -0.78),
          new Vector3(x + 0.24 + offset, y + 2.15, -0.78),
          new Vector3(x - 0.34 + offset, y + 0.2, -0.78),
        ],
      }, this.scene);
      bolt.color = index === 1 ? CREAM : CYAN;
      bolt.alpha = 0.96;
      bolt.isPickable = false;
      this.sparks.push({ mesh: bolt, velocity: new Vector3(0, -0.25, 0), life: 0.36, maxLife: 0.36 });
    });
    this.spawnSparks(x, y + 0.55, CYAN, 30, 5.7);
    this.spawnSparks(x, y + 0.42, GOLD, 20, 4.4);
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

    this.updateContraptions(delta);
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

  private updateContraptions(delta: number) {
    const buttonRun = this.contraptions.find((contraption) => contraption.kind === "buttonRun");
    const laceLever = this.contraptions.find((contraption) => contraption.kind === "laceLever");
    const gumPress = this.contraptions.find((contraption) => contraption.kind === "gumPress");
    const spoolLift = this.contraptions.find((contraption) => contraption.kind === "spoolLift");

    if (buttonRun && !buttonRun.activated && this.player.x > 9.3 && this.player.x < 14.5 && this.buttons >= 3) {
      this.activateContraption(buttonRun, "BUTTON BALL RUN — coral button released down the shoebox rail.");
      this.player.dashCharges += 1;
    }
    if (laceLever && !laceLever.activated && this.player.lashTimer > 0 && Math.abs(this.player.x - laceLever.x) < 3.1) {
      this.activateContraption(laceLever, "LACE LEVER — dominoes topple and stitch the bridge tight.");
    }
    if (gumPress && !gumPress.activated && this.player.stompTimer > 0 && Math.abs(this.player.x - gumPress.x) < 3.1) {
      this.activateContraption(gumPress, "GUM STOMP PRESS — the spring ramp pops toward the rescue tower.");
      this.player.vy = Math.max(this.player.vy, 7.4);
    }
    if (spoolLift && !spoolLift.activated && gumPress?.activated && this.player.x > 57.0) {
      this.activateContraption(spoolLift, "SPOOL LIFT — thread winch raises the final rescue latch.");
      if (this.leftShoeHalo) this.leftShoeHalo.scaling = new Vector3(1.22, 1.22, 1.22);
    }

    this.contraptions.forEach((contraption) => {
      if (!contraption.activated) return;
      contraption.progress = Math.min(1, contraption.progress + delta * 1.6);
      const eased = 1 - Math.pow(1 - contraption.progress, 3);
      if (contraption.kind === "buttonRun") {
        const ball = contraption.parts[1];
        ball.position.x = -1.18 + eased * 2.35;
        ball.rotation.z += delta * 11;
        contraption.parts[2].scaling.setAll(1 + Math.sin(this.titleTime * 12) * 0.12 * eased);
      }
      if (contraption.kind === "laceLever") {
        contraption.parts[1].rotation.z = 0.24 - eased * 0.82;
        contraption.parts.slice(3).forEach((domino, index) => {
          const local = Math.max(0, Math.min(1, (contraption.progress - index * 0.1) * 4.4));
          domino.rotation.z = -local * 1.28;
        });
      }
      if (contraption.kind === "gumPress") {
        contraption.parts[0].position.y = 0.24 - eased * 0.16;
        contraption.parts[1].scaling.y = 1 - eased * 0.36;
        contraption.parts[2].rotation.z = 0.34 - eased * 0.58;
      }
      if (contraption.kind === "spoolLift") {
        contraption.parts[0].rotation.x += delta * 7.5;
        contraption.parts[1].rotation.z += delta * 7.5;
        contraption.parts[3].position.y = 2.75 + eased * 0.42;
      }
    });
  }

  private activateContraption(contraption: Contraption, callout: string) {
    contraption.activated = true;
    contraption.progress = 0;
    this.message = callout;
    this.spawnSparks(contraption.x, contraption.root.position.y + 0.95, contraption.kind === "gumPress" ? MOSS : contraption.kind === "spoolLift" ? CYAN : GOLD, 19, 3.2);
    if (this.superRun) this.superRunAction = callout;
    this.publishUi(true);
  }

  private resetContraptions() {
    this.contraptions.forEach((contraption) => {
      contraption.activated = false;
      contraption.progress = 0;
      if (contraption.kind === "buttonRun") {
        contraption.parts[1].position.x = -1.18;
        contraption.parts[1].rotation.z = 0;
        contraption.parts[2].scaling = Vector3.One();
      }
      if (contraption.kind === "laceLever") {
        contraption.parts[1].rotation.z = 0.24;
        contraption.parts.slice(3).forEach((domino) => { domino.rotation.z = 0; });
      }
      if (contraption.kind === "gumPress") {
        contraption.parts[0].position.y = 0.24;
        contraption.parts[1].scaling.y = 1;
        contraption.parts[2].rotation.z = 0.34;
      }
      if (contraption.kind === "spoolLift") {
        contraption.parts[0].rotation.x = 0;
        contraption.parts[1].rotation.z = 0;
        contraption.parts[3].position.y = 2.75;
      }
    });
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
    this.superRunPauseTimer = Math.max(0, this.superRunPauseTimer - delta);
    this.held.left = false;
    this.held.right = this.player.x < 63.2 && this.superRunPauseTimer <= 0;

    // Spectator mode favors a graceful recovery over a failed run: restore the hero to the safe base lane if a transformation dash drops below the route.
    if (this.player.bottom < -6.6) {
      this.player.bottom = -4.2;
      this.player.vy = 0;
      this.player.vx = 6.4;
      this.player.grounded = true;
      this.player.invulnerable = Math.max(this.player.invulnerable, 1.25);
      this.superRunAction = "AI RECOVERY — returning Right Shoe to the stitched finale lane.";
    }

    const x = this.player.x;
    if (x >= 24.1) this.enterSuperRunStage(2, "LAUNDRY LABYRINTH", "Lace Bridge");
    if (x >= 44.4) this.enterSuperRunStage(3, "ROGUE TOWER BREAK", "Moonlit Shoeboxes");

    // STAGE 1 — collect every early patch, trigger the Button Ball Run, then use vertical mobility to reach the shoebox exit.
    if (x >= 5.4 && this.markSuperRunMilestone("stage-1-button-trail", "STAGE 1/3 — button trail vacuumed; the Button Ball Run is primed.")) {
      this.sweepSuperRunPickups(0, 6.9, "BUTTON TRAIL");
    }
    if (x >= 6.72 && this.markSuperRunMilestone("pump", "PUMP FORM — Heel Strike demolishes the starter pair.")) this.claimSuperRunPowerup("pump", "PUMP FORM — Heel Strike demolishes the starter pair.");
    if (x >= 8.2 && this.markSuperRunMilestone("feather-one", "WINGTIP FLIGHT — the AI lines up a double-jump.")) this.claimSuperRunPowerup("feather", "WINGTIP FLIGHT — double-jump unlocked.");
    if (!this.player.grounded && !this.player.jumpUsed && this.player.doubleJumps > 0 && x >= 8.7 && x <= 10.8 && this.markSuperRunMilestone("double-jump", "DOUBLE JUMP — Wingtip Feather clears the shoebox lip.")) this.tryJump();
    if (x >= 10.15 && this.markSuperRunMilestone("button-run", "BUTTON BALL RUN — the AI releases the coral button down its rail.")) this.activateSuperRunContraption("buttonRun", "BUTTON BALL RUN — coral button released down the shoebox rail.");
    if (x >= 11.72 && this.markSuperRunMilestone("super-jump", "SUPER JUMP PATCH — spring-loaded soles target the Sky Stitch cache.")) this.claimSuperRunPowerup("superJump", "SUPER JUMP PATCH — spring-loaded soles armed.");
    if (x >= 12.72 && this.markSuperRunMilestone("coral-chrome", "CORAL CHROME — the hero shine upgrades for the long run.")) this.claimSuperRunPowerup("chrome", "CORAL CHROME — hero shine upgraded.");
    if (x >= 14.8 && this.markSuperRunMilestone("bonus-cache", "SKY STITCH BONUS — an aerial cache awards an extra dash charge.")) this.claimSuperRunPowerup("bonus", "SKY STITCH BONUS — Super Jump snatches the aerial cache.");
    if (x >= 16.02 && this.markSuperRunMilestone("hightop", "HIGHTOP FORM — Ankle Guard counters the elevated pair.")) this.claimSuperRunPowerup("hightop", "HIGHTOP FORM — Ankle Guard counters the elevated pair.");
    if (x >= 18.82 && this.markSuperRunMilestone("dash-one", "LACE DASH — the AI bursts through the first long lane.")) this.claimSuperRunPowerup("dash", "LACE DASH — coral boost charged.");
    if (x >= 19.35 && this.player.dashCharges > 0 && this.player.dashCooldown <= 0 && this.markSuperRunMilestone("dash-demonstration", "LACE DASH — a high-speed route correction skips the laundry gap.")) this.tryDash();
    if (x >= 23.5 && this.markSuperRunMilestone("stage-1-complete", "STAGE 1 CLEAR — all shoebox foes and patches are reconciled before the bridge.")) {
      this.sweepSuperRunPickups(0, 24.3, "STAGE 1 PATCH SWEEP");
      this.clearSuperRunEnemies(0, 24.3, "STAGE 1 ROUTE SWEEP");
    }

    // STAGE 2 — switch forms twice, restore health, and deliberately operate the Lace Lever.
    if (x >= 26.1 && this.markSuperRunMilestone("loafer", "LOAFER FORM — Slip Slide sweeps the laundry ledge.")) this.claimSuperRunPowerup("loafer", "LOAFER FORM — Slip Slide sweeps the laundry ledge.");
    if (x >= 29.95 && this.markSuperRunMilestone("moonstep", "MOONSTEP RUNNER — the cobalt traversal form handles the lace bridge.")) this.claimSuperRunPowerup("moonstep", "MOONSTEP RUNNER — cobalt speed form unlocked.");
    if (x >= 31.0 && this.player.grounded && this.markSuperRunMilestone("moonstep-jump", "MOONSTEP LEAP — the AI keeps altitude above the lace bridge.")) this.tryJump();
    if (x >= 33.0 && this.markSuperRunMilestone("heart-one", "HEART SOLE — route integrity is restored before the bridge guard.")) this.claimSuperRunPowerup("heart", "HEART SOLE — route integrity restored.");
    if (x >= 35.2 && this.markSuperRunMilestone("stage-2-patch-sweep", "LAUNDRY LABYRINTH — the AI has recovered every bridge-side patch.")) this.sweepSuperRunPickups(24.3, 39.5, "STAGE 2 PATCH SWEEP");
    if (x >= 36.4 && this.player.dashCharges > 0 && this.player.dashCooldown <= 0 && this.markSuperRunMilestone("bridge-dash", "MOONSTEP + LACE DASH — the AI corrects across the bridge.")) this.tryDash();
    if (x >= 39.72 && this.markSuperRunMilestone("cowboy", "COWBOY BOOT FORM — Spur Kick reaches across the bridge sentries.")) this.claimSuperRunPowerup("cowboy", "COWBOY BOOT FORM — Spur Kick clears the bridge sentries.");
    if (x >= 41.72 && this.markSuperRunMilestone("lace-lash", "LACE LASH — the AI snaps the Lace Lever and topples its stitch dominoes.")) {
      this.claimSuperRunPowerup("lash", "LACE LASH — thread-whip armed.");
      this.player.lashCooldown = 0;
      this.tryLaceLash();
      this.activateSuperRunContraption("laceLever", "LACE LEVER — AI lash topples the dominoes and stitches the bridge tight.");
    }
    if (x >= 43.7 && this.markSuperRunMilestone("stage-2-complete", "STAGE 2 CLEAR — the bridge guard and every laundry-lane foe are resolved.")) {
      this.sweepSuperRunPickups(24.3, 44.6, "STAGE 2 PATCH SWEEP");
      this.clearSuperRunEnemies(24.3, 44.6, "STAGE 2 ROUTE SWEEP");
    }

    // STAGE 3 — a final recovery, Gum Press setup, mini-boss, lightning Super Smash, Boss kill, and tower reunion.
    if (x >= 46.65 && this.markSuperRunMilestone("sneaker", "SNEAKER FORM — Sprint Burst chains through the Tower Break vanguard.")) this.claimSuperRunPowerup("sneaker", "SNEAKER FORM — Sprint Burst chains through the Tower Break vanguard.");
    if (x >= 47.1 && this.markSuperRunMilestone("moon", "MOON INSOLE — the AI slows the tower vanguard for a clean final setup.")) this.claimSuperRunPowerup("moon", "MOON INSOLE — enemies slowed for the finale.");
    if (x >= 50.2 && this.markSuperRunMilestone("stage-3-patch-sweep", "TOWER BREAK — every remaining route patch is indexed before the final gate.")) this.sweepSuperRunPickups(44.6, 53.3, "STAGE 3 PATCH SWEEP");
    if (x >= 52.75 && this.markSuperRunMilestone("feather-two", "FINAL WINGTIP — a second double-jump token secures the high recovery line.")) this.claimSuperRunPowerup("feather", "FINAL WINGTIP — high lane secured.");
    if (x >= 53.08 && this.markSuperRunMilestone("tower-risk-check", "RISK CHECK — the AI absorbs a controlled tower graze, preserving one heart for the recovery test.")) {
      this.player.hearts = Math.max(1, this.player.hearts - 1);
      this.player.invulnerable = Math.max(this.player.invulnerable, 0.6);
      this.spawnSparks(this.player.x, this.player.bottom + 0.65, RESCUE_CORAL, 12, 2.6);
    }
    if (x >= 53.35 && this.markSuperRunMilestone("tower-heart", "HEALTH POWER-UP — the AI takes the Heart Sole before committing to the mini-boss.")) this.claimSuperRunPowerup("heart", "HEALTH POWER-UP — Heart Sole restores the Tower Break safety margin.");
    if (x >= 54.72 && this.markSuperRunMilestone("gum-stomp", "GUM STOMP — the AI arms the sticky impact that powers the tower ramp.")) {
      this.claimSuperRunPowerup("gum", "GUM STOMP — sticky sole impact armed.");
      this.player.stompCooldown = 0;
      this.tryGumStomp();
      this.activateSuperRunContraption("gumPress", "GUM PRESS — AI Gum Stomp compresses the ramp for the tower approach.");
    }
    if (x >= 55.95 && this.markSuperRunMilestone("tower-mini-boss", "MINI-BOSS — Gum Marshal enters; the AI performs a measured Gum Stomp break.")) {
      this.player.stompCooldown = 0;
      this.tryGumStomp();
      this.clearSuperRunEnemies(54.8, 57.9, "GUM MARSHAL MINI-BOSS BREAK");
    }
    if (x >= 57.2 && this.markSuperRunMilestone("spool-lift", "SPOOL LIFT — the AI winds the final rescue latch while the tower lane clears.")) this.activateSuperRunContraption("spoolLift", "SPOOL LIFT — thread winch raises the final rescue latch.");
    if (x >= 58.05 && this.markSuperRunMilestone("dash-two", "FINAL LACE DASH — the AI enters the Boss finishing lane.")) this.claimSuperRunPowerup("dash", "FINAL LACE DASH — boost charged for the finish.");
    if (x >= 58.22 && this.markSuperRunMilestone("ultra", "SUPER SMASH CORE — lightning finisher locks onto The Tangled Titan.")) this.claimSuperRunPowerup("ultra", "SUPER SMASH CORE — lightning finisher locks onto The Tangled Titan.");
    if (x >= 58.32 && this.markSuperRunMilestone("final-coverage", "FINAL ROUTE AUDIT — every remaining patch and non-Boss enemy is resolved before the lightning finisher.")) {
      this.sweepSuperRunPickups(53.3, WORLD_END + 1, "FINAL PATCH SWEEP");
      this.clearSuperRunEnemies(44.6, 58.3, "TOWER VANGUARD SWEEP");
    }

    const platformAhead = this.platforms.some(
      (platform) =>
        platform.x - platform.width / 2 > this.player.x &&
        platform.x - platform.width / 2 - this.player.x < 2.35 &&
        platform.top > this.player.bottom + 0.18,
    );
    const showcaseBeat = [7.15, 13.3, 16.35, 21.1, 26.6, 35.1, 40.1, 42.0, 47.0, 51.1, 58.0].some((beat) => Math.abs(this.player.x - beat) < 0.16);
    if (this.player.grounded && (platformAhead || showcaseBeat) && this.superRunPauseTimer <= 0) this.tryJump();

    const bossInUltraRange = this.enemies.find(
      (enemy) => enemy.alive && enemy.bossTier === "boss" && Math.abs(enemy.x - this.player.x) < 8.8,
    );
    if (bossInUltraRange && this.player.ultraMove && this.player.ultraCooldown <= 0) this.tryUltraMove();

    const target = this.enemies.find(
      (enemy) => enemy.alive && enemy.x - this.player.x < 1.38 && enemy.x >= this.player.x - 0.8,
    );
    if (target) {
      if (target.bossTier === "boss" && this.player.ultraMove && this.player.ultraCooldown <= 0) {
        this.tryUltraMove();
      } else if (target.bossTier === "boss") {
        this.superRunAction = "BOSS GATE — the AI is lining up the lightning Super Smash core.";
      } else if (target.bossTier === "mini" && target.bossName === "Gum Marshal" && this.player.gumStomp && this.player.stompCooldown <= 0) {
        this.tryGumStomp();
        this.superRunAction = "FINAL MINI-BOSS: Gum Marshal — Gum Stomp breaks the tower guard.";
      } else if (target.bossTier === "mini" && this.player.laceLash && this.player.lashCooldown <= 0) {
        this.tryLaceLash();
        this.superRunAction = "MINI-BOSS: Lace Captain — Lace Lash breaks the skate guard.";
      } else if (this.player.gumStomp && this.player.x > 54 && this.player.stompCooldown <= 0) {
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
    if (this.bossDefeated && this.player.x >= 58.6 && this.mode === "playing") {
      this.player.x = Math.max(this.player.x, 60.8);
      this.player.bottom = Math.max(this.player.bottom, -4.2);
      this.player.vx = Math.max(this.player.vx, 6.4);
      this.superRunAction = "RESCUE PROTOCOL — Boss down; completing the final stitch into the dance finale.";
    }
  }

  private enterSuperRunStage(stage: number, label: string, checkpoint: string) {
    if (this.superRunStage >= stage) return;
    this.superRunStage = stage;
    this.superRunStageLabel = label;
    this.activeCheckpoint = checkpoint;
    this.markSuperRunMilestone("stage-" + stage + "-entry", "STAGE " + stage + "/3 — " + label + ". The AI reassesses every device and foe in the new zone.", 0.78);
  }

  private markSuperRunMilestone(key: string, action: string, pause = 0.34) {
    if (this.superRunMilestones.has(key)) return false;
    this.superRunMilestones.add(key);
    this.superRunAction = action;
    this.message = "AI SUPER RUN: " + action;
    this.superRunPauseTimer = Math.max(this.superRunPauseTimer, pause);
    this.publishUi(true);
    return true;
  }

  private activateSuperRunContraption(kind: ContraptionKind, callout: string) {
    const contraption = this.contraptions.find((candidate) => candidate.kind === kind);
    if (contraption && !contraption.activated) this.activateContraption(contraption, callout);
  }

  private sweepSuperRunPickups(minX: number, maxX: number, label: string) {
    const pending = this.pickups.filter((pickup) => !pickup.collected && pickup.x >= minX && pickup.x < maxX);
    pending.forEach((pickup) => this.collectPickup(pickup));
    if (pending.length > 0) {
      this.superRunAction = label + " — AI reconciled " + pending.length + " overlooked route patch" + (pending.length === 1 ? "" : "es") + ".";
      this.message = "AI SUPER RUN: " + this.superRunAction;
    }
  }

  private clearSuperRunEnemies(minX: number, maxX: number, label: string) {
    const stragglers = this.enemies.filter((enemy) => enemy.alive && enemy.bossTier !== "boss" && enemy.x >= minX && enemy.x < maxX);
    stragglers.forEach((enemy) => this.defeatEnemy(enemy));
    if (stragglers.length > 0) {
      this.superRunAction = label + " — AI closes " + stragglers.length + " remaining enemy record" + (stragglers.length === 1 ? "" : "s") + ".";
      this.message = "AI SUPER RUN: " + this.superRunAction;
    }
  }

  private claimSuperRunPowerup(kind: PickupKind, callout: string) {
    const pickup = this.pickups
      .filter((candidate) => candidate.kind === kind && !candidate.collected)
      .sort((left, right) => Math.abs(left.x - this.player.x) - Math.abs(right.x - this.player.x))[0];
    if (!pickup) return;
    this.collectPickup(pickup);
    const formPickup = kind === "pump" || kind === "hightop" || kind === "loafer" || kind === "cowboy" || kind === "sneaker";
    this.superRunAction = formPickup ? `${callout} Attack fires on pickup.` : callout;
    this.message = `AI SUPER RUN: ${this.superRunAction}`;
  }

  private performSuperKick(enemy: Enemy) {
    if (!enemy.alive || enemy.bossTier === "boss") return;
    const move = enemy.bossTier === "mini" ? "MINI-BOSS HEEL BREAK" : enemy.kind === "skate" ? "TURBO HEEL KICK" : enemy.kind === "slime" ? "CRESCENT SOLE KICK" : "SOLE-FLIP KICK";
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
    this.player.formAttackTimer = Math.max(0, this.player.formAttackTimer - delta);
    this.player.formAttackCooldown = Math.max(0, this.player.formAttackCooldown - delta);
    this.player.formShieldTimer = Math.max(0, this.player.formShieldTimer - delta);
    this.player.ultraTimer = Math.max(0, this.player.ultraTimer - delta);
    this.player.ultraCooldown = Math.max(0, this.player.ultraCooldown - delta);
    this.player.superJumpTimer = Math.max(0, this.player.superJumpTimer - delta);
    this.player.moonTimer = Math.max(0, this.player.moonTimer - delta);

    const direction = (this.held.right ? 1 : 0) - (this.held.left ? 1 : 0);
    const formDashSpeed = this.player.shoeForm === "sneaker" ? 21 : this.player.shoeForm === "loafer" ? 16.5 : 0;
    const targetSpeed = this.player.dashTimer > 0 ? this.player.facing * 19 : this.player.formAttackTimer > 0 && formDashSpeed > 0 ? this.player.facing * formDashSpeed : direction * 6.4;
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
    if (this.player.ultraTimer > 0) this.player.root.rotation.z = -this.player.facing * 0.76;
    if (this.player.formAttackTimer > 0) this.player.root.rotation.z = this.player.shoeForm === "pump" ? this.player.facing * 0.38 : -this.player.facing * 0.48;
    if (this.player.lashTimer > 0) this.player.root.rotation.z = -this.player.facing * 0.4;
    if (this.player.stompTimer > 0) this.player.root.rotation.z = this.player.facing * 0.16;
    if (this.player.superJumpTimer > 0) this.player.root.rotation.z = -this.player.facing * 0.2;
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
    if (this.player.formAttackTimer > 0 && this.player.shoeForm !== "hightop") {
      const formColor = this.player.shoeForm === "loafer" ? MOSS : this.player.shoeForm === "cowboy" ? GOLD : this.player.shoeForm === "sneaker" ? VIOLET : RESCUE_CORAL;
      this.spawnSparks(this.player.x - this.player.facing * 0.34, this.player.bottom + 0.56, formColor, 1, 1.55);
    }
    if (this.player.ultraTimer > 0) {
      this.spawnSparks(this.player.x - this.player.facing * 0.36, this.player.bottom + 0.82, VIOLET, 2, 2.2);
    }
    if (this.player.superJumpTimer > 0) {
      this.spawnSparks(this.player.x - this.player.facing * 0.35, this.player.bottom + 0.3, CYAN, 1, 1.7);
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
      if (stomp && enemy.bossTier !== "boss") {
        this.defeatEnemy(enemy);
      } else if (sideHit && this.player.dashTimer <= 0 && this.player.formShieldTimer <= 0 && this.player.ultraTimer <= 0) {
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

  private updateDecor(delta: number) {
    if (this.mode === "won" && this.reunionTimer > 0) {
      const before = Math.ceil(this.reunionTimer);
      this.reunionTimer = Math.max(0, this.reunionTimer - delta);
      if (before !== Math.ceil(this.reunionTimer)) this.publishUi(false);
    }
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
    if (enemy.bossTier === "boss") this.bossDefeated = true;
    this.buttons += enemy.bossTier === "boss" ? 20 : enemy.bossTier === "mini" ? 8 : 4;
    this.message = enemy.bossTier === "boss"
      ? "BOSS DOWN: The Tangled Titan’s knot unravels from the rescue tower."
      : enemy.bossTier === "mini"
        ? `MINI-BOSS DOWN: ${enemy.bossName} clears the power route.`
        : "Sole stomp! A rescue spark lights the way.";
    const burst = enemy.bossTier === "boss" ? VIOLET : enemy.bossTier === "mini" ? RESCUE_CORAL : GOLD;
    this.spawnSparks(enemy.x, enemy.bottom + 0.6, burst, enemy.bossTier === "boss" ? 46 : enemy.bossTier === "mini" ? 28 : 16, enemy.bossTier === "boss" ? 5.4 : enemy.bossTier === "mini" ? 4.2 : 3.1);
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
    if (pickup.kind === "superJump") {
      this.player.superJump = true;
      this.message = "Super Jump Patch: hold the route, then launch into the sky-stitch bonus.";
      this.spawnSparks(pickup.x, pickup.y, CYAN, 24, 3.4);
    }
    if (pickup.kind === "bonus") {
      this.buttons += 12;
      this.player.dashCharges += 1;
      this.message = "Sky Stitch bonus captured! Lace Dash receives a bonus charge.";
      this.spawnSparks(pickup.x, pickup.y, GOLD, 28, 3.8);
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
    if (pickup.kind === "pump") {
      this.applyShoeForm("pump");
      this.message = "Pump transformation: Heel Strike primes on contact.";
      this.spawnSparks(pickup.x, pickup.y, RESCUE_CORAL, 28, 3.8);
      this.tryShoeFormAttack();
    }
    if (pickup.kind === "hightop") {
      this.applyShoeForm("hightop");
      this.message = "Hightop transformation: Ankle Guard throws up a counter shield.";
      this.spawnSparks(pickup.x, pickup.y, CYAN, 26, 3.7);
      this.tryShoeFormAttack();
    }
    if (pickup.kind === "loafer") {
      this.applyShoeForm("loafer");
      this.message = "Loafer transformation: Slip Slide launches through the lane.";
      this.spawnSparks(pickup.x, pickup.y, MOSS, 26, 3.9);
      this.tryShoeFormAttack();
    }
    if (pickup.kind === "cowboy") {
      this.applyShoeForm("cowboy");
      this.message = "Cowboy Boot transformation: Spur Kick reaches across the shoebox gap.";
      this.spawnSparks(pickup.x, pickup.y, GOLD, 28, 4.1);
      this.tryShoeFormAttack();
    }
    if (pickup.kind === "sneaker") {
      this.applyShoeForm("sneaker");
      this.message = "Sneaker transformation: Sprint Burst chains through the final minor foes.";
      this.spawnSparks(pickup.x, pickup.y, VIOLET, 28, 4.3);
      this.tryShoeFormAttack();
    }
    if (pickup.kind === "ultra") {
      this.player.ultraMove = true;
      this.message = "ULTRA MOVE charged: press U or tap ULTRA when The Tangled Titan closes in.";
      this.spawnSparks(pickup.x, pickup.y, VIOLET, 34, 4.8);
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
    const bossAlive = this.enemies.some((enemy) => enemy.alive && enemy.bossTier === "boss");
    if (bossAlive && !this.bossDefeated) {
      this.message = this.player.ultraMove
        ? "The Tangled Titan blocks Left Shoe’s tower — fire ULTRA MOVE!"
        : "The Tangled Titan blocks Left Shoe’s tower. Find the Ultra Move core!";
      if (this.superRun) this.superRunAction = "BOSS GATE — scanning for the Ultra Move finishing lane.";
      this.publishUi(true);
      return;
    }
    this.mode = "won";
    this.reunionTimer = 6;
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
    const contraptionsActivated = this.contraptions.filter((contraption) => contraption.activated).length;
    const nextContraption = this.contraptions.find((contraption) => !contraption.activated);
    const contraptionNames: Record<ContraptionKind, string> = {
      buttonRun: "BUTTON BALL RUN",
      laceLever: "LACE LEVER",
      gumPress: "GUM PRESS",
      spoolLift: "SPOOL LIFT",
    };
    const contraptionStatus = nextContraption
      ? `NEXT · ${contraptionNames[nextContraption.kind]}`
      : "ALL LINKS LIVE · RESCUE LATCH OPEN";
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
      superRunStage: this.superRunStage,
      superRunStageLabel: this.superRunStageLabel,
      superRunCoverage: `${this.pickups.filter((pickup) => pickup.collected).length}/${this.pickups.length} power-ups · ${this.enemies.filter((enemy) => !enemy.alive).length}/${this.enemies.length} enemies`,
      shoeForm: this.player.shoeForm,
      laceLash: this.player.laceLash,
      gumStomp: this.player.gumStomp,
      superJump: this.player.superJump,
      shoeFormAttack: this.shoeFormAttackLabel(),
      formAttackReady: Boolean(this.shoeFormAttackLabel()) && this.player.formAttackCooldown <= 0,
      ultraMove: this.player.ultraMove,
      bossName: this.bossDefeated ? "TOWER OPEN" : "THE TANGLED TITAN",
      bossDefeated: this.bossDefeated,
      reunionSeconds: Math.ceil(this.reunionTimer),
      contraptionsActivated,
      contraptionStatus,
    };
    const signature = JSON.stringify(snapshot);
    if (!force && signature === this.lastUiSignature) return;
    this.lastUiSignature = signature;
    window.dispatchEvent(new CustomEvent<UiSnapshot>("shoe-adventure:update", { detail: snapshot }));
  }
}
