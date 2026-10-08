import {useEffect, useRef, useState} from "react";
import {socket} from "@/socket";
import {AdwarePrank} from "@/components/AdwarePrank";
import {
    set_page_flipped,
    set_page_glorped,
    set_page_grayscale,
    set_page_inverted,
    set_page_no_glasses
} from "@/lib/page_pranks";

interface PrankMessage {
    prank: string;
    remaining_ms: number;
}

// stop spawning new ads this long before the end, so the last ones have time to be dismissed
const ADWARE_SPAWN_LEAD_MS = 15000;

export const Pranks = () => {
    const [adware_render, setAdwareRender] = useState(false);
    const [adware_enabled, setAdwareEnabled] = useState(false);

    const adware_timers = useRef<NodeJS.Timeout[]>([]);

    const flip_timer = useRef<NodeJS.Timeout | null>(null);
    const invert_timer = useRef<NodeJS.Timeout | null>(null);
    const grayscale_timer = useRef<NodeJS.Timeout | null>(null);
    const glorp_timer = useRef<NodeJS.Timeout | null>(null);
    const no_glasses_timer = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        const clear_adware_timers = () => {
            adware_timers.current.forEach(clearTimeout);
            adware_timers.current = [];
        };

        // helper to produce handlers for simple timed on/off pranks
        const make_timed_handler =
            (timer_ref: { current: NodeJS.Timeout | null }, set_fn: (v: boolean) => void) =>
                (remaining_ms: number) => {
                    if (timer_ref.current) {
                        clearTimeout(timer_ref.current);
                        timer_ref.current = null;
                    }

                    if (remaining_ms <= 0) {
                        set_fn(false);
                        return;
                    }

                    set_fn(true);
                    timer_ref.current = setTimeout(() => set_fn(false), remaining_ms);
                };

        const handlers: Record<string, (remaining_ms: number) => void> = {
            adware: (remaining_ms: number) => {
                clear_adware_timers();

                if (remaining_ms <= 0) {
                    setAdwareEnabled(false);
                    setAdwareRender(false);
                    return;
                }

                setAdwareRender(true);
                setAdwareEnabled(true);

                adware_timers.current.push(
                    setTimeout(() => setAdwareEnabled(false), Math.max(0, remaining_ms - ADWARE_SPAWN_LEAD_MS))
                );
                adware_timers.current.push(setTimeout(() => setAdwareRender(false), remaining_ms));
            },

            upside_down: make_timed_handler(flip_timer, set_page_flipped),
            invert: make_timed_handler(invert_timer, set_page_inverted),
            grayscale: make_timed_handler(grayscale_timer, set_page_grayscale),
            glorp: make_timed_handler(glorp_timer, set_page_glorped),
            no_glasses: make_timed_handler(no_glasses_timer, set_page_no_glasses),
        };

        const apply = ({prank, remaining_ms}: PrankMessage) => {
            const fn = handlers[prank];
            if (fn) fn(remaining_ms);
        };

        const handle_prank = (message: PrankMessage) => apply(message);
        const handle_pranks = (list: PrankMessage[]) => list.forEach(apply);

        socket.on("prank", handle_prank);
        socket.on("pranks", handle_pranks);

        // pull whatever is already in force, so a reload or late join doesn't escape it
        socket.emit("check_pranks");

        return () => {
            socket.off("prank", handle_prank);
            socket.off("pranks", handle_pranks);
        };
    }, []);

    return (
        <>
            {adware_render && <AdwarePrank enabled={adware_enabled} />}
            <div id="glorpverlay" />
        </>
    );
}