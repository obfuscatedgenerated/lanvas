"use client";

import {useEffect, useSyncExternalStore} from "react";

import {LOCALSTORAGE_KEY_SFX_MUTED, LOCALSTORAGE_KEY_SFX_VOLUME} from "@/consts";

const SOUND_NAMES = [
    "clown",
    "drum_roll_start",
    "drum_roll_loop",
    "drum_roll_stop",
    "explode",
    "fart",
    "gift",
    "jackpot",
    "quack",
    "wheel_click",
    "pop"
] as const;

export type SoundName = typeof SOUND_NAMES[number];

const sound_url = (name: SoundName): string => `/sfx/${name}.opus`;

interface LoopParts {
    intro?: SoundName;
    loop: SoundName;
    outro?: SoundName;
}

const LOOPS = {
    drum_roll: {intro: "drum_roll_start", loop: "drum_roll_loop", outro: "drum_roll_stop"},
} as const satisfies Record<string, LoopParts>;

export type LoopName = keyof typeof LOOPS;

// short fade when cutting a loop off, so it doesn't click
const LOOP_STOP_FADE_SECONDS = 0.04;

const DEFAULT_VOLUME = 0.6;

export interface PlayOptions {
    volume?: number;
    pitch_variation?: number;
    ignore_mute?: boolean;
    loop?: boolean;
}

export interface PlayingSound {
    stop: () => void;
}

const is_browser = typeof window !== "undefined";

const read_stored = (key: string): string | null => {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
};

const write_stored = (key: string, value: string): void => {
    try {
        localStorage.setItem(key, value);
    } catch {
        // storage is blocked or full, so the setting just won't survive a refresh
    }
};

const parse_volume = (stored: string | null): number => {
    const parsed = stored === null ? NaN : Number(stored);
    return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : DEFAULT_VOLUME;
};

let muted = is_browser && read_stored(LOCALSTORAGE_KEY_SFX_MUTED) === "true";
let volume = is_browser ? parse_volume(read_stored(LOCALSTORAGE_KEY_SFX_VOLUME)) : DEFAULT_VOLUME;

const listeners = new Set<() => void>();

const notify = () => {
    for (const listener of listeners) {
        listener();
    }
};

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

export const is_sfx_muted = (): boolean => muted;

export const set_sfx_muted = (next_muted: boolean): void => {
    muted = next_muted;
    write_stored(LOCALSTORAGE_KEY_SFX_MUTED, String(next_muted));
    notify();
};

export const set_sfx_volume = (next_volume: number): void => {
    volume = Math.min(1, Math.max(0, next_volume));
    write_stored(LOCALSTORAGE_KEY_SFX_VOLUME, String(volume));
    notify();
};

// muting in one tab mutes the others too
if (is_browser) {
    window.addEventListener("storage", (event) => {
        if (event.key === LOCALSTORAGE_KEY_SFX_MUTED) {
            muted = event.newValue === "true";
            notify();
        } else if (event.key === LOCALSTORAGE_KEY_SFX_VOLUME) {
            volume = parse_volume(event.newValue);
            notify();
        }
    });
}

export const useSfxMuted = (): boolean => useSyncExternalStore(subscribe, () => muted, () => false);
export const useSfxVolume = (): number => useSyncExternalStore(subscribe, () => volume, () => DEFAULT_VOLUME);

let audio_context: AudioContext | null = null;
let loading: Promise<void> | null = null;
const buffers = new Map<SoundName, AudioBuffer>();

const mark_audio_changed = () => notify();

const load_sounds = (context: AudioContext): Promise<void> =>
    Promise.all(
        SOUND_NAMES.map(async (name) => {
            const url = sound_url(name);
            try {
                const response = await fetch(url);

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                buffers.set(name, await context.decodeAudioData(await response.arrayBuffer()));
                mark_audio_changed();
            } catch (load_error) {
                console.warn(`Couldn't load sound ${name} from ${url}:`, load_error);
            }
        })
    ).then(() => undefined);

// browsers keep audio suspended until the user interacts with the page, so this is first called from a click or key
const ensure_audio = (): AudioContext | null => {
    if (!is_browser) {
        return null;
    }

    if (!audio_context) {
        audio_context = new AudioContext();
        audio_context.onstatechange = mark_audio_changed;
    }

    if (audio_context.state === "suspended") {
        void audio_context.resume();
    }

    if (!loading) {
        loading = load_sounds(audio_context);
    }

    return audio_context;
};

if (is_browser) {
    const unlock = () => {
        ensure_audio();
        window.removeEventListener("pointerdown", unlock);
        window.removeEventListener("keydown", unlock);
    };

    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
}

// fire and forget, safe to call from anywhere including socket handlers
// does nothing while muted, before the first interaction, or if the file failed to load
export const play_sound = (name: SoundName, {volume: sound_volume = 1, pitch_variation = 0, ignore_mute = false, loop = false}: PlayOptions = {}): PlayingSound | null => {
    if (muted && !ignore_mute) {
        return null;
    }

    const context = ensure_audio();
    const buffer = buffers.get(name);

    if (!context || !buffer || context.state !== "running") {
        return null;
    }

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = loop;
    source.playbackRate.value = 1 + (Math.random() * 2 - 1) * pitch_variation;

    const gain = context.createGain();
    gain.gain.value = volume * sound_volume;

    source.connect(gain).connect(context.destination);
    source.start();

    return {
        stop: () => {
            try {
                source.stop();
            } catch {
                // it had already finished
            }
        },
    };
};

const loop_parts = (name: SoundName | LoopName): LoopParts =>
    name in LOOPS ? LOOPS[name as LoopName] : {loop: name as SoundName};

// only the looping part has to be loaded, a missing intro or outro is just skipped
const can_play = (name: SoundName | LoopName): boolean => buffers.has(loop_parts(name).loop) && audio_context?.state === "running";

// a boolean per sound, so other sounds finishing loading don't restart a loop that's already going
const useCanPlay = (name: SoundName | LoopName): boolean => useSyncExternalStore(subscribe, () => can_play(name), () => false);

// intro then loop, scheduled on the audio clock so there's no gap between them, outro when stopped
export const start_loop = (name: SoundName | LoopName, {volume: sound_volume = 1, pitch_variation = 0, ignore_mute = false}: Omit<PlayOptions, "loop">): PlayingSound | null => {
    if (muted && !ignore_mute) {
        return null;
    }

    const context = ensure_audio();
    const parts = loop_parts(name);
    const loop_buffer = buffers.get(parts.loop);

    if (!context || !loop_buffer || context.state !== "running") {
        return null;
    }

    // every part shares one rate, so a pitched intro still hands over to the loop seamlessly
    const rate = 1 + (Math.random() * 2 - 1) * pitch_variation;

    const gain = context.createGain();
    gain.gain.value = volume * sound_volume;
    gain.connect(context.destination);

    const sources: AudioBufferSourceNode[] = [];

    const create_source = (buffer: AudioBuffer): AudioBufferSourceNode => {
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.value = rate;
        source.connect(gain);
        sources.push(source);

        return source;
    };

    const start_time = context.currentTime;
    let loop_start_time = start_time;

    const intro_buffer = parts.intro ? buffers.get(parts.intro) : undefined;
    if (intro_buffer) {
        create_source(intro_buffer).start(start_time);
        loop_start_time = start_time + intro_buffer.duration / rate;
    }

    const loop_source = create_source(loop_buffer);
    loop_source.loop = true;
    loop_source.start(loop_start_time);

    let stopped = false;

    return {
        stop: () => {
            if (stopped) {
                return;
            }

            stopped = true;

            // fades out whatever is playing, intro or loop, rather than cutting it mid-wave
            const now = context.currentTime;
            gain.gain.setValueAtTime(gain.gain.value, now);
            gain.gain.linearRampToValueAtTime(0, now + LOOP_STOP_FADE_SECONDS);

            for (const source of sources) {
                try {
                    source.stop(now + LOOP_STOP_FADE_SECONDS);
                } catch {
                    // it had already finished
                }
            }

            // respects mute itself, so muting mid-loop cuts it off without the outro
            if (parts.outro) {
                play_sound(parts.outro, {volume: sound_volume, ignore_mute});
            }
        },
    };
};

export const useLoopingSound = (name: SoundName | LoopName, active: boolean, options: Omit<PlayOptions, "loop"> = {}): void => {
    const is_muted = useSfxMuted();
    const ready = useCanPlay(name);

    const {volume: sound_volume, pitch_variation, ignore_mute} = options;

    useEffect(() => {
        if (!active) {
            return;
        }

        if (!ready) {
            return;
        }

        // null while muted, the effect runs again when that changes
        const playing = start_loop(name, {volume: sound_volume, pitch_variation, ignore_mute});

        return () => playing?.stop();
    }, [name, active, is_muted, ready, sound_volume, pitch_variation, ignore_mute]);
};
