"use client";

// it's all interactivity anyway, may as well be a client component and we just inline the state here

import {useState, useCallback, useEffect} from "react";

import PixelGrid from "@/components/PixelGrid";
import FloatingWidget from "@/components/FloatingWidget";
import {socket} from "@/socket";

const PIXEL_TIMEOUT_MS = process.env.NEXT_PUBLIC_PIXEL_TIMEOUT_MS ? parseInt(process.env.NEXT_PUBLIC_PIXEL_TIMEOUT_MS) : 30000;

export default function Home() {
    const [current_color, setCurrentColor] = useState("#000000");
    const [timeout_start_time, setTimeoutStartTime] = useState<number | null>(null);

    // when pixel is submitted, switch to show timeout mode for the widget
    const handle_pixel_submitted = useCallback(
        () => {
            setTimeoutStartTime(Date.now());

            // after timeout, switch back to color picker mode
            setTimeout(() => {
                setTimeoutStartTime(null);
            }, PIXEL_TIMEOUT_MS);
        },
        []
    );

    // if the update was rejected, undo the timeout state
    const handle_pixel_update_rejected = useCallback(
        () => {
            setTimeoutStartTime(null);
        },
        []
    );

    // use socket to check timeout
    useEffect(() => {
        socket.on("connect", () => console.log("Connected!", socket.id));

        socket.on("timeout_info", (info) => {
            console.log(info);

            // update timeout so far
            setTimeoutStartTime(info.started);

            // after timeout, switch back to color picker mode
            setTimeout(() => {
                setTimeoutStartTime(null);
            }, info.remaining);
        });

        // check for any timeouts on page load
        socket.emit("check_timeout");

        return () => {
            socket.disconnect();
        }
    }, []);

    return (
        <div className="flex-1">
            <PixelGrid
                current_color={current_color}
                can_submit={timeout_start_time === null}

                on_pixel_submitted={handle_pixel_submitted}
                on_pixel_update_rejected={handle_pixel_update_rejected}
            />

            <FloatingWidget
                mode={timeout_start_time ? "timeout" : "color"}

                current_color={current_color}
                on_color_change={setCurrentColor}

                start_time={timeout_start_time ?? -1}
                duration={PIXEL_TIMEOUT_MS}
            />
        </div>
    );
}
