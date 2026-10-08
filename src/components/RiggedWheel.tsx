"use client";

import {useCallback, useEffect, useMemo, useRef, useState} from "react";

import type {WheelSegment} from "@/types";
import {play_sound, start_loop, useSfxMuted, type PlayingSound, useLoopingSound} from "@/lib/sfx";
import {
    WHEEL_SLIP_DURATION_MS,
    WHEEL_SLOWMO_DURATION_MS,
    WHEEL_SLOWMO_LEAD_DEGREES,
    WHEEL_SPIN_DURATION_MS,
    WHEEL_SUSPENSE_SEGMENT_ID,
} from "@/wheel_timing";

interface RiggedWheelProps {
    segments: WheelSegment[];

    // the server decides the result, the wheel just animates to it
    result_id: string | null;

    // when set, the wheel lands here first, then quickly slips over to result_id
    tease_id?: string | null;

    // heading for this slice, real or teased, eases into slow motion with a drumroll, so the two look identical until it lands
    suspense_id?: string;

    // bump this to start a spin, so landing on the same result twice in a row still spins
    spin_key: number;

    spin_duration_ms?: number;
    full_turns?: number;
    size?: number;

    on_spin_end?: (segment: WheelSegment) => void;
}

const VIEWBOX_SIZE = 200;
const CENTER = VIEWBOX_SIZE / 2;
const RADIUS = 96;
const HUB_RADIUS = 10;

// labels run outwards along each slice, between the hub and the rim
const LABEL_INNER_RADIUS = HUB_RADIUS + 8;
const LABEL_OUTER_RADIUS = RADIUS - 6;
const LABEL_MID_RADIUS = (LABEL_INNER_RADIUS + LABEL_OUTER_RADIUS) / 2;

const MAX_LABEL_FONT_SIZE = 12;

// below this a label would be unreadable, so the slice relies on its colour instead
const MIN_LABEL_FONT_SIZE = 4.5;

// rough glyph widths as a fraction of font size, emoji render about twice as wide as letters
const LETTER_WIDTH = 0.62;
const EMOJI_WIDTH = 1.25;

// how far from a slice's centre the pointer may land, as a fraction of half the slice, so it never sits on a border
const LANDING_SPREAD = 0.7;

// higher eases the fast part out harder, so more of the deceleration happens early
const APPROACH_EASE_POWER = 3;

// at full speed the wheel passes several borders a frame, more clicks than this at once is just noise
const MAX_CLICKS_PER_FRAME = 2;
const CLICK_PITCH_VARIATION = 0.06;
const CLICK_VOLUME = 0.5;

type EndingSound = "jackpot" | "fart" | null;

// one stretch of movement: how far it has gone after a given time, from 0 at the start to its distance at the end
interface Stage {
    duration: number;
    travelled_at: (elapsed: number) => number;
    on_start?: () => void;
}

interface PlacedSegment {
    segment: WheelSegment;
    start_angle: number;
    end_angle: number;
    centre_angle: number;
}

// angles in degrees, 0 at the top and increasing clockwise
const point_at = (angle: number, radius: number) => {
    const radians = (angle * Math.PI) / 180;

    return {
        x: CENTER + radius * Math.sin(radians),
        y: CENTER - radius * Math.cos(radians),
    };
};

const wedge_path = (start_angle: number, end_angle: number): string => {
    const start = point_at(start_angle, RADIUS);
    const end = point_at(end_angle, RADIUS);
    const large_arc = end_angle - start_angle > 180 ? 1 : 0;

    return `M ${CENTER} ${CENTER} L ${start.x} ${start.y} A ${RADIUS} ${RADIUS} 0 ${large_arc} 1 ${end.x} ${end.y} Z`;
};

const place_segments = (segments: WheelSegment[]): PlacedSegment[] => {
    const total_weight = segments.reduce((total, segment) => total + (segment.weight ?? 1), 0);

    let current_angle = 0;

    return segments.map((segment) => {
        const span = total_weight > 0 ? ((segment.weight ?? 1) / total_weight) * 360 : 0;
        const placed = {
            segment,
            start_angle: current_angle,
            end_angle: current_angle + span,
            centre_angle: current_angle + span / 2,
        };

        current_angle += span;
        return placed;
    });
};

// estimated width of a label at font size 1, close enough to size labels without measuring the dom
const label_width_per_font_unit = (label: string): number => {
    let width = 0;

    for (const character of label) {
        width += (character.codePointAt(0) ?? 0) > 0xffff ? EMOJI_WIDTH : LETTER_WIDTH;
    }

    return Math.max(width, LETTER_WIDTH);
};

// biggest font that fits both along the slice and across its width at the label's midpoint
const label_font_size = (label: string, span_degrees: number): number => {
    const length_fit = (LABEL_OUTER_RADIUS - LABEL_INNER_RADIUS) / label_width_per_font_unit(label);
    const thickness_fit = 2 * Math.PI * LABEL_MID_RADIUS * (span_degrees / 360) * 0.75;

    return Math.min(MAX_LABEL_FONT_SIZE, length_fit, thickness_fit);
};

// text points outwards along the slice, flipped on the left half so it's never upside down
const label_rotation = (centre_angle: number): number => {
    const normalised = ((centre_angle % 360) + 360) % 360;
    return normalised > 180 ? centre_angle + 90 : centre_angle - 90;
};

const random_landing_angle = (placed: PlacedSegment): number => {
    const half_span = (placed.end_angle - placed.start_angle) / 2;
    return placed.centre_angle + (Math.random() * 2 - 1) * half_span * LANDING_SPREAD;
};

const normalise_angle = (angle: number): number => ((angle % 360) + 360) % 360;

// rotating by R moves angle a to a + R, so the pointer at 0 shows landing_angle when R = -landing_angle (mod 360)
const forward_rotation_to = (current_rotation: number, landing_angle: number): number =>
    normalise_angle(-landing_angle - normalise_angle(current_rotation));

// the shortest way round, in either direction, so a slip only nudges over to the neighbouring slice
const nearest_rotation_to = (current_rotation: number, landing_angle: number): number => {
    const forward = forward_rotation_to(current_rotation, landing_angle);
    return forward > 180 ? forward - 360 : forward;
};

// how many slice borders the pointer passed moving from previous_angle by delta, in either direction
const borders_crossed = (previous_angle: number, delta: number, borders: number[]): number => {
    let crossed = 0;

    for (const border of borders) {
        const offset = delta >= 0 ? normalise_angle(border - previous_angle) : normalise_angle(previous_angle - border);

        if (offset > 0 && offset <= Math.abs(delta)) {
            crossed++;
        }
    }

    return crossed;
};

// a normal spin: fast start, easing out to a stop
const ease_out_stage = (distance: number, duration: number): Stage => ({
    duration,
    travelled_at: (elapsed) => distance * (1 - Math.pow(1 - elapsed / duration, 4)),
});

// speed falls from the start towards end_speed rather than to zero, so the next stage can carry on at that speed
const ease_to_speed_stage = (distance: number, duration: number, end_speed: number): Stage => {
    const power = APPROACH_EASE_POWER;

    // speed(t) = end_speed + (start_speed - end_speed) * (1 - t / duration) ^ power, integrated to cover distance
    const start_speed = (distance - end_speed * duration) * (power + 1) / duration + end_speed;

    return {
        duration,
        travelled_at: (elapsed) => {
            const remaining = 1 - elapsed / duration;
            return end_speed * elapsed + (start_speed - end_speed) * duration / (power + 1) * (1 - Math.pow(remaining, power + 1));
        },
    };
};

// slows at a steady rate from whatever speed covers distance in duration, ending exactly at rest
const steady_slowdown_stage = (distance: number, duration: number, on_start: () => void): Stage => ({
    duration,
    travelled_at: (elapsed) => distance * (1 - Math.pow(1 - elapsed / duration, 2)),
    on_start,
});

const ease_in_out_stage = (distance: number, duration: number): Stage => ({
    duration,
    travelled_at: (elapsed) => {
        const progress = elapsed / duration;
        const eased = progress < 0.5 ? 4 * progress ** 3 : 1 - Math.pow(-2 * progress + 2, 3) / 2;

        return distance * eased;
    },
});

const RiggedWheel = ({segments, result_id, tease_id = null, suspense_id = WHEEL_SUSPENSE_SEGMENT_ID, spin_key, spin_duration_ms = WHEEL_SPIN_DURATION_MS, full_turns = 6, size = 280, on_spin_end}: RiggedWheelProps) => {
    const placed_segments = useMemo(() => place_segments(segments), [segments]);
    const borders = useMemo(() => placed_segments.length > 1 ? placed_segments.map((placed) => placed.start_angle) : [], [placed_segments]);

    const [drumming, setDrumming] = useState(false);
    useLoopingSound("drum_roll", drumming);

    const svg_ref = useRef<SVGSVGElement>(null);

    // driven frame by frame rather than by css transitions, so speed carries smoothly from one stage into the next
    const rotation_ref = useRef(0);
    const animation_frame_ref = useRef(0);

    const borders_ref = useRef(borders);
    useEffect(() => {
        borders_ref.current = borders;
    }, [borders]);

    // the spin_key already acted on, starting with whatever it was at mount so opening the wheel doesn't replay the last spin
    const handled_spin_key_ref = useRef(spin_key);

    const on_spin_end_ref = useRef(on_spin_end);
    useEffect(() => {
        on_spin_end_ref.current = on_spin_end;
    }, [on_spin_end]);

    // written straight to the element, never through react's style prop, so a re-render can't reset it mid-spin
    const apply_rotation = useCallback((rotation: number) => {
        rotation_ref.current = rotation;

        if (svg_ref.current) {
            svg_ref.current.style.transform = `rotate(${rotation}deg)`;
        }
    }, []);

    useEffect(() => {
        apply_rotation(rotation_ref.current);

        return () => cancelAnimationFrame(animation_frame_ref.current);
    }, [apply_rotation]);

    // plays the stages back to back, clicking at every border passed, then calls on_done
    const run_stages = useCallback((stages: Stage[], on_done: () => void) => {
        cancelAnimationFrame(animation_frame_ref.current);

        let stage_index = 0;
        let stage_start_rotation = rotation_ref.current;
        let stage_start_time = performance.now();

        stages[0]?.on_start?.();

        const tick = (now: number) => {
            const previous_rotation = rotation_ref.current;
            let stage: Stage | undefined = stages[stage_index];

            // a long frame can finish a stage and spill over into the next one
            while (stage && now - stage_start_time >= stage.duration) {
                stage_start_rotation += stage.travelled_at(stage.duration);
                stage_start_time += stage.duration;
                stage_index++;

                stage = stages[stage_index];
                stage?.on_start?.();
            }

            const current_rotation = stage
                ? stage_start_rotation + stage.travelled_at(Math.max(0, now - stage_start_time))
                : stage_start_rotation;

            apply_rotation(current_rotation);

            // the pointer sits still at the top while the wheel turns, so it moves the opposite way across the slices
            const crossed = borders_crossed(normalise_angle(-previous_rotation), previous_rotation - current_rotation, borders_ref.current);

            for (let click = 0; click < Math.min(crossed, MAX_CLICKS_PER_FRAME); click++) {
                play_sound("wheel_click", {volume: CLICK_VOLUME, pitch_variation: CLICK_PITCH_VARIATION});
            }

            if (!stage) {
                on_done();
                return;
            }

            animation_frame_ref.current = requestAnimationFrame(tick);
        };

        animation_frame_ref.current = requestAnimationFrame(tick);
    }, [apply_rotation]);

    useEffect(() => {
        if (spin_key === handled_spin_key_ref.current || result_id === null) {
            return;
        }

        handled_spin_key_ref.current = spin_key;

        const result = placed_segments.find((placed) => placed.segment.id === result_id);
        if (!result) {
            console.warn(`Spin result ${result_id} isn't on the wheel`);
            return;
        }

        const tease = tease_id ? placed_segments.find((placed) => placed.segment.id === tease_id) : undefined;
        const first_stop = tease ?? result;
        const is_suspense = first_stop.segment.id === suspense_id;

        const spin_distance = full_turns * 360 + forward_rotation_to(rotation_ref.current, random_landing_angle(first_stop));

        const stages: Stage[] = [];

        if (is_suspense) {
            // the slow motion's starting speed, which the fast part eases down to so there's no stall between them
            const slowmo_start_speed = 2 * WHEEL_SLOWMO_LEAD_DEGREES / WHEEL_SLOWMO_DURATION_MS;

            stages.push(ease_to_speed_stage(spin_distance - WHEEL_SLOWMO_LEAD_DEGREES, spin_duration_ms, slowmo_start_speed));
            stages.push(steady_slowdown_stage(WHEEL_SLOWMO_LEAD_DEGREES, WHEEL_SLOWMO_DURATION_MS, () => setDrumming(true)));
        } else {
            stages.push(ease_out_stage(spin_distance, spin_duration_ms));
        }

        const finish = (ending_sound: EndingSound) => {
            setDrumming(false);

            if (ending_sound) {
                play_sound(ending_sound);
            }

            on_spin_end_ref.current?.(result.segment);
        };

        run_stages(stages, () => {
            if (!tease) {
                finish(is_suspense ? "jackpot" : null);
                return;
            }

            // real and fake are identical up to this moment, then the fake slips the short way round to the real result
            setDrumming(false);

            const slip_distance = nearest_rotation_to(rotation_ref.current, random_landing_angle(result));
            run_stages([ease_in_out_stage(slip_distance, WHEEL_SLIP_DURATION_MS)], () => finish(is_suspense ? "fart" : null));
        });
    }, [spin_key, result_id, tease_id, suspense_id, placed_segments, full_turns, spin_duration_ms, run_stages]);

    return (
        <div className="relative select-none" style={{width: size, height: size}}>
            {/* pointer, fixed at the top while the wheel turns beneath it */}
            <div
                className="absolute left-1/2 -top-1 -translate-x-1/2 z-10 w-0 h-0 border-l-[10px] border-r-[10px] border-t-[18px] border-l-transparent border-r-transparent border-t-white drop-shadow"
                aria-hidden
            />

            <svg
                ref={svg_ref}
                viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
                width={size}
                height={size}
                role="img"
                aria-label="Spin wheel"
            >
                {placed_segments.length === 1
                    ? <circle cx={CENTER} cy={CENTER} r={RADIUS} fill={placed_segments[0].segment.color} />
                    : placed_segments.map((placed) => (
                        <path
                            key={placed.segment.id}
                            d={wedge_path(placed.start_angle, placed.end_angle)}
                            fill={placed.segment.color}
                            stroke="rgba(0, 0, 0, 0.35)"
                            strokeWidth={1}
                        />
                    ))
                }

                {placed_segments.map((placed) => {
                    const font_size = label_font_size(placed.segment.label, placed.end_angle - placed.start_angle);

                    if (font_size < MIN_LABEL_FONT_SIZE) {
                        return null;
                    }

                    const label_point = point_at(placed.centre_angle, LABEL_MID_RADIUS);

                    return (
                        <text
                            key={`${placed.segment.id}-label`}
                            x={label_point.x}
                            y={label_point.y}
                            transform={`rotate(${label_rotation(placed.centre_angle)} ${label_point.x} ${label_point.y})`}
                            textAnchor="middle"
                            dominantBaseline="central"
                            fontSize={font_size}
                            fontWeight={700}
                            fill="#ffffff"
                            style={{paintOrder: "stroke", stroke: "rgba(0, 0, 0, 0.5)", strokeWidth: Math.max(1, font_size / 5)}}
                        >
                            {placed.segment.label}
                        </text>
                    );
                })}

                <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="none" stroke="rgba(255, 255, 255, 0.8)" strokeWidth={3} />
                <circle cx={CENTER} cy={CENTER} r={HUB_RADIUS} fill="#171717" stroke="rgba(255, 255, 255, 0.8)" strokeWidth={2} />
            </svg>
        </div>
    );
};

export default RiggedWheel;