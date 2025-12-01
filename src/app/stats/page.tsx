"use client";

import { useEffect, useState, Fragment } from "react";
import { socket } from "@/socket";
import NumberFlow from "@number-flow/react";

interface StatsData {
    total_pixels_placed: number;
    connected_unique_users: number;
    [key: string]: number; // unknown additional stats
}

const known_stat_labels: { [key: string]: string } = {
    total_pixels_placed: "Total pixels placed",
    connected_unique_users: "Connected users",
};

const stats_order = [
    "total_pixels_placed",
    "connected_unique_users",
];

const StatsList = ({ stats }: { stats: StatsData }) => (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] max-w-9/10 gap-x-6 gap-y-2 text-xl sm:text-2xl items-center mb-16">
        {Object.entries(stats).map(([key, value]) => (
            <Fragment key={key}>
                <b className="break-words">{known_stat_labels[key] || key}:</b>
                <NumberFlow value={value}/>
            </Fragment>
        ))}
    </div>
);

export default function StatsPage() {
    const [stats, setStats] = useState<StatsData | null>(null);

    // register socket listener
    useEffect(() => {
        socket.on("stats", (data) => {
            // sort stats according to predefined order, then whatever order recieved for unknown stats
            const sorted_stats: Partial<StatsData> = {};
            for (const key of stats_order) {
                if (key in data) {
                    sorted_stats[key] = data[key];
                }
            }
            for (const [key, value] of Object.entries(data)) {
                if (!(key in sorted_stats)) {
                    // @ts-expect-error guaranteed to be correct type
                    sorted_stats[key] = value;
                }
            }
            setStats(sorted_stats as StatsData);
        });

        socket.on("reload", () => {
            console.log("Received reload command from server, reloading page...");
            window.location.reload();
        });

        // join stats room and request stats on mount
        socket.emit("join_stats");
    }, []);

    if (!stats) {
        return <p className="text-lg flex flex-col items-center justify-center min-h-screen py-2">Loading stats...</p>;
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-screen py-2">
            <h1 className="text-4xl sm:text-5xl font-bold mb-8">Live Statistics</h1>
            <StatsList stats={stats} />
        </div>
    );
}
