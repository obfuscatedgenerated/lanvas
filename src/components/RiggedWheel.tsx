"use client";

import {useEffect, useMemo, useRef, useState} from "react";
import {WheelSegment} from "@/types";

interface RiggedWheelProps {
    segments: WheelSegment[];

    // the server decides the result, the wheel just animates to it
    result_id: string | null;

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
const LABEL_RADIUS = RADIUS * 0.62;

// how far from a slice's centre the pointer may land, as a fraction of half the slice, so it never sits on a border
const LANDING_SPREAD = 0.7;

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

const RiggedWheel = ({segments, result_id, spin_key, spin_duration_ms = 4500, full_turns = 6, size = 280, on_spin_end}: RiggedWheelProps) => {
    const placed_segments = useMemo(() => place_segments(segments), [segments]);

    // cumulative, so every spin keeps turning forwards from where the last one stopped
    const [rotation, setRotation] = useState(0);
    const [spinning, setSpinning] = useState(false);

    const landing_segment_ref = useRef<WheelSegment | null>(null);

    const on_spin_end_ref = useRef(on_spin_end);
    useEffect(() => {
        on_spin_end_ref.current = on_spin_end;
    }, [on_spin_end]);

    useEffect(() => {
        if (spin_key === 0 || result_id === null) {
            return;
        }

        const target = placed_segments.find((placed) => placed.segment.id === result_id);
        if (!target) {
            console.warn(`Spin result ${result_id} isn't on the wheel`);
            return;
        }

        const half_span = (target.end_angle - target.start_angle) / 2;
        const landing_angle = target.centre_angle + (Math.random() * 2 - 1) * half_span * LANDING_SPREAD;

        landing_segment_ref.current = target.segment;
        setSpinning(true);

        // rotating by R moves angle a to a + R, so the pointer at 0 lands on landing_angle when R = -landing_angle (mod 360)
        setRotation((previous) => {
            const current_offset = ((previous % 360) + 360) % 360;
            const needed = (((-landing_angle - current_offset) % 360) + 360) % 360;

            return previous + full_turns * 360 + needed;
        });
    }, [spin_key, result_id, placed_segments, full_turns]);

    const handle_transition_end = () => {
        if (!spinning) {
            return;
        }

        setSpinning(false);

        if (landing_segment_ref.current) {
            on_spin_end_ref.current?.(landing_segment_ref.current);
        }
    };

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
                style={{
                    transform: `rotate(${rotation}deg)`,
                    transition: spinning ? `transform ${spin_duration_ms}ms cubic-bezier(0.12, 0.8, 0.2, 1)` : "none",
                }}
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
                    const label_point = point_at(placed.centre_angle, LABEL_RADIUS);

                    return (
                        <text
                            key={`${placed.segment.id}-label`}
                            x={label_point.x}
                            y={label_point.y}
                            transform={`rotate(${placed.centre_angle} ${label_point.x} ${label_point.y})`}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fontSize={9}
                            fontWeight={700}
                            fill="#ffffff"
                            style={{paintOrder: "stroke", stroke: "rgba(0, 0, 0, 0.5)", strokeWidth: 2}}
                        >
                            {placed.segment.label}
                        </text>
                    );
                })}

                <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="none" stroke="rgba(255, 255, 255, 0.8)" strokeWidth={3} />
                <circle cx={CENTER} cy={CENTER} r={10} fill="#171717" stroke="rgba(255, 255, 255, 0.8)" strokeWidth={2} />
            </svg>
        </div>
    );
};

export default RiggedWheel;