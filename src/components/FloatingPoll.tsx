"use client";

import { useEffect, useState, useRef } from "react";
import { socket } from "@/socket";
import {X} from "lucide-react";

enum PollState {
    HIDDEN,
    ACTIVE,
    ENDED
}

const FloatingPoll = () => {
    const [poll_state, setPollState] = useState<PollState>(PollState.HIDDEN);
    const [user_hiding, setUserHiding] = useState<boolean>(false);

    const [question, setQuestion] = useState<string | null>(null);
    const [options, setOptions] = useState<string[] | null>(null);
    const [counts, setCounts] = useState<number[] | null>(null);
    const [winners, setWinners] = useState<string[] | null>(null);

    const [chosen_option_index, setChosenOptionIndex] = useState<number | null>(null);
    const hide_timeout = useRef<NodeJS.Timeout | null>(null);

    // setup socket listeners
    useEffect(() => {
        socket.on("poll", ({ question: new_question, options: new_options, counts: new_counts }: { question: string; options: string[]; counts: number[] }) => {
            // cancel any hide timeout
            if (hide_timeout.current) {
                clearTimeout(hide_timeout.current);
            }

            setQuestion(new_question);
            setOptions(new_options);
            setCounts(new_counts);

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

    return (
        <div className={`z-9999 font-sans fixed right-[50vw] translate-x-[50%] sm:translate-x-0 top-20 sm:right-10 min-w-64 w-full sm:w-fit max-w-9/10 sm:max-w-100 bg-neutral-600/75 backdrop-blur-sm border border-neutral-500/75 rounded shadow-lg p-4 transition-opacity duration-500 ${hidden ? "opacity-0 pointer-events-none" : "opacity-100"}`}>
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
                    className={`${chosen_option_index === index ? "outline-2 outline-orange-200/80" : ""} ${winners && winners.includes(option) ? "shadow-[0_0_20px_5px_rgba(234,179,8,0.6)] !bg-yellow-200 text-black" : ""} flex justify-between gap-2 sm:gap-4 w-full mb-2 break-words px-3 py-2 bg-orange-700 hover:bg-orange-600 transition-all rounded disabled:bg-neutral-400 cursor-pointer disabled:cursor-not-allowed`}
                    onClick={() => {
                        if (poll_state === PollState.ACTIVE) {
                            socket.emit("poll_vote", index);
                            setChosenOptionIndex(index);
                        }
                    }}
                    disabled={poll_state !== PollState.ACTIVE}
                    title={poll_state === PollState.ACTIVE ? "Click to vote for this option" : ""}
                >
                    <span className="break-all text-left flex-1">
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
