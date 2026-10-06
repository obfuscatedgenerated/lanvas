"use client";

import {useEffect, useRef} from "react";

import {socket} from "@/socket";

// comfortably inside the server's 60s afk timeout, so normal use never flickers to afk
const ACTIVITY_PING_INTERVAL_MS = 20000;

const ACTIVITY_EVENTS = ["pointermove", "pointerdown", "keydown", "wheel", "touchstart"] as const;

// tells the server the user is still here while they interact with the page, renders nothing
const AFKHeartbeatActivity = () => {
    const last_ping_ref = useRef(0);

    useEffect(() => {
        // leading edge throttle: the first activity after a quiet spell pings straight away, then at most once per interval
        const ping_if_due = () => {
            const current_time = Date.now();

            if (document.visibilityState !== "visible" || current_time - last_ping_ref.current < ACTIVITY_PING_INTERVAL_MS) {
                return;
            }

            last_ping_ref.current = current_time;
            socket.emit("activity_ping");
        };

        for (const event_name of ACTIVITY_EVENTS) {
            window.addEventListener(event_name, ping_if_due, {passive: true});
        }

        // coming back to the tab counts as activity
        document.addEventListener("visibilitychange", ping_if_due);

        // opening the page counts too
        ping_if_due();

        return () => {
            for (const event_name of ACTIVITY_EVENTS) {
                window.removeEventListener(event_name, ping_if_due);
            }

            document.removeEventListener("visibilitychange", ping_if_due);
        };
    }, []);

    return null;
};

export default AFKHeartbeatActivity;
