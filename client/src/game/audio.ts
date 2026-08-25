// The Lost Pair visual reminder: sound should feel tactile and toy-scale, matching the
// deep navy/teal world and Rescue Coral #FF5A4F heroics, never harsh or arcade-generic.
//
// AudioDirector plays every game sound cue and the background music bed. Each cue can be
// backed by a real recorded file (an mp3 dropped in client/public/audio/) or, when no file
// is present yet, a procedurally synthesized stand-in built from oscillators and filtered
// noise. This means the game never needs to ship with silence: real files can be added one
// at a time, in any order, and each one simply takes over from its synthesized placeholder
// the moment it is present. See SOUND_LIST.md for the exact file names and descriptions.

type CueName =
  | "jump"
  | "land"
  | "collectCommon"
  | "collectHeart"
  | "collectPowerup"
  | "collectBig"
  | "hit"
  | "stomp"
  | "stompBoss"
  | "checkpoint"
  | "victory"
  | "defeat";

type MusicLayer = "calm" | "intense";

/** Maps each cue to the file Scott can drop in client/public/audio/ to replace the
 * procedural placeholder. Keep this in sync with SOUND_LIST.md. */
const CUE_FILES: Record<CueName, string> = {
  jump: "/audio/jump.mp3",
  land: "/audio/land.mp3",
  collectCommon: "/audio/collect-common.mp3",
  collectHeart: "/audio/collect-heart.mp3",
  collectPowerup: "/audio/collect-powerup.mp3",
  collectBig: "/audio/collect-big.mp3",
  hit: "/audio/hit.mp3",
  stomp: "/audio/stomp.mp3",
  stompBoss: "/audio/stomp-boss.mp3",
  checkpoint: "/audio/checkpoint.mp3",
  victory: "/audio/victory.mp3",
  defeat: "/audio/defeat.mp3",
};

const MUSIC_FILES: Record<MusicLayer, string> = {
  calm: "/audio/music-calm.mp3",
  intense: "/audio/music-intense.mp3",
};

const PICKUP_HEART_KINDS = new Set(["heart"]);
const PICKUP_COMMON_KINDS = new Set(["button", "feather", "dash", "bonus"]);
/** Shoe-form transformations and major ability unlocks -- the ones players said were
 * easy to miss. These get the boomier collectBig cue and (see GameWorld.ts's
 * collectPickup/showPickupSplash) a full-screen splash banner, not just a chime. */
const PICKUP_BIG_KINDS = new Set(["moon", "superJump", "chrome", "moonstep", "pump", "hightop", "loafer", "cowboy", "sneaker", "ultra", "lash", "gum", "heartPlus", "extraLife"]);

/** Classifies a pickup kind string into which collect cue should play. Kept loose (string
 * rather than importing PickupKind) so this module has no dependency on GameWorld.ts. */
export function classifyCollectCue(kind: string): "collectCommon" | "collectHeart" | "collectPowerup" | "collectBig" {
  if (PICKUP_HEART_KINDS.has(kind)) return "collectHeart";
  if (PICKUP_COMMON_KINDS.has(kind)) return "collectCommon";
  if (PICKUP_BIG_KINDS.has(kind)) return "collectBig";
  return "collectPowerup";
}

interface LoadedBuffer {
  buffer: AudioBuffer | null;
  loading: boolean;
}

export class AudioDirector {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private muted = false;
  private initialized = false;

  private buffers = new Map<string, LoadedBuffer>();

  private musicNodes: { stop: () => void } | null = null;
  private musicIntensity = 0;
  private targetIntensity = 0;
  private calmGain: GainNode | null = null;
  private intenseGain: GainNode | null = null;

  /** Must be called from a real user gesture (the title screen's start button already
   * satisfies this). Safe to call more than once. */
  init(): void {
    if (this.initialized) {
      void this.ctx?.resume();
      return;
    }
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return; // No Web Audio support: the game still runs, just silently.
    this.ctx = new Ctor();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0 : 1;
    this.masterGain.connect(this.ctx.destination);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.9;
    this.sfxGain.connect(this.masterGain);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.5;
    this.musicGain.connect(this.masterGain);

    this.initialized = true;
    this.preloadAll();
  }

  private preloadAll(): void {
    for (const url of Object.values(CUE_FILES)) this.loadBuffer(url);
    for (const url of Object.values(MUSIC_FILES)) this.loadBuffer(url);
  }

  /** Fetches and decodes a real audio file if present. Fails silently (leaving the cue on
   * its procedural placeholder) when the file has not been dropped in yet -- a missing
   * mp3 is an expected, ordinary state during this pass, not an error worth surfacing. */
  private async loadBuffer(url: string): Promise<AudioBuffer | null> {
    if (!this.ctx) return null;
    const existing = this.buffers.get(url);
    if (existing) return existing.buffer;
    this.buffers.set(url, { buffer: null, loading: true });
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`no file at ${url}`);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
      this.buffers.set(url, { buffer: audioBuffer, loading: false });
      return audioBuffer;
    } catch {
      this.buffers.set(url, { buffer: null, loading: false });
      return null;
    }
  }

  private playBuffer(url: string, gainNode: GainNode, volume: number, loop = false): { stop: () => void } | null {
    if (!this.ctx) return null;
    const entry = this.buffers.get(url);
    if (!entry?.buffer) return null;
    const source = this.ctx.createBufferSource();
    source.buffer = entry.buffer;
    source.loop = loop;
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(gainNode);
    source.start();
    return { stop: () => source.stop() };
  }

  // ---- procedural primitives -------------------------------------------------------

  private playTone(freq: number, duration: number, type: OscillatorType, peakGain: number, delay = 0): void {
    if (!this.ctx || !this.sfxGain) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(peakGain, t0 + Math.min(0.02, duration / 4));
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  private playSlide(fromFreq: number, toFreq: number, duration: number, type: OscillatorType, peakGain: number): void {
    if (!this.ctx || !this.sfxGain) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(fromFreq, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(toFreq, 1), t0 + duration);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(peakGain, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  private playNoiseBurst(duration: number, filterFreq: number, peakGain: number): void {
    if (!this.ctx || !this.sfxGain) return;
    const t0 = this.ctx.currentTime;
    const sampleCount = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, sampleCount, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) data[i] = Math.random() * 2 - 1;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = filterFreq;
    filter.Q.value = 0.9;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(peakGain, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    source.start(t0);
    source.stop(t0 + duration + 0.02);
  }

  // ---- cue dispatch: real file if present, otherwise procedural placeholder --------

  private playCue(name: CueName, fallback: () => void): void {
    if (!this.ctx || !this.sfxGain || this.muted) return;
    const url = CUE_FILES[name];
    const entry = this.buffers.get(url);
    if (entry?.buffer) {
      this.playBuffer(url, this.sfxGain, 1);
      return;
    }
    if (entry === undefined) void this.loadBuffer(url); // first time this cue is needed
    fallback();
  }

  playJump(): void {
    this.playCue("jump", () => this.playSlide(340, 620, 0.18, "square", 0.22));
  }

  playLand(): void {
    this.playCue("land", () => this.playNoiseBurst(0.09, 220, 0.25));
  }

  playCollect(kind: string): void {
    const cue = classifyCollectCue(kind);
    if (cue === "collectHeart") {
      this.playCue("collectHeart", () => {
        this.playTone(660, 0.12, "sine", 0.22);
        this.playTone(880, 0.18, "sine", 0.2, 0.08);
      });
    } else if (cue === "collectBig") {
      // A deliberately bigger, "boom" cue for form transformations and major ability
      // unlocks -- a noise thump under a rising three-tone stack, distinct enough from
      // collectPowerup's plain chime that a big pickup reads as a real event.
      this.playCue("collectBig", () => {
        this.playNoiseBurst(0.16, 260, 0.26);
        this.playTone(220, 0.14, "sawtooth", 0.22, 0);
        this.playTone(440, 0.16, "triangle", 0.22, 0.05);
        this.playTone(660, 0.2, "triangle", 0.22, 0.12);
        this.playTone(880, 0.26, "sine", 0.2, 0.2);
      });
    } else if (cue === "collectPowerup") {
      this.playCue("collectPowerup", () => {
        this.playTone(520, 0.1, "triangle", 0.2);
        this.playTone(780, 0.12, "triangle", 0.2, 0.06);
        this.playTone(1040, 0.16, "triangle", 0.18, 0.12);
      });
    } else {
      this.playCue("collectCommon", () => this.playTone(900, 0.1, "sine", 0.18));
    }
  }

  playHit(): void {
    this.playCue("hit", () => this.playNoiseBurst(0.15, 160, 0.3));
  }

  playStomp(bossTier?: "mini" | "boss"): void {
    if (bossTier) {
      this.playCue("stompBoss", () => {
        this.playNoiseBurst(0.22, 140, 0.3);
        this.playTone(180, 0.3, "sawtooth", 0.22, 0.03);
      });
    } else {
      this.playCue("stomp", () => this.playNoiseBurst(0.14, 200, 0.26));
    }
  }

  playCheckpoint(): void {
    this.playCue("checkpoint", () => {
      this.playTone(500, 0.1, "sine", 0.18);
      this.playTone(750, 0.14, "sine", 0.18, 0.1);
    });
  }

  playVictory(): void {
    this.playCue("victory", () => {
      this.playTone(523, 0.16, "triangle", 0.22, 0);
      this.playTone(659, 0.16, "triangle", 0.22, 0.14);
      this.playTone(784, 0.16, "triangle", 0.22, 0.28);
      this.playTone(1047, 0.32, "triangle", 0.24, 0.42);
    });
  }

  playDefeat(): void {
    this.playCue("defeat", () => this.playSlide(300, 90, 0.5, "sawtooth", 0.22));
  }

  // ---- music -----------------------------------------------------------------------

  startMusic(): void {
    if (!this.ctx || !this.musicGain || this.musicNodes) return;

    this.calmGain = this.ctx.createGain();
    this.calmGain.gain.value = 1;
    this.calmGain.connect(this.musicGain);

    this.intenseGain = this.ctx.createGain();
    this.intenseGain.gain.value = 0;
    this.intenseGain.connect(this.musicGain);

    const calmUrl = MUSIC_FILES.calm;
    const intenseUrl = MUSIC_FILES.intense;
    const calmEntry = this.buffers.get(calmUrl);
    const intenseEntry = this.buffers.get(intenseUrl);

    const stoppers: Array<() => void> = [];

    if (calmEntry?.buffer) {
      const handle = this.playBuffer(calmUrl, this.calmGain, 1, true);
      if (handle) stoppers.push(handle.stop);
    } else {
      stoppers.push(this.startProceduralPad(this.calmGain, [130.81, 164.81, 196], 0.06));
    }

    if (intenseEntry?.buffer) {
      const handle = this.playBuffer(intenseUrl, this.intenseGain, 1, true);
      if (handle) stoppers.push(handle.stop);
    } else {
      stoppers.push(this.startProceduralPad(this.intenseGain, [146.83, 174.61, 220, 293.66], 0.05, true));
    }

    this.musicNodes = {
      stop: () => {
        for (const stop of stoppers) {
          try {
            stop();
          } catch {
            /* already stopped */
          }
        }
      },
    };
  }

  private startProceduralPad(destination: GainNode, freqs: number[], gainPerVoice: number, rhythmic = false): () => void {
    if (!this.ctx) return () => {};
    const oscillators: OscillatorNode[] = [];
    for (const freq of freqs) {
      const osc = this.ctx.createOscillator();
      osc.type = rhythmic ? "square" : "sine";
      osc.frequency.value = freq;
      const voiceGain = this.ctx.createGain();
      voiceGain.gain.value = rhythmic ? 0 : gainPerVoice;
      osc.connect(voiceGain);
      voiceGain.connect(destination);
      osc.start();
      oscillators.push(osc);

      if (rhythmic) {
        // A soft pulsing gain gives the intense layer a heartbeat feel without needing
        // sample playback or a scheduler beyond the Web Audio clock itself.
        const pulse = () => {
          if (!this.ctx) return;
          const t0 = this.ctx.currentTime;
          voiceGain.gain.cancelScheduledValues(t0);
          voiceGain.gain.setValueAtTime(0.001, t0);
          voiceGain.gain.linearRampToValueAtTime(gainPerVoice, t0 + 0.05);
          voiceGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.35);
        };
        pulse();
        const interval = window.setInterval(pulse, 420);
        oscillators.push({ stop: () => window.clearInterval(interval) } as unknown as OscillatorNode);
      }
    }
    return () => {
      for (const osc of oscillators) {
        try {
          osc.stop();
        } catch {
          /* setInterval shim or already stopped oscillator */
        }
      }
    };
  }

  stopMusic(): void {
    this.musicNodes?.stop();
    this.musicNodes = null;
    this.calmGain = null;
    this.intenseGain = null;
    this.musicIntensity = 0;
    this.targetIntensity = 0;
  }

  /** Called once per frame from GameWorld.update(). level is 0 (no threat nearby) to 1
   * (an enemy or boss is close), and eases toward its target so the intense layer fades
   * in and out instead of snapping. */
  setIntensity(level: number): void {
    this.targetIntensity = Math.max(0, Math.min(1, level));
  }

  /** Advances the calm/intense crossfade. Call every frame alongside setIntensity. */
  update(delta: number): void {
    if (!this.intenseGain || !this.calmGain) return;
    const rate = 1.5 * delta;
    if (this.musicIntensity < this.targetIntensity) {
      this.musicIntensity = Math.min(this.targetIntensity, this.musicIntensity + rate);
    } else if (this.musicIntensity > this.targetIntensity) {
      this.musicIntensity = Math.max(this.targetIntensity, this.musicIntensity - rate);
    }
    this.intenseGain.gain.value = this.musicIntensity * 0.8;
    this.calmGain.gain.value = 1 - this.musicIntensity * 0.4;
  }

  // ---- mute --------------------------------------------------------------------------

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain) this.masterGain.gain.value = muted ? 0 : 1;
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  isMuted(): boolean {
    return this.muted;
  }
}
