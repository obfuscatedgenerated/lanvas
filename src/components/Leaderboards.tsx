import Image from "next/image";
import NumberFlow from "@number-flow/react";

import type {Leaderboard} from "@/types";
import {SquareArrowOutUpRight} from "lucide-react";

const MEDALS = ["🥇", "🥈", "🥉"];

const LeaderboardCard = ({leaderboard}: {leaderboard: Leaderboard}) => (
    <section className="bg-neutral-900/70 border border-neutral-800/70 rounded-xl p-4 flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{leaderboard.title}</h2>

        <ol className="flex flex-col gap-2">
            {leaderboard.entries.map((entry, position) => (
                <li key={`${position}-${entry.name}`} className="flex items-center gap-2">
                    <span className="w-6 text-center shrink-0">{MEDALS[position] ?? `${position + 1}.`}</span>

                    {entry.avatar_url && (
                        <Image src={entry.avatar_url} alt="" width={24} height={24} className="rounded-full shrink-0" unoptimized={entry.avatar_url.startsWith("/")} />
                    )}

                    <span className="truncate">{entry.name}</span>

                    <span className="ml-auto shrink-0 text-neutral-300 whitespace-nowrap">
                        <NumberFlow value={entry.value} /> <span className="text-neutral-500 text-sm">{leaderboard.unit}</span>
                    </span>
                </li>
            ))}
        </ol>
    </section>
);

// boards only arrive once they have entries, so features that haven't been revealed yet stay hidden
const Leaderboards = ({leaderboards, title = null}: {leaderboards: Leaderboard[], title?: React.ReactNode}) => {
    if (leaderboards.length === 0) {
        return null;
    }

    return (
        <>
            {title}
            <div className="flex flex-col gap-6 w-7/8 max-w-4xl">
                {leaderboards.map((leaderboard) => (
                    <LeaderboardCard key={leaderboard.key} leaderboard={leaderboard} />
                ))}
            </div>
        </>
    );
};

// one line per board with just the current leader, for places too small for the full cards
export const LeaderboardSummary = ({leaderboards}: {leaderboards: Leaderboard[]}) => {
    if (leaderboards.length === 0) {
        return null;
    }

    return (
        <div className="flex flex-col gap-2 w-full">
            <h3 className="text-lg font-semibold">Leaderboard</h3>

            <ul className="flex flex-col gap-1.5">
                {leaderboards.map((leaderboard) => {
                    const leader = leaderboard.entries[0];

                    return (
                        <li key={leaderboard.key} className="flex items-center gap-2">
                            <span className="text-neutral-200 shrink-0">{leaderboard.title}</span>

                            <span className="ml-auto flex items-center gap-1.5 min-w-0">
                                🥇
                                {leader.avatar_url && (
                                    <Image src={leader.avatar_url} alt="" width={20} height={20} className="rounded-full shrink-0" unoptimized={leader.avatar_url.startsWith("/")} />
                                )}
                                <span className="truncate">{leader.name}</span>
                                <span className="text-neutral-400 text-sm whitespace-nowrap">{leader.value} {leaderboard.unit}</span>
                            </span>
                        </li>
                    );
                })}
            </ul>

            <a href="/stats#leaderboards" target="_blank" rel="noopener noreferrer" className="self-start text-sky-400 hover:text-sky-300 text-sm flex gap-2 items-center">
                See the full leaderboards <SquareArrowOutUpRight className="h-3 w-3" />
            </a>
        </div>
    );
};

export default Leaderboards;