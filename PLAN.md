# Game Plan: Shoe Adventure — The Lost Pair

## Risk Tasks

### 1. Full-screen Babylon side-scroller lifecycle and deterministic demo

- **Why isolated:** The game needs to remain responsive inside a React host while accepting keyboard, touch, and restart input. React development mode can mount twice, and a visual verification capture needs the game to reach meaningful action without manual play.
- **Approach:** Use a lifecycle-safe `GameCanvas` component that creates exactly one Babylon engine, disposes input and rendering resources on unmount, and delegates gameplay to framework-independent TypeScript. Implement a `?demo` mode that starts the quest automatically and drives the hero through a deterministic obstacle-and-pickup sequence.
- **Verify:** The start overlay transitions into active play on keyboard/touch/button input; `?demo` reaches visible movement, pickup, enemy avoidance, and the rescue target without a stuck or blank canvas; resize does not distort the stage; restart returns the hero to the first checkpoint without duplicate audio or input behavior.

### 2. Platform collision, stomp combat, and camera follow

- **Why isolated:** The core fantasy is a fast platform rescue, and collisions that feel wrong would make every power-up and enemy interaction unreliable.
- **Approach:** Use a compact, deterministic 2D physics layer inside the Babylon scene: axis-aligned platform bounds, grounded/jump states, gravity, horizontal movement, downward-only stomp checks, side-hit damage, and a clamped orthographic camera that leads the moving Right Shoe without losing the final Left Shoe beacon.
- **Verify:** Left/right input changes hero direction correctly; jump transitions ground → rising → falling → landing without clipping; the hero lands on shoeboxes and lace bridges; stomping an enemy defeats it while a side hit removes one heart; camera follows smoothly and never shows empty scene edges.

## Main Build

Build a full-screen, browser-playable 2.5D rescue platformer in which the **Right Shoe** crosses a giant twilight bedroom to free the **Left Shoe** from the rogue roller skate’s shoebox tower. The level will visibly include shoebox platforms, a lace bridge, laundry ramp, three enemy families, a rescue beacon, checkpoints, hearts, collectible buttons, and a clear finish dome.

The hero moves with keyboard arrows/A-D and jumps with Space/W/Up; mobile-friendly on-screen controls are included. The game begins on an illustrated title overlay and then exposes a stitched HUD: rescue mission at top-left, power-up inventory at top-right, health and coins at lower-left, and pause/restart assistance at lower-right.

The complete power-up suite contains **Wingtip Feather** (double jump), **Lace Dash** (short invulnerable forward dash), **Heart Sole** (restore one heart), and **Moon Insole** (brief enemy-slow effect). The enemies are an untied-lace goblin, sneaker-stain slime, and hovering rogue roller skate. Defeating enemies with a stomp adds a rescue-spark reward; touching collectibles increments the route score; passing checkpoints updates the mission narrative.

- **Assets needed:** generated visual target, bedroom backdrop, hero cutout, power-up artwork, and stitched-heart logo; Babylon procedural meshes for terrain, characters, pickups, effects, and HUD backing.
- **Verify:**
  - Keyboard, touch, and visible start/restart controls respond immediately and are readable at desktop and mobile widths.
  - The Right Shoe is visibly red/coral, jumps across shoe-themed terrain, and is distinct from the Left Shoe rescue target.
  - The scene visibly contains shoebox platforms, a lace bridge, button coins, three enemy types, and all four named power-up states.
  - Player movement direction, hero facing, gravity, collision, jump, landing, stomp, damage, and restart all behave predictably.
  - Collectibles increment a clear counter; power-ups produce visible changes; the rescue state transitions from quest to reunion after reaching the Left Shoe.
  - UI text remains contrasted, no elements overflow at representative desktop or mobile widths, and there are no missing textures or obvious placeholder states.
  - No browser console errors occur during the captured run.
  - Visual consistency matches the generated target: toy-scale bedroom setting, deep navy/teal atmosphere, Rescue Coral hero accent, tactile cardboard/thread/leather material impression, side-on camera, and uncluttered action corridor.
