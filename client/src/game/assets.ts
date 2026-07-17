// The Lost Pair visual reminder: use tactile navy/teal atmosphere with Rescue Coral #FF5A4F as the emotional hero accent.
// Generated assets remain external Manus storage URLs so large media never enters the project bundle.

export const gameAssets = {
  visualTarget: "/manus-storage/shoe-adventure-visual-target_93950542.png",
  bedroomBackdrop: "/manus-storage/shoe-adventure-bedroom-backdrop_a7dae85d.png",
  rightShoeHero: "/manus-storage/right-shoe-hero_366b91a3.png",
  powerupTray: "/manus-storage/shoe-adventure-powerups_622ad4f9.png",
  logo: "/manus-storage/shoe-adventure-logo_cc0bdbb2.png",
  rightShoeRealistic: "/manus-storage/right-shoe-realistic_a31b4b73.png",
  // A mirrored matching pair preserves the rescue read while the reserved Left Shoe render is unavailable.
  leftShoeRealistic: "/manus-storage/right-shoe-realistic_a31b4b73.png",
  rollerSkateRealistic: "/manus-storage/roller-skate-realistic_8767122a.png",
} as const;

export type GameAssetKey = keyof typeof gameAssets;
