import {ComponentProps, useCallback, useEffect, useState} from "react";

import Popup from "@/components/Popup";
import FancyButton from "@/components/FancyButton";
import RiggedWheel from "@/components/RiggedWheel";

import useRemainingMs from "@/hooks/useRemainingMs";

import {socket} from "@/socket";
import type {Cooldown, WheelSegment} from "@/types";

interface CasinoPopupProps extends ComponentProps<typeof Popup> {
    // a spin costs a pixel, either your ready one or a held gift
    can_wager: boolean;

    // owned by the dock so the button's ring and this popup always agree, null when a spin is allowed
    casino_cooldown: Cooldown | null;
}

interface CasinoWheelMessage {
    segments: WheelSegment[];
    pot: number;
}

interface SpinStartedMessage {
    segment_id: string;
    tease_segment_id: string | null;
}

const REJECTION_MESSAGES: Record<string, string> = {
    disabled: "The casino is closed",
    readonly: "The canvas is read only right now",
    unauthenticated: "Sign in to spin",
    banned: "You can't spin",
    spin_timeout: "The wheel needs a rest, try again soon",
    burst_gap: "Slow down a little",
    no_pixel: "You need a pixel to bet, wait for yours or get gifted one",
};

const format_remaining = (remaining_ms: number): string => {
    const total_seconds = Math.max(0, Math.ceil(remaining_ms / 1000));
    const minutes = Math.floor(total_seconds / 60);
    const seconds = total_seconds % 60;

    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

export const CasinoPopup = ({can_wager, casino_cooldown, ...popup_props}: CasinoPopupProps) => {
    const [segments, setSegments] = useState<WheelSegment[]>([]);
    const [pot, setPot] = useState<number | null>(null);

    const [result_id, setResultId] = useState<string | null>(null);
    const [tease_id, setTeaseId] = useState<string | null>(null);
    const [spin_key, setSpinKey] = useState(0);
    const [spinning, setSpinning] = useState(false);

    // the server's announcement can arrive before the wheel stops (the rigged creep runs longer), so it waits here
    const [pending_result, setPendingResult] = useState<string | null>(null);
    const [shown_result, setShownResult] = useState<string | null>(null);
    const [rejection, setRejection] = useState<string | null>(null);

    const cooldown_remaining_ms = useRemainingMs(casino_cooldown?.start_time ?? null, casino_cooldown?.duration ?? null);

    useEffect(() => {
        if (!popup_props.open) {
            return;
        }

        const handle_wheel = ({segments: new_segments, pot: new_pot}: CasinoWheelMessage) => {
            setSegments(new_segments);
            setPot(new_pot);
        };

        const handle_spin_started = ({segment_id, tease_segment_id}: SpinStartedMessage) => {
            setRejection(null);
            setShownResult(null);
            setPendingResult(null);

            setResultId(segment_id);
            setTeaseId(tease_segment_id);
            setSpinning(true);
            setSpinKey((previous) => previous + 1);
        };

        const handle_spin_rejected = ({reason}: {reason: string}) => {
            setRejection(REJECTION_MESSAGES[reason] ?? `Couldn't spin: ${reason}`);
        };

        // only our own result, everyone's results go through the feed instead
        const handle_own_result = ({message}: {message: string}) => setPendingResult(message);

        socket.on("casino_wheel", handle_wheel);
        socket.on("casino_pot", setPot);
        socket.on("spin_started", handle_spin_started);
        socket.on("spin_rejected", handle_spin_rejected);
        socket.on("casino_own_result", handle_own_result);

        socket.emit("request_casino_wheel");

        return () => {
            socket.off("casino_wheel", handle_wheel);
            socket.off("casino_pot", setPot);
            socket.off("spin_started", handle_spin_started);
            socket.off("spin_rejected", handle_spin_rejected);
            socket.off("casino_own_result", handle_own_result);
        };
    }, [popup_props.open]);

    // reveal the announcement once the wheel has actually stopped
    useEffect(() => {
        if (!spinning && pending_result) {
            setShownResult(pending_result);
            setPendingResult(null);
        }
    }, [spinning, pending_result]);

    const on_spin_end = useCallback(() => {
        setSpinning(false)

        setTimeout(() => {
            popup_props.on_close()
        }, 1000);
    }, [popup_props]);

    const spin = () => {
        setRejection(null);
        socket.emit("spin_wheel");
    };

    const waiting_for_spin = cooldown_remaining_ms > 0;
    const spin_disabled = spinning || waiting_for_spin || !can_wager || segments.length === 0;

    const button_label = spinning
        ? "Spinning..."
        : waiting_for_spin
            ? `Next spin in ${format_remaining(cooldown_remaining_ms)}`
            : "Bet a pixel and spin!";

    return (
        <Popup {...popup_props} className="bg-transparent p-6 max-w-3xl w-11/12 max-h-4/5 overflow-y-auto">
            <div className="flex flex-col items-center justify-center gap-6">
                {pot !== null && (
                    <p className="text-lg font-semibold text-yellow-300">🎰 Jackpot: {pot} pixels</p>
                )}

                {segments.length > 0
                    ? (
                        <RiggedWheel
                            segments={segments}
                            result_id={result_id}
                            tease_id={tease_id}
                            spin_key={spin_key}
                            on_spin_end={on_spin_end}
                            size={350}
                        />
                    )
                    : <p className="text-neutral-400">Loading the wheel...</p>
                }

                <p className="min-h-6 text-center" aria-live="polite">
                    {shown_result ?? rejection ?? (!can_wager && !spinning ? "You need a pixel to bet, wait for yours or ask someone nicely for a gift :)" : "")}
                </p>

                <FancyButton
                    className="ml-0 disabled:opacity-50 disabled:cursor-not-allowed text-lg"
                    disabled={spin_disabled}
                    onClick={spin}
                >
                    {button_label}
                </FancyButton>
            </div>
        </Popup>
    );
};
