"use client";

import {useEffect, useMemo, useRef, useState} from "react";

import type {WheelSegment} from "@/types";

interface RiggedWheelProps {
    segments: WheelSegment[];

    // the server decides the result, the wheel just animates to it
    result_id: string | null;

    // when set, the wheel lands here first, pauses, then creeps over to result_id
    tease_id?: string | null;

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

// long enough for everyone to read "JACKPOT" before it starts slipping away
const TEASE_PAUSE_MS = 1200;
const CREEP_DURATION_MS = 2200;

type SpinPhase = "idle" | "spinning" | "teasing" | "paused" | "creeping";

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

// rotating by R moves angle a to a + R, so the pointer at 0 shows landing_angle when R = -landing_angle (mod 360)
const forward_rotation_to = (current_rotation: number, landing_angle: number): number => {
    const current_offset = ((current_rotation % 360) + 360) % 360;
    return (((-landing_angle - current_offset) % 360) + 360) % 360;
};

// the shortest way round, in either direction, so a creep only nudges over to the neighbouring slice
const nearest_rotation_to = (current_rotation: number, landing_angle: number): number => {
    const forward = forward_rotation_to(current_rotation, landing_angle);
    return forward > 180 ? forward - 360 : forward;
};

const RiggedWheel = ({segments, result_id, tease_id = null, spin_key, spin_duration_ms = 4500, full_turns = 6, size = 280, on_spin_end}: RiggedWheelProps) => {
    const placed_segments = useMemo(() => place_segments(segments), [segments]);

    // cumulative, so every spin keeps turning from where the last one stopped
    const [rotation, setRotation] = useState(0);
    const [phase, setPhase] = useState<SpinPhase>("idle");

    const result_ref = useRef<PlacedSegment | null>(null);
    const pause_timeout_ref = useRef<NodeJS.Timeout | null>(null);

    const on_spin_end_ref = useRef(on_spin_end);
    useEffect(() => {
        on_spin_end_ref.current = on_spin_end;
    }, [on_spin_end]);

    useEffect(() => {
        return () => {
            if (pause_timeout_ref.current) {
                clearTimeout(pause_timeout_ref.current);
            }
        };
    }, []);

    useEffect(() => {
        if (spin_key === 0 || result_id === null) {
            return;
        }

        const result = placed_segments.find((placed) => placed.segment.id === result_id);
        if (!result) {
            console.warn(`Spin result ${result_id} isn't on the wheel`);
            return;
        }

        const tease = tease_id ? placed_segments.find((placed) => placed.segment.id === tease_id) : undefined;
        const first_stop = tease ?? result;

        result_ref.current = result;

        if (pause_timeout_ref.current) {
            clearTimeout(pause_timeout_ref.current);
        }

        const landing_angle = random_landing_angle(first_stop);

        setPhase(tease ? "teasing" : "spinning");
        setRotation((previous) => previous + full_turns * 360 + forward_rotation_to(previous, landing_angle));
    }, [spin_key, result_id, tease_id, placed_segments, full_turns]);

    const handle_transition_end = () => {
        if (phase === "teasing") {
            setPhase("paused");

            pause_timeout_ref.current = setTimeout(() => {
                const result = result_ref.current;
                if (!result) {
                    return;
                }

                const landing_angle = random_landing_angle(result);

                setPhase("creeping");
                setRotation((previous) => previous + nearest_rotation_to(previous, landing_angle));
            }, TEASE_PAUSE_MS);

            return;
        }

        if (phase === "spinning" || phase === "creeping") {
            setPhase("idle");

            if (result_ref.current) {
                on_spin_end_ref.current?.(result_ref.current.segment);
            }
        }
    };

    const transition = phase === "spinning" || phase === "teasing"
        ? `transform ${spin_duration_ms}ms cubic-bezier(0.12, 0.8, 0.2, 1)`
        : phase === "creeping"
            ? `transform ${CREEP_DURATION_MS}ms cubic-bezier(0.45, 0, 0.55, 1)`
            : "none";

    return (
        <div className="relative select-none" style={{width: size, height: size}}>
            {/* pointer, fixed at the top while the wheel turns beneath it */}
            <div
                className="absolute left-1/2 -top-1 -translate-x-1/2 z-10 w-0 h-0 border-l-[10px] border-r-[10px] border-t-[18px] border-l-transparent border-r-transparent border-t-white drop-shadow"
                aria-hidden
            />

            <svg
                viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
                width={size}
                height={size}
                style={{transform: `rotate(${rotation}deg)`, transition}}
                onTransitionEnd={handle_transition_end}
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