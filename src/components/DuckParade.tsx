"use client";

import {useCallback, useEffect, useRef, useState} from "react";

import {socket} from "@/socket";
import type {Author} from "@/types";

// how long a duck makes a nuisance of itself before going off
const DUCK_LIFETIME_MS = 40000;

// the duck swells and trembles for this long before it explodes, as a warning
const SWELL_DURATION_MS = 2000;
const SWELL_SCALE = 1.7;

const EXPLOSION_DURATION_MS = 1200;
const FEATHER_COUNT = 10;

// more than this at once and the screen is just ducks
const MAX_DUCKS = 6;

const DUCK_SIZE_PX = 48;

const WALK_SPEED_MIN = 70; // px per second
const WALK_SPEED_MAX = 160;
const HOP_SPEED_MIN = 380;
const HOP_SPEED_MAX = 620;
const GRAVITY = 1400; // px per second squared

// chance per second of each random behaviour
const TURN_CHANCE = 0.35;
const HOP_CHANCE = 0.7;

const WADDLE_PERIOD_MS = 380;
const MAX_FRAME_SECONDS = 1 / 30;

interface Duck {
    id: number;
    summoner: string;
}

interface ExplosionPoint {
    x: number;
    y: number;
}

const random_between = (minimum: number, maximum: number): number => minimum + Math.random() * (maximum - minimum);

// feathers and a bang where the duck used to be
const DuckExplosion = ({point, on_finished}: {point: ExplosionPoint; on_finished: () => void}) => {
    const bang_ref = useRef<HTMLSpanElement>(null);
    const feather_refs = useRef<(HTMLSpanElement | null)[]>([]);

    useEffect(() => {
        const animations: Animation[] = [];

        if (bang_ref.current) {
            animations.push(bang_ref.current.animate(
                [
                    {transform: "translate(-50%, 50%) scale(0.3)", opacity: 1},
                    {transform: "translate(-50%, 50%) scale(1.8)", opacity: 1, offset: 0.35},
                    {transform: "translate(-50%, 50%) scale(2.2)", opacity: 0},
                ],
                {duration: EXPLOSION_DURATION_MS, easing: "ease-out", fill: "forwards"},
            ));
        }

        feather_refs.current.forEach((feather, feather_index) => {
            if (!feather) {
                return;
            }

            // spread evenly round a circle with a little wobble, biased upwards since the ground is in the way
            const angle = (feather_index / FEATHER_COUNT) * Math.PI * 2 + random_between(-0.3, 0.3);
            const distance = random_between(60, 140);
            const offset_x = Math.cos(angle) * distance;
            const offset_y = -Math.abs(Math.sin(angle)) * distance - 20;

            animations.push(feather.animate(
                [
                    {transform: "translate(-50%, 50%) rotate(0deg)", opacity: 1},
                    {transform: `translate(calc(-50% + ${offset_x}px), calc(50% + ${offset_y}px)) rotate(${random_between(-240, 240)}deg)`, opacity: 0},
                ],
                {duration: EXPLOSION_DURATION_MS, easing: "cubic-bezier(0.2, 0.7, 0.4, 1)", fill: "forwards"},
            ));
        });

        const finish_timeout = setTimeout(on_finished, EXPLOSION_DURATION_MS);

        return () => {
            clearTimeout(finish_timeout);

            for (const animation of animations) {
                animation.cancel();
            }
        };
    }, [on_finished]);

    return (
        <div
            className="fixed left-0 bottom-3 z-9999 pointer-events-none select-none"
            style={{transform: `translate(${point.x + DUCK_SIZE_PX / 2}px, ${-(point.y + DUCK_SIZE_PX / 2)}px)`}}
            aria-hidden
        >
            <span ref={bang_ref} className="absolute bottom-0 left-0 text-6xl">💥</span>

            {Array.from({length: FEATHER_COUNT}, (_unused, feather_index) => (
                <span
                    key={feather_index}
                    ref={(element) => {
                        feather_refs.current[feather_index] = element;
                    }}
                    className="absolute bottom-0 left-0 text-2xl"
                >
                    🪶
                </span>
            ))}
        </div>
    );
};

// wanders along the bottom of the screen, hopping and turning at random, then explodes
const WanderingDuck = ({duck, on_finished}: {duck: Duck; on_finished: () => void}) => {
    const walker_ref = useRef<HTMLDivElement>(null);
    const body_ref = useRef<HTMLSpanElement>(null);

    const [explosion_point, setExplosionPoint] = useState<ExplosionPoint | null>(null);

    useEffect(() => {
        const walker = walker_ref.current;
        const body = body_ref.current;
        if (!walker || !body) {
            return;
        }

        const waddle = body.animate(
            [{rotate: "-12deg"}, {rotate: "12deg"}],
            {duration: WADDLE_PERIOD_MS, iterations: Infinity, direction: "alternate", easing: "ease-in-out"},
        );

        // enter from a random side, heading inwards
        const enters_from_left = Math.random() < 0.5;
        let position_x = enters_from_left ? 0 : window.innerWidth - DUCK_SIZE_PX;
        let velocity_x = random_between(WALK_SPEED_MIN, WALK_SPEED_MAX) * (enters_from_left ? 1 : -1);
        let height = 0;
        let velocity_y = 0;

        const spawned_at = performance.now();
        let last_time = spawned_at;
        let animation_frame = 0;

        const tick = (now: number) => {
            const delta_seconds = Math.min((now - last_time) / 1000, MAX_FRAME_SECONDS);
            last_time = now;

            const age_ms = now - spawned_at;

            if (age_ms >= DUCK_LIFETIME_MS) {
                waddle.cancel();
                setExplosionPoint({x: position_x, y: height});
                return;
            }

            const swelling = age_ms >= DUCK_LIFETIME_MS - SWELL_DURATION_MS;

            // stops wandering to swell, so the warning is easy to see
            if (!swelling) {
                if (Math.random() < TURN_CHANCE * delta_seconds) {
                    velocity_x = -Math.sign(velocity_x) * random_between(WALK_SPEED_MIN, WALK_SPEED_MAX);
                }

                if (height === 0 && Math.random() < HOP_CHANCE * delta_seconds) {
                    velocity_y = random_between(HOP_SPEED_MIN, HOP_SPEED_MAX);
                }

                position_x += velocity_x * delta_seconds;
            }

            velocity_y -= GRAVITY * delta_seconds;
            height = Math.max(0, height + velocity_y * delta_seconds);

            if (height === 0) {
                velocity_y = 0;
            }

            // bounce off the screen edges, re-read each frame in case the window was resized
            const right_edge = window.innerWidth - DUCK_SIZE_PX;

            if (position_x < 0) {
                position_x = 0;
                velocity_x = Math.abs(velocity_x);
            } else if (position_x > right_edge) {
                position_x = right_edge;
                velocity_x = -Math.abs(velocity_x);
            }

            walker.style.transform = `translate(${position_x}px, ${-height}px)`;

            // the emoji faces left, so it's mirrored while walking right
            const facing = velocity_x > 0 ? -1 : 1;

            if (swelling) {
                const swell_progress = (age_ms - (DUCK_LIFETIME_MS - SWELL_DURATION_MS)) / SWELL_DURATION_MS;
                const scale = 1 + (SWELL_SCALE - 1) * swell_progress;
                const tremble = random_between(-1, 1) * 3 * swell_progress;

                body.style.transform = `translateX(${tremble}px) scale(${facing * scale}, ${scale})`;
                body.style.filter = `saturate(${1 + swell_progress}) hue-rotate(${-30 * swell_progress}deg)`;
            } else {
                body.style.transform = `scaleX(${facing})`;
            }

            animation_frame = requestAnimationFrame(tick);
        };

        animation_frame = requestAnimationFrame(tick);

        return () => {
            cancelAnimationFrame(animation_frame);
            waddle.cancel();
        };
    }, []);

    if (explosion_point) {
        return <DuckExplosion point={explosion_point} on_finished={on_finished} />;
    }

    return (
        <div
            ref={walker_ref}
            className="fixed left-0 bottom-3 z-9999 pointer-events-auto select-none font-sans flex flex-col items-center"
            style={{width: DUCK_SIZE_PX}}
            aria-hidden
        >
            <span className="text-[10px] font-semibold bg-neutral-900/80 rounded-full px-1.5 py-0.5 whitespace-nowrap mb-0.5">
                {duck.summoner}&apos;s duck
            </span>

            <span ref={body_ref} className="text-5xl leading-none inline-block origin-bottom">🦆</span>
        </div>
    );
};

const DuckParade = () => {
    const [ducks, setDucks] = useState<Duck[]>([]);
    const next_id_ref = useRef(0);

    useEffect(() => {
        const handle_result = ({outcome_id, spinner}: {outcome_id: string; spinner: Author}) => {
            if (outcome_id !== "duck") {
                return;
            }

            const duck: Duck = {id: next_id_ref.current++, summoner: spinner.name};
            setDucks((previous) => previous.length >= MAX_DUCKS ? previous : [...previous, duck]);
        };

        socket.on("casino_result", handle_result);

        return () => {
            socket.off("casino_result", handle_result);
        };
    }, []);

    const remove_duck = useCallback((duck_id: number) => {
        setDucks((previous) => previous.filter((duck) => duck.id !== duck_id));
    }, []);

    return (
        <>
            {ducks.map((duck) => (
                <DuckWithFinish key={duck.id} duck={duck} remove_duck={remove_duck} />
            ))}
        </>
    );
};

// gives each duck a stable finish callback, so re-renders of the parade never restart an explosion
const DuckWithFinish = ({duck, remove_duck}: {duck: Duck; remove_duck: (duck_id: number) => void}) => {
    const on_finished = useCallback(() => remove_duck(duck.id), [remove_duck, duck.id]);

    return <WanderingDuck duck={duck} on_finished={on_finished} />;
};

export default DuckParade;