"use client";

import Image from "next/image";
import {useEffect, useRef, useState} from "react";

import {socket} from "@/socket";
import type {Author} from "@/types";
import {play_sound} from "@/lib/sfx";

const BANNER_DURATION_MS = 3500;
const BANNER_FADE_MS = 300;

// briefly announces a received gift at the top of the screen, stacking repeat gifts from the same sender
const GiftedBanner = () => {
    const [sender, setSender] = useState<Author | null>(null);
    const [count, setCount] = useState(0);
    const [visible, setVisible] = useState(false);

    const visible_ref = useRef(false);
    const last_sender_id_ref = useRef<string | null>(null);

    const hide_timeout_ref = useRef<NodeJS.Timeout | null>(null);
    const clear_timeout_ref = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        const clear_timers = () => {
            if (hide_timeout_ref.current) {
                clearTimeout(hide_timeout_ref.current);
            }

            if (clear_timeout_ref.current) {
                clearTimeout(clear_timeout_ref.current);
            }
        };

        const handle_gift_received = ({from, amount = 1}: {from: Author; amount?: number}) => {
            clear_timers();

            // count pixels rather than gifts, so a single triple win and three separate gifts are the same
            const is_repeat = visible_ref.current && last_sender_id_ref.current === from.user_id;
            setCount((previous) => is_repeat ? previous + amount : amount);

            last_sender_id_ref.current = from.user_id;
            visible_ref.current = true;

            setSender(from);
            setVisible(true);

            hide_timeout_ref.current = setTimeout(() => {
                visible_ref.current = false;
                setVisible(false);

                // unmount once the fade out has finished
                clear_timeout_ref.current = setTimeout(() => setSender(null), BANNER_FADE_MS);
            }, BANNER_DURATION_MS);

            play_sound("gift");
        };

        socket.on("gift_received", handle_gift_received);

        return () => {
            socket.off("gift_received", handle_gift_received);
            clear_timers();
        };
    }, []);

    if (!sender) {
        return null;
    }

    return (
        <div
            className={`fixed top-16 left-1/2 -translate-x-1/2 z-9999 pointer-events-none select-none font-sans transition-all duration-300 starting:opacity-0 starting:-translate-y-4 ${visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4"}`}
            role="status"
        >
            <div className="flex items-center gap-3 bg-neutral-900/80 backdrop-blur-sm border border-emerald-500/60 rounded-full pl-3 pr-5 py-2 shadow-lg">
                <span className="text-2xl" aria-hidden>🎁</span>

                {sender.avatar_url && (
                    <Image src={sender.avatar_url} alt="" draggable={false} width={28} height={28} className="rounded-full" />
                )}

                <span>
                    <strong>{sender.name}</strong> gifted you {count === 1 ? "a pixel" : <span className="text-emerald-400 font-semibold">{count} pixels</span>}!
                </span>
            </div>
        </div>
    );
};

export default GiftedBanner;
