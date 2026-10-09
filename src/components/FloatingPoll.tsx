"use client";

import { useEffect, useState, useRef } from "react";
import { socket } from "@/socket";
import {X} from "lucide-react";
import useRemainingMs from "@/hooks/useRemainingMs";

enum PollState {
    HIDDEN,
    ACTIVE,
    ENDED
}

const FloatingPoll = ({read_only = false, position_class = "right-[50vw] translate-x-[50%] sm:translate-x-0 top-25 sm:right-10"}: {read_only?: boolean; position_class?: string}) => {
    const [poll_state, setPollState] = useState<PollState>(PollState.HIDDEN);
    const [user_hiding, setUserHiding] = useState<boolean>(false);

    const [question, setQuestion] = useState<string | null>(null);
    const [options, setOptions] = useState<string[] | null>(null);
    const [counts, setCounts] = useState<number[] | null>(null);
    const [winners, setWinners] = useState<string[] | null>(null);

    const [chosen_option_index, setChosenOptionIndex] = useState<number | null>(null);

    const [is_chaos, setIsChaos] = useState<boolean>(false);
    const [ends_at, setEndsAt] = useState<number | null>(null);
    const [winners_count, setWinnersCount] = useState<number>(1);

    const hide_timeout = useRef<NodeJS.Timeout | null>(null);

    // setup socket listeners
    useEffect(() => {
        socket.on("poll", ({ question: new_question, options: new_options, counts: new_counts, chaos, ends_at: new_ends_at, winners_count: new_winners_count }: { question: string; options: string[]; counts: number[]; chaos?: boolean; ends_at?: number; winners_count?: number }) => {
            // cancel any hide timeout
            if (hide_timeout.current) {
                clearTimeout(hide_timeout.current);
            }

            setQuestion(new_question);
            setOptions(new_options);
            setCounts(new_counts);

            setIsChaos(!!chaos);
            setEndsAt(new_ends_at ?? null);
            setWinnersCount(new_winners_count ?? 1);

            setWinners(null);
            setChosenOptionIndex(null);
            setUserHiding(false);

            setPollState(PollState.ACTIVE);
        });

        socket.on("poll_counts", (new_counts: number[]) => {
            setCounts(new_counts);
        });
        
        // check for existing poll on mount
        socket.emit("check_poll");
    }, []);

    // use separate effect as options is a dependency
    useEffect(() => {
        socket.on("end_poll", ({ winners, results: final_results }: { winners: string[]; results: Record<string, number> }) => {
            setPollState(PollState.ENDED);

            const new_counts = options ? options.map(option => final_results[option] || 0) : null;
            setCounts(new_counts);
            setWinners(winners);
            setUserHiding(false);

            hide_timeout.current = setTimeout(() => {
                setPollState(PollState.HIDDEN);
                hide_timeout.current = null;
            }, 5000); // hide after 5 seconds
        });

        return () => {
            socket.off("end_poll");
        }
    }, [options]);

    const total_votes = counts ? counts.reduce((a, b) => a + b, 0) : 0;
    const hidden = poll_state === PollState.HIDDEN || user_hiding;

    // live countdown for chaos polls; useRemainingMs with a zero duration just counts down to ends_at
    const remaining_ms = useRemainingMs(ends_at, 0);
    const show_countdown = is_chaos && poll_state === PollState.ACTIVE && ends_at !== null;

    return (
        <div className={`z-9999 font-sans fixed ${position_class} min-w-64 w-full sm:w-fit max-w-9/10 sm:max-w-100 backdrop-blur-sm border rounded shadow-lg p-4 transition-opacity duration-500 ${is_chaos ? "bg-purple-900/75 border-purple-400/80 shadow-[0_0_25px_3px_rgba(168,85,247,0.4)]" : "bg-neutral-600/75 border-neutral-500/75"} ${hidden ? "opacity-0 pointer-events-none" : "opacity-100"}`}>
            {is_chaos && (
                <div className="flex items-center justify-between mb-1 text-xs font-bold tracking-wide uppercase text-purple-200">
                    <span>⚡ Chaos mode</span>
                    {show_countdown && <span>{Math.ceil(remaining_ms / 1000)}s left</span>}
                </div>
            )}

            {is_chaos && winners_count > 1 && (
                <div className="mb-2 text-xs text-purple-200/90">
                    Top {winners_count} options win this round!
                </div>
            )}

            <div className="w-full flex items-start justify-between mb-2 gap-2">
                {question && <h3 className="text-lg font-semibold break-words max-w-[92.5%]">{question}</h3>}

                <button title="Hide poll" className="cursor-pointer" onClick={() => setUserHiding(true)}>
                    <X />
                </button>
            </div>

            <div>
            {options && options.map((option, index) => (
                <button
                    key={index}
                    className={`${chosen_option_index === index ? "outline-2 outline-orange-200/80" : ""} ${winners && winners.includes(option) ? "shadow-[0_0_20px_5px_rgba(234,179,8,0.6)] !bg-yellow-200 text-black" : ""} flex justify-between gap-2 sm:gap-4 w-full mb-2 break-words px-3 py-2 bg-orange-700 transition-all rounded disabled:bg-neutral-400 ${read_only ? "pointer-events-none" : "hover:bg-orange-600 cursor-pointer disabled:cursor-not-allowed"}`}
                    onClick={() => {
                        if (!read_only && poll_state === PollState.ACTIVE) {
                            socket.emit("poll_vote", index);
                            setChosenOptionIndex(index);
                        }
                    }}
                    disabled={!read_only && poll_state !== PollState.ACTIVE}
                    title={!read_only && poll_state === PollState.ACTIVE ? "Click to vote for this option" : ""}
                >
                    <span className="break-words min-w-0 text-left flex-1">
                        {option}
                    </span>

                    {counts && counts[index] !== undefined && (
                        <div className="flex gap-1 min-w-30 text-nowrap shrink-0 items-center justify-end">
                            <span className="text-sm">{counts[index]} vote{counts[index] !== 1 ? "s" : ""}</span>
                            <span className="text-sm">({total_votes > 0 ? ((counts[index] / total_votes) * 100).toFixed(1) : "0.0"}%)</span>
                        </div>
                    )}
                </button>
            ))}
            </div>
        </div>
    );
};

export default FloatingPoll;
