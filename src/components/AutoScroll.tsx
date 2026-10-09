"use client";

import {useEffect, useRef} from "react";

const SPEED_PX_PER_SEC = 28;
const RETURN_MULTIPLIER = 10;
const PAUSE_MS = 2500;
const AutoScroll = ({enabled, className = "", children}: {enabled: boolean; className?: string; children: React.ReactNode}) => {
    const ref = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const element = ref.current;
        if (!element || !enabled) {
            return;
        }

        element.scrollTop = 0;

        let frame = 0;
        let direction = 1; // 1 = down, -1 = up

        // maintain subpixel by working in floats
        let position = 0;
        let pause_until = performance.now() + PAUSE_MS;
        let last = performance.now();

        const tick = (now: number) => {
            // clamp dt so a throttled/backgrounded tab doesn't resume with one giant jump
            const dt = Math.min((now - last) / 1000, 0.05);
            last = now;

            const max = element.scrollHeight - element.clientHeight;

            if (max <= 1) {
                // content fits (or hasn't loaded yet): idle at the top but keep watching
                position = 0;
            } else if (now >= pause_until) {
                const speed = direction === 1 ? SPEED_PX_PER_SEC : SPEED_PX_PER_SEC * RETURN_MULTIPLIER;
                position += direction * speed * dt;

                if (position >= max) {
                    position = max;
                    direction = -1;
                    pause_until = now + PAUSE_MS;
                } else if (position <= 0) {
                    position = 0;
                    direction = 1;
                    pause_until = now + PAUSE_MS;
                }

                element.scrollTop = position;
            }

            frame = requestAnimationFrame(tick);
        };

        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [enabled]);

    return (
        <div ref={ref} className={`${enabled ? "overflow-hidden" : "overflow-y-auto"} ${className}`}>
            {children}
        </div>
    );
};

export default AutoScroll;
