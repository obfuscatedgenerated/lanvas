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

const StatsList = ({ stats }: { stats: StatsData }) => (
    <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-xl mb-16">
        {Object.entries(stats).map(([key, value]) => (
            <>
                <b>{known_stat_labels[key] || key}:</b>
                <NumberFlow value={value}/>
            </>
        ))}
    </div>
);

export default function StatsPage() {
    const [stats, setStats] = useState<StatsData | null>(null);

    // register socket listener
    useEffect(() => {
        socket.on("stats", (data) => {
            setStats(data);
        });

        // join stats room and request stats on mount
        socket.emit("join_stats");
    }, []);

    if (!stats) {
        return <p className="text-lg flex flex-col items-center justify-center min-h-screen py-2">Loading stats...</p>;
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-screen py-2">
            <h1 className="text-4xl font-bold mb-8">Live Statistics</h1>
            <StatsList stats={stats} />
        </div>
    );
}
