"use client";

import { useEffect, useState } from "react";
import { socket } from "@/socket";
import NumberFlow from "@number-flow/react";

interface StatsData {
    total_pixels_placed: number;
    connected_unique_users: number;
}

const StatsList = ({ stats }: { stats: StatsData }) => (
    <ul className="text-xl mb-16">
        <li><b>Total pixels placed:</b> <NumberFlow value={stats.total_pixels_placed}/></li>
        <li><b>Connected users:</b> <NumberFlow value={stats.connected_unique_users}/></li>
    </ul>
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
