"use client";

import { useEffect, useState } from "react";
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

const StatEntry = ({ stat_key, stats }: { stat_key: string; stats: StatsData }) => (
    <>
        <b className="break-words">{known_stat_labels[stat_key] || stat_key}:</b>
        <NumberFlow value={stats[stat_key]} />
    </>
);

const StatsList = ({ stats }: { stats: StatsData }) => (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] max-w-9/10 gap-x-6 gap-y-2 text-xl sm:text-2xl items-center mb-16">
        {stats_order.map((key) => {
            // render pre-ordered stats first

            if (key in stats) {
                return <StatEntry key={key} stat_key={key} stats={stats} />;
            }

            return null;
        })}

        {Object.keys(stats).map((key) => {
            // render any additional stats not in the known order

            if (stats_order.includes(key)) {
                return null; // already rendered
            }

            return <StatEntry key={key} stat_key={key} stats={stats} />;
        })}
    </div>
);

export default function StatsPage() {
    const [stats, setStats] = useState<StatsData | null>(null);

    // register socket listener
    useEffect(() => {
        socket.on("stats", (data) => {
            setStats(data);
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
