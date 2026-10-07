"use client";

import {useEffect, useState} from "react";

import {socket} from "@/socket";

interface ActiveEffect {
    id: string;
    label: string;
    ends_at: number;
}

interface ChaosEffectMessage {
    id: string;
    label: string;
    remaining_ms: number;
}

const ChaosEffects = () => {
    const [effects, setEffects] = useState<ActiveEffect[]>([]);

    useEffect(() => {
        const handle_effects = (list: ChaosEffectMessage[]) => {
            const now = Date.now();

            setEffects(
                list
                    .filter((effect) => effect.remaining_ms > 0)
                    .map((effect) => ({id: effect.id, label: effect.label, ends_at: now + effect.remaining_ms}))
            );
        };

        socket.on("chaos_effects", handle_effects);

        // sync whatever is already active on mount (and on reconnect)
        socket.emit("check_chaos_effects");

        return () => {
            socket.off("chaos_effects", handle_effects);
        };
    }, []);

    // tick to refresh countdowns and drop effects that have run out, without waiting on a server message
    useEffect(() => {
        if (effects.length === 0) {
            return;
        }

        const interval = setInterval(() => {
            setEffects((previous) => previous.filter((effect) => effect.ends_at > Date.now()));
        }, 500);

        return () => clearInterval(interval);
    }, [effects.length]);

    if (effects.length === 0) {
        return null;
    }

    const now = Date.now();

    return (
        <div className="font-sans fixed top-16 left-4 z-40 pointer-events-none select-none flex flex-col gap-1.5 max-w-[80vw] sm:max-w-md">
            <div className="text-xs font-bold tracking-wide uppercase text-purple-300">⚡ Chaos mode</div>

            {effects.map((effect) => {
                const remaining_ms = Math.max(0, effect.ends_at - now);

                return (
                    <div
                        key={effect.id}
                        className="flex items-center justify-between gap-3 bg-purple-900/75 backdrop-blur-sm border border-purple-400/70 rounded-lg px-3 py-1.5 text-sm shadow-[0_0_15px_2px_rgba(168,85,247,0.3)] transition-all duration-300 starting:opacity-0 starting:-translate-x-4"
                    >
                        <span className="min-w-0 break-words">{effect.label}</span>
                        <span className="shrink-0 tabular-nums text-purple-200">{Math.ceil(remaining_ms / 1000)}s</span>
                    </div>
                );
            })}
        </div>
    );
};

export default ChaosEffects;
