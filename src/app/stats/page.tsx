"use client";

import { useEffect, useState } from "react";
import { socket } from "@/socket";

import StatsList, { type StatsData } from "@/components/StatsList";

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
