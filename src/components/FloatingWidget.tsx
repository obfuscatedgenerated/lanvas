"use client";

import {useState, useEffect, useRef} from "react";

import {CircularProgressbar} from "react-circular-progressbar";
import "react-circular-progressbar/dist/styles.css";

import colors from "tailwindcss/colors";
import {Gift} from "lucide-react";

import ColorPicker from "@/components/ColorPicker";
import GiftJar from "@/components/GiftJar";
import {GiftingPopup} from "@/components/GiftingPopup";

import usePublicConfigValue from "@/hooks/usePublicConfigValue";
import {CONFIG_KEY_GIFTING_ENABLED} from "@/consts";
import {DEFAULT_GIFTING_ENABLED} from "@/defaults";

import type {HeldGift} from "@/types";
import {useElementWidth} from "@/hooks/useElementWidth";

const COOLDOWN_UPDATE_INTERVAL_MS = 100;
const READY_FLASH_MS = 900;

const JAR_BORDER_PX = 1;
const JAR_MIN_HEIGHT_PX = 48;
const JAR_MAX_HEIGHT_PX = 122;

export interface Cooldown {
    start_time: number;
    duration: number;
}

interface FloatingWidgetProps {
    current_color: string;
    on_color_change: (color: string) => void;

    // null when your own pixel is ready
    cooldown: Cooldown | null;

    gifts: HeldGift[];
    next_gift_expiry: number | null;

    // short gap enforced between gift placements, null when the next gift can be spent
    burst: Cooldown | null;

    grid_lines_enabled: boolean;
    set_grid_lines_enabled: (enabled: boolean) => void;
}

// milliseconds left on your own pixel's cooldown, ticking while one is active
const useRemainingMs = (start_time: number | null, duration: number | null): number => {
    const [remaining_ms, setRemainingMs] = useState(0);

    useEffect(() => {
        if (start_time === null || duration === null) {
            setRemainingMs(0);
            return;
        }

        const update = () => setRemainingMs(Math.max(0, start_time + duration - Date.now()));
        update();

        const interval = setInterval(update, COOLDOWN_UPDATE_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [start_time, duration]);

    return remaining_ms;
};

const seconds_label = (remaining_ms: number): string => `${Math.ceil(remaining_ms / 1000)}s`;

// red only ever means "you can't place right now"
const BlockedRing = ({remaining_ms, duration}: {remaining_ms: number; duration: number}) => {
    const percentage = duration > 0 ? 100 * remaining_ms / duration : 0;

    return (
        <>
            <div className="absolute -inset-1.5 pointer-events-none">
                <CircularProgressbar
                    value={percentage}
                    strokeWidth={8}
                    styles={{
                        trail: {stroke: "transparent"},
                        path: {stroke: colors.rose[400], transition: "none"},
                    }}
                />
            </div>

            <span className="font-sans absolute -top-2 -left-2 pointer-events-none select-none text-xs font-semibold bg-neutral-900 border border-rose-400/70 rounded-full px-1.5 py-0.5">
                {seconds_label(remaining_ms)}
            </span>
        </>
    );
};

const FloatingWidget = ({current_color, on_color_change, cooldown, burst, gifts, next_gift_expiry, grid_lines_enabled, set_grid_lines_enabled}: FloatingWidgetProps) => {
    const gifting_enabled = usePublicConfigValue(CONFIG_KEY_GIFTING_ENABLED, DEFAULT_GIFTING_ENABLED);
    const [gifting_popup_open, setGiftingPopupOpen] = useState(false);

    const in_cooldown = cooldown != null;
    const remaining_ms = useRemainingMs(cooldown?.start_time ?? null, cooldown?.duration ?? null);

    const burst_remaining_ms = useRemainingMs(burst?.start_time ?? null, burst?.duration ?? null);
    const burst_percentage = burst && burst.duration > 0 ? 100 * burst_remaining_ms / burst.duration : 0;

    const [button_row_ref, button_row_width] = useElementWidth<HTMLDivElement>();

    const gift_balance = gifts.reduce((total, gift) => total + gift.amount, 0);
    const has_gifts = gift_balance > 0;

    // your next click spends a gift only while your own pixel is recharging
    const spending_gift = in_cooldown && has_gifts;
    const blocked = in_cooldown && !has_gifts;

    const caption = in_cooldown
        ? <>Can use 🎁 <span className="text-neutral-500">· Yours in {seconds_label(remaining_ms)}</span></>
        : <>Ready! <span className="text-neutral-500">· 🎁 {gift_balance} spare</span></>;

    // flash the picker when your own pixel becomes ready again
    const [ready_flash, setReadyFlash] = useState(false);
    const was_in_cooldown_ref = useRef(in_cooldown);

    useEffect(() => {
        const finished_cooldown = was_in_cooldown_ref.current && !in_cooldown;
        was_in_cooldown_ref.current = in_cooldown;

        if (!finished_cooldown) {
            return;
        }

        setReadyFlash(true);
        const timeout = setTimeout(() => setReadyFlash(false), READY_FLASH_MS);

        return () => {
            clearTimeout(timeout);
            setReadyFlash(false);
        };
    }, [in_cooldown]);

    return (
        <>
            {/* the panel only shows its background while it's holding the jar, otherwise it's just the two buttons */}
            <div className={`font-sans fixed bottom-53 sm:bottom-20.5 right-6 sm:right-8 flex flex-col p-3 rounded-[42px] border transition-colors duration-300 ${has_gifts ? "bg-neutral-900/70 border-neutral-800/70 backdrop-blur-sm" : "bg-transparent border-transparent"}`}>
                <div className={`grid transition-[grid-template-rows] duration-300 ${has_gifts ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                    <div className="min-h-0 overflow-hidden" aria-hidden={!has_gifts}>
                        <GiftJar
                            gifts={gifts}
                            next_expiry={next_gift_expiry}
                            width={Math.max(0, button_row_width - JAR_BORDER_PX * 2)}
                            min_height={JAR_MIN_HEIGHT_PX}
                            max_height={JAR_MAX_HEIGHT_PX}
                        />

                        <div className="mx-3 mt-1.5 h-0.5 rounded-full overflow-hidden" aria-hidden>
                            <div
                                className="h-full rounded-full bg-yellow-300/80"
                                style={{width: `${burst_percentage}%`}}
                            />
                        </div>

                        <p className="text-xs text-neutral-300 text-center whitespace-nowrap select-none py-2">
                            {has_gifts && caption}
                        </p>
                    </div>
                </div>

                <div ref={button_row_ref} className="flex items-center gap-4">
                    {gifting_enabled && (
                        <div className="relative w-15 h-15 rounded-full bg-neutral-700">
                            <button
                                className="w-full h-full flex items-center justify-center text-white outline-yellow-300 outline-1 cursor-pointer text-sm font-semibold hover:bg-yellow-600 hover:drop-shadow-[0_0_10px_rgba(207,170,11,0.9)] transition-colors rounded-full disabled:opacity-40 disabled:cursor-not-allowed disabled:outline-neutral-500 disabled:hover:bg-transparent disabled:hover:drop-shadow-none"
                                title={in_cooldown ? "Your pixel isn't ready to gift yet" : "Gift your pixel to another user..."}
                                disabled={in_cooldown}
                                onClick={() => setGiftingPopupOpen(true)}
                            >
                                <Gift />
                            </button>
                        </div>
                    )}

                    <div className={`relative w-15 h-15 rounded-full bg-neutral-700 ${spending_gift ? "outline-1 outline-yellow-300" : ""}`}>
                        <ColorPicker current_color={current_color} on_color_change={on_color_change} />

                        {blocked && cooldown && <BlockedRing remaining_ms={remaining_ms} duration={cooldown.duration} />}

                        {ready_flash && (
                            <span className="absolute -inset-1 rounded-full border-2 border-emerald-400 animate-ping [animation-iteration-count:1] pointer-events-none" />
                        )}
                    </div>
                </div>
            </div>

            {/* kept outside the panel so its fixed positioning is relative to the screen, not the panel */}
            <GiftingPopup open={gifting_popup_open} on_close={() => setGiftingPopupOpen(false)} in_timeout={in_cooldown} />

            <div className="font-sans fixed bottom-35 sm:bottom-7.5 right-7.5 sm:right-10 bg-neutral-900/70 backdrop-blur-sm border border-neutral-800/70 rounded-lg px-4 py-2">
                <label className="cursor-pointer flex items-center gap-2" title="Shortcut: G">
                    <input
                        type="checkbox"
                        checked={grid_lines_enabled}
                        onChange={(event) => set_grid_lines_enabled(event.target.checked)}
                    />

                    Grid lines
                </label>
            </div>
        </>
    );
}

export default FloatingWidget;