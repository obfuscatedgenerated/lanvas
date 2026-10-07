"use client";

import {useEffect, useMemo, useRef, useState} from "react";

import {CircularProgressbar} from "react-circular-progressbar";
import "react-circular-progressbar/dist/styles.css";

import colors from "tailwindcss/colors";
import {Dices, Gift, Users} from "lucide-react";

import ColorPicker from "@/components/ColorPicker";
import GiftJar from "@/components/GiftJar";
import {GiftingPopup} from "@/components/GiftingPopup";

import {usePublicConfigState} from "@/hooks/usePublicConfigValue";
import useRemainingMs from "@/hooks/useRemainingMs";

import type {Cooldown, HeldGift} from "@/types";
import {useElementWidth} from "@/hooks/useElementWidth";
import {CasinoPopup} from "@/components/CasinoPopup";
import {socket} from "@/socket";

const READY_FLASH_MS = 900;

const JAR_BORDER_PX = 1;
const JAR_MIN_HEIGHT_PX = 48;
const JAR_MAX_HEIGHT_PX = 122;

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

const seconds_label = (remaining_ms: number): string => `${Math.ceil(remaining_ms / 1000)}s`;

// red only ever means "you can't place right now"
const BlockedRing = ({
    remaining_ms,
    duration,
    show_time = true,
    ring_color = colors.rose[400],
    label_border_class = "border-rose-400/70",
    incrementing = false
}: {
    remaining_ms: number;
    duration: number;
    show_time?: boolean;
    ring_color?: string;
    label_border_class?: string
    incrementing?: boolean;
}) => {
    let percentage = duration > 0 ? 100 * remaining_ms / duration : 0;
    if (incrementing) {
        percentage = 100 - percentage;
    }

    return (
        <>
            <div className="absolute -inset-1.5 pointer-events-none">
                <CircularProgressbar
                    value={percentage}
                    strokeWidth={8}
                    styles={{
                        trail: {stroke: "transparent"},
                        path: {stroke: ring_color, transition: "none"},
                    }}
                />
            </div>

            {show_time && (
                <span className={`font-sans absolute -top-2 -left-2 pointer-events-none select-none text-xs font-semibold bg-neutral-900 border ${label_border_class} rounded-full px-1.5 py-0.5`}>
                    {seconds_label(remaining_ms)}
                </span>
            )}
        </>
    );
};

const useCasinoCooldown = (): Cooldown | null => {
    const [cooldown, setCooldown] = useState<Cooldown | null>(null);

    useEffect(() => {
        // relative values converted on receipt, so client clock drift doesn't matter
        const handle_timeout_info = ({remaining_ms, duration_ms}: {remaining_ms: number; duration_ms: number}) => {
            if (remaining_ms <= 0 || duration_ms <= 0) {
                setCooldown(null);
                return;
            }

            const ends_at = Date.now() + remaining_ms;
            setCooldown({start_time: ends_at - duration_ms, duration: duration_ms});
        };

        socket.on("casino_timeout_info", handle_timeout_info);
        socket.emit("check_casino_timeout");

        return () => {
            socket.off("casino_timeout_info", handle_timeout_info);
        };
    }, []);

    // clear it once it runs out, so the button re-enables without waiting for the server
    useEffect(() => {
        if (!cooldown) {
            return;
        }

        const timeout = setTimeout(() => setCooldown(null), cooldown.start_time + cooldown.duration - Date.now());
        return () => clearTimeout(timeout);
    }, [cooldown]);

    return cooldown;
};

const FloatingWidget = ({current_color, on_color_change, cooldown, burst, gifts, next_gift_expiry, grid_lines_enabled, set_grid_lines_enabled}: FloatingWidgetProps) => {
    // keep features hidden until the server confirms, so a secret toggle never flashes on the default
    const {value: gifting_value, loaded: gifting_loaded} = usePublicConfigState("gifting_enabled");
    const {value: casino_value, loaded: casino_loaded} = usePublicConfigState("casino_enabled");
    const gifting_enabled = gifting_loaded && gifting_value;
    const casino_enabled = casino_loaded && casino_value;

    const {value: cooldown_scaling_value, loaded: cooldown_scaling_loaded} = usePublicConfigState("cooldown_scaling_enabled");
    const cooldown_scaling_enabled = cooldown_scaling_loaded && cooldown_scaling_value;

    const [gifting_popup_open, setGiftingPopupOpen] = useState(false);
    const [casino_popup_open, setCasinoPopupOpen] = useState(false);

    const in_cooldown = cooldown != null;
    const remaining_ms = useRemainingMs(cooldown?.start_time ?? null, cooldown?.duration ?? null);

    const burst_remaining_ms = useRemainingMs(burst?.start_time ?? null, burst?.duration ?? null);
    const burst_percentage = burst && burst.duration > 0 ? 100 * burst_remaining_ms / burst.duration : 0;

    const casino_cooldown = useCasinoCooldown();
    const casino_remaining_ms = useRemainingMs(casino_cooldown?.start_time ?? null, casino_cooldown?.duration ?? null);

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

    const [force_white, setForceWhite] = useState(false);
    const [force_rainbow, setForceRainbow] = useState(false);
    const is_color_forced = useMemo(() => force_white || force_rainbow, [force_white, force_rainbow]);

    useEffect(() => {
        const handle_result = ({outcome_id}: {outcome_id: string;}) => {
            if (outcome_id === "eraserhead") {
                setForceWhite(true);
                setTimeout(() => setForceWhite(false), 600000);
                return;
            } else if (outcome_id === "rainbow") {
                setForceRainbow(true);
                setTimeout(() => setForceRainbow(false), 60000);
                return;
            }
        };

        socket.on("casino_own_result", handle_result);

        return () => {
            socket.off("casino_own_result", handle_result);
        };
    }, []);

    useEffect(() => {
        if (force_white) {
            on_color_change("#ffffff");
        }
    }, [force_white, on_color_change]);

    const raf_ref = useRef<number | null>(null);
    useEffect(() => {
        if (force_rainbow) {
            raf_ref.current = requestAnimationFrame(() => {
                const rainbow_colors = [
                    "#ff0000",
                    "#ff4000",
                    "#ff7f00",
                    "#ffbf00",
                    "#ffff00",
                    "#80ff00",
                    "#00ff00",
                    "#008080",
                    "#0000ff",
                    "#2600c1",
                    "#4b0082",
                    "#6d00c1",
                    "#8f00ff"
                ];
                const rainbow_duration_ms = 1000;
                const start_time = Date.now();

                const update_color = () => {
                    if (!force_rainbow) {
                        return;
                    }

                    const elapsed_ms = Date.now() - start_time;
                    const progress = (elapsed_ms % rainbow_duration_ms) / rainbow_duration_ms;
                    const color_index = Math.floor(progress * rainbow_colors.length);
                    on_color_change(rainbow_colors[color_index]);
                }

                const loop = () => {
                    update_color();
                    raf_ref.current = requestAnimationFrame(loop);
                };

                loop();
            });
        } else if (raf_ref.current !== null) {
            cancelAnimationFrame(raf_ref.current);
            raf_ref.current = null;
        }

        return () => {
            if (raf_ref.current !== null) {
                cancelAnimationFrame(raf_ref.current);
                raf_ref.current = null;
            }
        };
    }, [force_rainbow, on_color_change]);

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

                <div ref={button_row_ref} className="flex items-center justify-end gap-4">
                    {casino_enabled && (
                        <div className="relative w-15 h-15 rounded-full bg-neutral-700">
                            <button
                                className="w-full h-full flex items-center justify-center text-white outline-cyan-300 outline-1 cursor-pointer text-sm font-semibold hover:bg-cyan-600 hover:drop-shadow-[0_0_10px_rgba(0,254,252,0.9)] transition-colors rounded-full disabled:opacity-40 disabled:cursor-not-allowed disabled:outline-neutral-500 disabled:hover:bg-transparent disabled:hover:drop-shadow-none"
                                title={casino_cooldown ? "You can't spin again yet" : "Test your luck..."}
                                disabled={!!casino_cooldown}
                                onClick={() => setCasinoPopupOpen(true)}
                            >
                                <Dices />
                            </button>

                            {casino_cooldown && (
                                <BlockedRing
                                    remaining_ms={casino_remaining_ms}
                                    duration={casino_cooldown.duration}
                                    show_time={false}
                                    ring_color={colors.cyan[300]}
                                    label_border_class="border-cyan-300/70"
                                    incrementing
                                />
                            )}
                        </div>
                    )}

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
                        <ColorPicker current_color={current_color} on_color_change={on_color_change} disabled={is_color_forced} />

                        {blocked && cooldown && <BlockedRing remaining_ms={remaining_ms} duration={cooldown.duration} />}

                        {cooldown_scaling_enabled && (
                            <span
                                className="absolute -bottom-1 -right-1 z-10 flex items-center justify-center w-5 h-5 rounded-full bg-neutral-900 border border-neutral-500 text-neutral-300 cursor-help"
                                title="Your cooldown changes with how many people are drawing right now, so it may be longer when it's busy."
                            >
                                <Users size={11} />
                            </span>
                        )}

                        {ready_flash && (
                            <span className="absolute -inset-1 rounded-full border-2 border-emerald-400 animate-ping [animation-iteration-count:1] pointer-events-none" />
                        )}
                    </div>
                </div>
            </div>

            {gifting_enabled && (
                <GiftingPopup open={gifting_popup_open} on_close={() => setGiftingPopupOpen(false)} in_timeout={in_cooldown} />
            )}
            {casino_enabled && (
                <CasinoPopup open={casino_popup_open} on_close={() => setCasinoPopupOpen(false)} can_wager={!in_cooldown || gift_balance > 0} casino_cooldown={casino_cooldown} />
            )}

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