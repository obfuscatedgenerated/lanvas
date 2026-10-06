"use client";

import {useEffect, useRef, useState} from "react";

import {socket} from "@/socket";
import type {Author} from "@/types";

const FEED_ITEM_DURATION_MS = 6000;
const MAX_FEED_ITEMS = 4;
const BANNER_DURATION_MS = 4500;

interface CasinoResult {
    outcome_id: string;
    kind: "win" | "weird" | "bust";
    spinner: Author;
    message: string;
    announce: "feed" | "banner";
}

interface FeedItem {
    id: number;
    message: string;
    kind: CasinoResult["kind"];
}

const KIND_BORDER: Record<CasinoResult["kind"], string> = {
    win: "border-emerald-500/60",
    weird: "border-yellow-400/60",
    bust: "border-rose-500/60",
};

// everyone's spin results: a quiet feed for ordinary ones, a big banner for rare ones
const CasinoAnnouncements = () => {
    const [feed_items, setFeedItems] = useState<FeedItem[]>([]);
    const [banner, setBanner] = useState<FeedItem | null>(null);

    const next_id_ref = useRef(0);
    const banner_timeout_ref = useRef<NodeJS.Timeout | null>(null);
    const feed_timeouts_ref = useRef<Set<NodeJS.Timeout>>(new Set());

    useEffect(() => {
        const feed_timeouts = feed_timeouts_ref.current;

        const handle_result = ({kind, message, announce}: CasinoResult) => {
            const item: FeedItem = {id: next_id_ref.current++, message, kind};

            if (announce === "banner") {
                if (banner_timeout_ref.current) {
                    clearTimeout(banner_timeout_ref.current);
                }

                setBanner(item);
                banner_timeout_ref.current = setTimeout(() => setBanner(null), BANNER_DURATION_MS);
                return;
            }

            setFeedItems((previous) => [...previous, item].slice(-MAX_FEED_ITEMS));

            const timeout = setTimeout(() => {
                setFeedItems((previous) => previous.filter((feed_item) => feed_item.id !== item.id));
                feed_timeouts.delete(timeout);
            }, FEED_ITEM_DURATION_MS);

            feed_timeouts.add(timeout);
        };

        socket.on("casino_result", handle_result);

        return () => {
            socket.off("casino_result", handle_result);

            if (banner_timeout_ref.current) {
                clearTimeout(banner_timeout_ref.current);
            }

            for (const timeout of feed_timeouts) {
                clearTimeout(timeout);
            }

            feed_timeouts.clear();
        };
    }, []);

    return (
        <>
            {/* sits below the gift banner so the two can show at once */}
            {banner && (
                <div
                    key={banner.id}
                    className="fixed top-30 left-1/2 -translate-x-1/2 z-9999 pointer-events-none select-none font-sans transition-all duration-300 starting:opacity-0 starting:scale-90"
                    role="status"
                >
                    <div className={`text-lg font-bold text-center bg-neutral-900/85 backdrop-blur-sm border-2 ${KIND_BORDER[banner.kind]} rounded-2xl px-6 py-3 shadow-lg max-w-[90vw]`}>
                        {banner.message}
                    </div>
                </div>
            )}

            {/* hidden on small screens where it would cover the canvas */}
            <div className="hidden sm:flex fixed top-20 left-4 z-40 flex-col gap-1.5 pointer-events-none select-none font-sans text-sm" aria-live="polite">
                {feed_items.map((item) => (
                    <div
                        key={item.id}
                        className={`w-fit max-w-sm bg-neutral-900/70 backdrop-blur-sm border ${KIND_BORDER[item.kind]} rounded-lg px-3 py-1.5 transition-all duration-300 starting:opacity-0 starting:-translate-x-4`}
                    >
                        🎰 {item.message}
                    </div>
                ))}
            </div>
        </>
    );
};

export default CasinoAnnouncements;