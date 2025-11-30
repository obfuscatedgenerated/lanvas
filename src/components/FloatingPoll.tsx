"use client";

import { useEffect, useState, useRef } from "react";
import { socket } from "@/socket";

enum PollState {
    HIDDEN,
    ACTIVE,
    ENDED
}

const FloatingPoll = () => {
    const [poll_state, setPollState] = useState<PollState>(PollState.HIDDEN);

    const [question, setQuestion] = useState<string | null>(null);
    const [options, setOptions] = useState<string[] | null>(null);
    const [results, setResults] = useState<number[] | null>(null);
    const [winners, setWinners] = useState<string[] | null>(null);

    const [chosen_option_index, setChosenOptionIndex] = useState<number | null>(null);
    const hide_timeout = useRef<NodeJS.Timeout | null>(null);

    // setup socket listeners
    useEffect(() => {
        socket.on("poll", ({ question: new_question, options: new_options }: { question: string; options: string[] }) => {
            // cancel any hide timeout
            if (hide_timeout.current) {
                clearTimeout(hide_timeout.current);
            }

            setQuestion(new_question);
            setOptions(new_options);
            setResults(Array(new_options.length).fill(0));
            setWinners(null);
            setChosenOptionIndex(null);

            setPollState(PollState.ACTIVE);
        });

        socket.on("poll_counts", (counts: number[]) => {
            setResults(counts);
        });
        
        // check for existing poll on mount
        socket.emit("check_poll");
    }, []);

    // use separate effect as options is a dependency
    useEffect(() => {
        socket.on("end_poll", ({ winners, results: final_results }: { winners: string[]; results: Record<string, number> }) => {
            setPollState(PollState.ENDED);

            const counts = options ? options.map(option => final_results[option] || 0) : null;
            setResults(counts);
            setWinners(winners);

            hide_timeout.current = setTimeout(() => {
                setPollState(PollState.HIDDEN);
                hide_timeout.current = null;
            }, 5000); // hide after 5 seconds
        });

        return () => {
            socket.off("end_poll");
        }
    }, [options]);

    const total_votes = results ? results.reduce((a, b) => a + b, 0) : 0;

    return (
        <div className={`z-9999 fixed top-20 right-10 min-w-64 max-w-100 bg-neutral-600 border border-neutral-500 rounded shadow-lg p-4 transition-opacity duration-500 ${poll_state === PollState.HIDDEN ? "opacity-0 pointer-events-none" : "opacity-100"}`}>
            {question && <h3 className="text-lg font-semibold mb-2 break-words">{question}</h3>}
            {options && options.map((option, index) => (
                <button
                    key={index}
                    className={`${chosen_option_index === index ? "outline-2 outline-orange-200/80" : ""} ${winners && winners.includes(option) ? "shadow-[0_0_20px_5px_rgba(234,179,8,0.6)] !bg-yellow-200 text-black" : ""} flex justify-between w-full mb-2 break-words px-3 py-2 bg-orange-700 hover:bg-orange-600 transition-all rounded disabled:bg-neutral-400 cursor-pointer disabled:cursor-not-allowed`}
                    onClick={() => {
                        if (poll_state === PollState.ACTIVE) {
                            socket.emit("poll_vote", index);
                            setChosenOptionIndex(index);
                        }
                    }}
                    disabled={poll_state !== PollState.ACTIVE}
                >
                    {option}
                    {results && results[index] !== undefined && (
                        <div className="flex gap-1">
                            <span className="text-sm">{results[index]} vote{results[index] !== 1 ? "s" : ""}</span>
                            <span className="text-sm">({total_votes > 0 ? ((results[index] / total_votes) * 100).toFixed(1) : "0.0"}%)</span>
                        </div>
                    )}
                </button>
            ))}
        </div>
    );
};

export default FloatingPoll;
