import {useEffect, useRef, useState} from "react";
import {socket} from "@/socket";
import {AdwarePrank} from "@/components/AdwarePrank";
import {set_page_flipped} from "@/lib/page_flip";

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

    useEffect(() => {
        const clear_adware_timers = () => {
            adware_timers.current.forEach(clearTimeout);
            adware_timers.current = [];
        };

        const apply = ({prank, remaining_ms}: PrankMessage) => {
            if (prank === "adware") {
                clear_adware_timers();

                if (remaining_ms <= 0) {
                    setAdwareEnabled(false);
                    setAdwareRender(false);
                    return;
                }

                setAdwareRender(true);
                setAdwareEnabled(true);

                adware_timers.current.push(setTimeout(() => setAdwareEnabled(false), Math.max(0, remaining_ms - ADWARE_SPAWN_LEAD_MS)));
                adware_timers.current.push(setTimeout(() => setAdwareRender(false), remaining_ms));
            } else if (prank === "upside_down") {
                if (flip_timer.current) {
                    clearTimeout(flip_timer.current);
                    flip_timer.current = null;
                }

                if (remaining_ms <= 0) {
                    set_page_flipped(false);
                    return;
                }

                set_page_flipped(true);
                flip_timer.current = setTimeout(() => set_page_flipped(false), remaining_ms);
            }
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
        </>
    );
}
