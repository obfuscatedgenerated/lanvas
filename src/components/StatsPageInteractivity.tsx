"use client";

import {useEffect, useRef, useState} from "react";
import StatsList, {StatsData} from "@/components/StatsList";
import Leaderboards from "@/components/Leaderboards";
import {socket} from "@/socket";
import type {Leaderboard} from "@/types";

const StatsPageInteractivity = () => {
    const [stats, setStats] = useState<StatsData | null>(null);
    const [leaderboards, setLeaderboards] = useState<Leaderboard[]>([]);

    // register socket listener
    useEffect(() => {
        socket.on("stats", (data) => {
            setStats(data);
        });

        socket.on("leaderboards", setLeaderboards);

        socket.on("reload", () => {
            console.log("Received reload command from server, reloading page...");
            window.location.reload();
        });

        // join stats room and request stats on mount
        socket.emit("join_stats");
    }, []);

    // the browser's own jump to #leaderboards happens before the boards have loaded, so it's done here once they exist
    const scrolled_to_hash_ref = useRef(false);

    useEffect(() => {
        if (scrolled_to_hash_ref.current || leaderboards.length === 0 || window.location.hash !== "#leaderboards") {
            return;
        }

        scrolled_to_hash_ref.current = true;
        document.getElementById("leaderboards-anchor")?.scrollIntoView({behavior: "smooth", block: "start"});
    }, [leaderboards]);

    if (!stats) {
        return <StatsPageInteractivityFallback />;
    }

    return (
        // the body never scrolls, so the page scrolls itself once leaderboards make it taller than the screen
        <div className="flex-1 overflow-y-auto">
            <div className="min-h-full flex flex-col items-center justify-center py-8">
                <h1 className="text-4xl sm:text-5xl font-bold mb-8">Live Statistics</h1>
                <StatsList stats={stats} className="mb-12" entry_className="font-semibold" />

                <Leaderboards
                    title={<a id="leaderboards-anchor" href="#leaderboards"><h2 className="text-2xl sm:text-3xl font-semibold mb-4">Leaderboards</h2></a>}
                    leaderboards={leaderboards}
                />
            </div>
        </div>
    );
}

export const StatsPageInteractivityFallback = () => <p className="text-lg flex flex-col items-center justify-center min-h-screen py-2">Loading stats...</p>;

export default StatsPageInteractivity;