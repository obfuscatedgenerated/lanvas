"use client";

import {useEffect, useMemo, useRef, useState} from "react";

import type {HeldGift} from "@/types";

// jar interior, in css pixels
const JAR_WIDTH = 104;
const JAR_HEIGHT = 124;

const BALL_RADIUS = 12;
const MAX_VISIBLE_BALLS = 20;

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

interface GiftJarProps {
    gifts: HeldGift[];
    next_expiry: number | null;
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

const random_spawn_x = (): number => BALL_RADIUS + Math.random() * (JAR_WIDTH - BALL_RADIUS * 2);

const step_physics = (balls: Ball[], delta_seconds: number) => {
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
            } else if (ball.x > JAR_WIDTH - BALL_RADIUS) {
                ball.x = JAR_WIDTH - BALL_RADIUS;
                ball.velocity_x = -Math.abs(ball.velocity_x) * RESTITUTION;
            }

            if (ball.y > JAR_HEIGHT - BALL_RADIUS) {
                ball.y = JAR_HEIGHT - BALL_RADIUS;
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

const draw_balls = (context: CanvasRenderingContext2D, balls: Ball[], images: Map<string, HTMLImageElement>) => {
    context.clearRect(0, 0, JAR_WIDTH, JAR_HEIGHT);

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

const GiftJar = ({gifts, next_expiry}: GiftJarProps) => {
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

    const total_pixels = ball_sources.length;
    const visible_sources = useMemo(() => ball_sources.slice(0, MAX_VISIBLE_BALLS), [ball_sources]);
    const hidden_count = total_pixels - visible_sources.length;

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
                x: random_spawn_x(),
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

            if (canvas && context) {
                const pixel_ratio = window.devicePixelRatio || 1;

                if (canvas.width !== JAR_WIDTH * pixel_ratio || canvas.height !== JAR_HEIGHT * pixel_ratio) {
                    canvas.width = JAR_WIDTH * pixel_ratio;
                    canvas.height = JAR_HEIGHT * pixel_ratio;
                }

                context.setTransform(pixel_ratio, 0, 0, pixel_ratio, 0, 0);

                step_physics(balls_ref.current, delta_seconds);
                draw_balls(context, balls_ref.current, images_ref.current);
            }

            animation_frame = requestAnimationFrame(tick);
        };

        animation_frame = requestAnimationFrame(tick);

        return () => cancelAnimationFrame(animation_frame);
    }, []);

    // tick the expiry countdown while holding gifts
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

    const has_gifts = total_pixels > 0;

    return (
        <div
            className={`font-sans fixed bottom-72 sm:bottom-40 right-1.5 sm:right-4 flex flex-col items-center gap-1 select-none transition-opacity duration-300 ${has_gifts ? "opacity-100" : "opacity-0 pointer-events-none"}`}
            title={has_gifts ? `Held gifts: ${sender_summary}` : undefined}
            aria-hidden={!has_gifts}
        >
            <div className="text-xs bg-neutral-900/70 backdrop-blur-sm border border-neutral-800/70 rounded-full px-2 py-0.5 whitespace-nowrap">
                🎁 ×{total_pixels}
                {hidden_count > 0 && <span className="text-neutral-400"> (+{hidden_count} not shown)</span>}
                {next_expiry !== null && (
                    <span className="text-neutral-400"> · {format_remaining(next_expiry - current_time)}</span>
                )}
            </div>

            {/* lid */}
            <div className="h-2 rounded-t-md bg-neutral-400/50" style={{width: JAR_WIDTH - 16}} />

            <button
                type="button"
                className="cursor-pointer border-2 border-t-0 border-white/25 bg-white/5 backdrop-blur-sm rounded-b-2xl rounded-t-sm overflow-hidden"
                onClick={poke}
                title="Shake the jar"
            >
                <canvas
                    ref={canvas_ref}
                    className="block"
                    style={{width: JAR_WIDTH, height: JAR_HEIGHT}}
                />
            </button>
        </div>
    );
};

export default GiftJar;