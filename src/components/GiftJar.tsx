"use client";

import {useEffect, useMemo, useRef, useState} from "react";

import type {HeldGift} from "@/types";

const BALL_RADIUS = 12;
const BALL_DIAMETER = BALL_RADIUS * 2;

// gap kept between resting balls and the jar's bottom border so they aren't clipped by it
const FLOOR_CLEARANCE = 2;

// empty space kept above the top row so new balls have somewhere to drop from
const HEADROOM = BALL_RADIUS;

const GRAVITY = 900; // px per second squared
const RESTITUTION = 0.45; // how much bounce survives a collision
const FLOOR_FRICTION = 0.9; // horizontal speed kept per floor contact
const AIR_DAMPING_PER_SECOND = 0.6; // fraction of speed kept after one second of flight
const REST_SPEED = 20; // below this, floor bounces stop instead of jittering
const SOLVER_ITERATIONS = 4;
const MAX_FRAME_SECONDS = 1 / 30;

const POKE_SPEED = 380;
const ARRIVAL_SHAKE_SPEED = 90;

const AVATAR_SIZE_QUERY = "size=64";

interface Ball {
    key: string;
    name: string;
    avatar_url: string | null;
    hue: number;
    x: number;
    y: number;
    velocity_x: number;
    velocity_y: number;
    angle: number;
}

interface BallSource {
    key: string;
    name: string;
    user_id: string;
    avatar_url: string | null;
}

interface JarBounds {
    width: number;
    height: number;
}

interface GiftJarProps {
    gifts: HeldGift[];
    next_expiry: number | null;

    // interior width in css pixels, set by whatever the jar sits in
    width: number;

    // the jar grows with its contents between these heights
    min_height: number;
    max_height: number;
}

// stable colour per user for avatarless balls
const hue_from_id = (user_id: string): number => {
    let hash = 0;

    for (const character of user_id) {
        hash = (hash * 31 + character.charCodeAt(0)) % 360;
    }

    return hash;
};

const sized_avatar_url = (avatar_url: string): string => avatar_url.includes("?") ? avatar_url : `${avatar_url}?${AVATAR_SIZE_QUERY}`;

const format_remaining = (remaining_ms: number): string => {
    const total_seconds = Math.max(0, Math.ceil(remaining_ms / 1000));
    const minutes = Math.floor(total_seconds / 60);
    const seconds = total_seconds % 60;

    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

const balls_per_row = (width: number): number => Math.max(1, Math.floor(width / BALL_DIAMETER));

// how many balls fit resting in the jar at its tallest without piling past the top
const jar_capacity = (width: number, max_height: number): number => {
    const rows = Math.max(1, Math.floor((max_height - FLOOR_CLEARANCE - HEADROOM) / BALL_DIAMETER));

    return balls_per_row(width) * rows;
};

// just tall enough for the rows the balls need, within the allowed range
const jar_height_for = (ball_count: number, width: number, min_height: number, max_height: number): number => {
    const rows = Math.max(1, Math.ceil(ball_count / balls_per_row(width)));
    const needed = rows * BALL_DIAMETER + FLOOR_CLEARANCE + HEADROOM;

    return Math.min(max_height, Math.max(min_height, needed));
};

const step_physics = (balls: Ball[], delta_seconds: number, bounds: JarBounds) => {
    const damping = Math.pow(AIR_DAMPING_PER_SECOND, delta_seconds);

    for (const ball of balls) {
        ball.velocity_y += GRAVITY * delta_seconds;
        ball.velocity_x *= damping;

        ball.x += ball.velocity_x * delta_seconds;
        ball.y += ball.velocity_y * delta_seconds;

        // roll with horizontal movement
        ball.angle += (ball.velocity_x / BALL_RADIUS) * delta_seconds;
    }

    for (let iteration = 0; iteration < SOLVER_ITERATIONS; iteration++) {
        // ball against ball
        for (let first_index = 0; first_index < balls.length; first_index++) {
            for (let second_index = first_index + 1; second_index < balls.length; second_index++) {
                const first = balls[first_index];
                const second = balls[second_index];

                let offset_x = second.x - first.x;
                let offset_y = second.y - first.y;
                let distance = Math.hypot(offset_x, offset_y);

                if (distance >= BALL_RADIUS * 2) {
                    continue;
                }

                // perfectly stacked balls have no direction to separate in, so nudge them apart
                if (distance === 0) {
                    offset_x = Math.random() - 0.5;
                    offset_y = -1;
                    distance = Math.hypot(offset_x, offset_y);
                }

                const normal_x = offset_x / distance;
                const normal_y = offset_y / distance;

                const overlap = BALL_RADIUS * 2 - distance;
                first.x -= normal_x * overlap / 2;
                first.y -= normal_y * overlap / 2;
                second.x += normal_x * overlap / 2;
                second.y += normal_y * overlap / 2;

                const approach_speed = (second.velocity_x - first.velocity_x) * normal_x + (second.velocity_y - first.velocity_y) * normal_y;

                if (approach_speed < 0) {
                    const impulse = -(1 + RESTITUTION) * approach_speed / 2;

                    first.velocity_x -= impulse * normal_x;
                    first.velocity_y -= impulse * normal_y;
                    second.velocity_x += impulse * normal_x;
                    second.velocity_y += impulse * normal_y;
                }
            }
        }

        // ball against jar
        for (const ball of balls) {
            if (ball.x < BALL_RADIUS) {
                ball.x = BALL_RADIUS;
                ball.velocity_x = Math.abs(ball.velocity_x) * RESTITUTION;
            } else if (ball.x > bounds.width - BALL_RADIUS) {
                ball.x = bounds.width - BALL_RADIUS;
                ball.velocity_x = -Math.abs(ball.velocity_x) * RESTITUTION;
            }

            const floor = bounds.height - BALL_RADIUS - FLOOR_CLEARANCE;

            if (ball.y > floor) {
                ball.y = floor;
                ball.velocity_y = -Math.abs(ball.velocity_y) * RESTITUTION;
                ball.velocity_x *= FLOOR_FRICTION;

                if (Math.abs(ball.velocity_y) < REST_SPEED) {
                    ball.velocity_y = 0;
                }
            } else if (ball.y < BALL_RADIUS) {
                // keep pokes from launching balls out of the top
                ball.y = BALL_RADIUS;
                ball.velocity_y = Math.abs(ball.velocity_y) * RESTITUTION;
            }
        }
    }
};

const draw_balls = (context: CanvasRenderingContext2D, balls: Ball[], images: Map<string, HTMLImageElement>, bounds: JarBounds) => {
    context.clearRect(0, 0, bounds.width, bounds.height);

    for (const ball of balls) {
        context.save();
        context.translate(ball.x, ball.y);
        context.rotate(ball.angle);

        context.beginPath();
        context.arc(0, 0, BALL_RADIUS, 0, Math.PI * 2);
        context.closePath();
        context.save();
        context.clip();

        const image = ball.avatar_url ? images.get(ball.avatar_url) : undefined;

        if (image && image.complete && image.naturalWidth > 0) {
            context.drawImage(image, -BALL_RADIUS, -BALL_RADIUS, BALL_RADIUS * 2, BALL_RADIUS * 2);
        } else {
            context.fillStyle = `hsl(${ball.hue} 60% 45%)`;
            context.fillRect(-BALL_RADIUS, -BALL_RADIUS, BALL_RADIUS * 2, BALL_RADIUS * 2);

            context.fillStyle = "#ffffff";
            context.font = `bold ${BALL_RADIUS}px sans-serif`;
            context.textAlign = "center";
            context.textBaseline = "middle";
            context.fillText(ball.name.charAt(0).toUpperCase(), 0, 1);
        }

        context.restore();

        context.lineWidth = 1.5;
        context.strokeStyle = "rgba(255, 255, 255, 0.6)";
        context.stroke();

        context.restore();
    }
};

const GiftJar = ({gifts, next_expiry, width, min_height, max_height}: GiftJarProps) => {
    const canvas_ref = useRef<HTMLCanvasElement>(null);
    const balls_ref = useRef<Ball[]>([]);
    const images_ref = useRef<Map<string, HTMLImageElement>>(new Map());

    const [current_time, setCurrentTime] = useState(Date.now());

    // one ball per held pixel, soonest expiring first so spending a gift visibly removes a ball
    const ball_sources = useMemo(() => {
        const sources: BallSource[] = [];

        for (const gift of gifts) {
            for (let pixel_index = 0; pixel_index < gift.amount; pixel_index++) {
                sources.push({
                    key: `${gift.id}:${pixel_index}`,
                    name: gift.from.name,
                    user_id: gift.from.user_id,
                    avatar_url: gift.from.avatar_url ? sized_avatar_url(gift.from.avatar_url) : null,
                });
            }
        }

        return sources;
    }, [gifts]);

    const capacity = jar_capacity(width, max_height);
    const visible_sources = useMemo(() => ball_sources.slice(0, capacity), [ball_sources, capacity]);
    const hidden_count = ball_sources.length - visible_sources.length;

    const height = jar_height_for(visible_sources.length, width, min_height, max_height);

    const bounds_ref = useRef<JarBounds>({width, height});
    useEffect(() => {
        bounds_ref.current = {width, height};
    }, [width, height]);

    const sender_summary = useMemo(() => {
        const counts = new Map<string, number>();

        for (const source of ball_sources) {
            counts.set(source.name, (counts.get(source.name) ?? 0) + 1);
        }

        return Array.from(counts.entries()).map(([name, count]) => `${count} from ${name}`).join(", ");
    }, [ball_sources]);

    // sync balls with held gifts: drop spent or expired ones, drop new ones in from the top
    useEffect(() => {
        const visible_keys = new Set(visible_sources.map((source) => source.key));
        const existing_balls = balls_ref.current.filter((ball) => visible_keys.has(ball.key));
        const existing_keys = new Set(existing_balls.map((ball) => ball.key));

        let added_any = false;

        for (const source of visible_sources) {
            if (existing_keys.has(source.key)) {
                continue;
            }

            existing_balls.push({
                key: source.key,
                name: source.name,
                avatar_url: source.avatar_url,
                hue: hue_from_id(source.user_id),
                x: BALL_RADIUS + Math.random() * Math.max(0, bounds_ref.current.width - BALL_RADIUS * 2),
                y: BALL_RADIUS,
                velocity_x: (Math.random() - 0.5) * 60,
                velocity_y: 0,
                angle: Math.random() * Math.PI * 2,
            });

            if (source.avatar_url && !images_ref.current.has(source.avatar_url)) {
                const image = new Image();
                image.src = source.avatar_url;
                images_ref.current.set(source.avatar_url, image);
            }

            added_any = true;
        }

        // jostle the balls already in the jar when something lands
        if (added_any) {
            for (const ball of existing_balls) {
                if (existing_keys.has(ball.key)) {
                    ball.velocity_x += (Math.random() - 0.5) * ARRIVAL_SHAKE_SPEED;
                }
            }
        }

        balls_ref.current = existing_balls;
    }, [visible_sources]);

    // physics and drawing loop
    useEffect(() => {
        let animation_frame = 0;
        let last_time = performance.now();

        const tick = (now: number) => {
            const delta_seconds = Math.min((now - last_time) / 1000, MAX_FRAME_SECONDS);
            last_time = now;

            const canvas = canvas_ref.current;
            const context = canvas?.getContext("2d");
            const bounds = bounds_ref.current;

            if (canvas && context) {
                const pixel_ratio = window.devicePixelRatio || 1;

                if (canvas.width !== bounds.width * pixel_ratio || canvas.height !== bounds.height * pixel_ratio) {
                    canvas.width = bounds.width * pixel_ratio;
                    canvas.height = bounds.height * pixel_ratio;
                }

                context.setTransform(pixel_ratio, 0, 0, pixel_ratio, 0, 0);

                step_physics(balls_ref.current, delta_seconds, bounds);
                draw_balls(context, balls_ref.current, images_ref.current, bounds);
            }

            animation_frame = requestAnimationFrame(tick);
        };

        animation_frame = requestAnimationFrame(tick);

        return () => cancelAnimationFrame(animation_frame);
    }, []);

    // keep the expiry in the tooltip current while holding gifts
    useEffect(() => {
        if (next_expiry === null) {
            return;
        }

        const interval = setInterval(() => setCurrentTime(Date.now()), 1000);
        return () => clearInterval(interval);
    }, [next_expiry]);

    const poke = () => {
        for (const ball of balls_ref.current) {
            ball.velocity_y -= POKE_SPEED * (0.6 + Math.random() * 0.6);
            ball.velocity_x += (Math.random() - 0.5) * POKE_SPEED;
        }
    };

    const tooltip = [
        ball_sources.length > 0 ? `Held gifts: ${sender_summary}` : null,
        hidden_count > 0 ? `${hidden_count} more not shown` : null,
        next_expiry !== null ? `Next one expires in ${format_remaining(next_expiry - current_time)}` : null,
        ball_sources.length > 0 ? "Click to shake" : null,
    ].filter(Boolean).join("\n");

    return (
        <button
            type="button"
            className="block cursor-pointer rounded-2xl bg-white/5 border border-white/10 overflow-hidden"
            onClick={poke}
            title={tooltip || undefined}
        >
            <canvas
                ref={canvas_ref}
                className="block"
                style={{width, height}}
            />
        </button>
    );
};

export default GiftJar;