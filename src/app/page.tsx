"use client";

// it's all interactivity anyway, may as well be a client component and we just inline the state here

import {useState, useCallback, useEffect} from "react";

import PixelGrid from "@/components/PixelGrid";
import FloatingWidget from "@/components/FloatingWidget";
import FloatingHelp from "@/components/FloatingHelp";
import FloatingAdminMessage from "@/components/FloatingAdminMessage";

import {socket} from "@/socket";
import {DEFAULT_PIXEL_TIMEOUT_MS} from "@/defaults";
import {CONFIG_KEY_PIXEL_TIMEOUT_MS} from "@/consts";
import FloatingPoll from "@/components/FloatingPoll";

export default function Home() {
    const [current_color, setCurrentColor] = useState("#000000");

    const [timeout_start_time, setTimeoutStartTime] = useState<number | null>(null);
    const [timeout_end_time, setTimeoutEndTime] = useState<number | null>(null);

    const [is_readonly, setIsReadonly] = useState(false);
    const [pixel_timeout_ms, setPixelTimeoutMs] = useState(DEFAULT_PIXEL_TIMEOUT_MS);

    // when pixel is submitted, switch to show timeout mode for the widget
    const handle_pixel_submitted = useCallback(
        () => {
            setTimeoutStartTime(Date.now());
            setTimeoutEndTime(Date.now() + pixel_timeout_ms);

            // after timeout, switch back to color picker mode
            setTimeout(() => {
                setTimeoutStartTime(null);
                setTimeoutEndTime(null);
            }, pixel_timeout_ms);
        },
        [pixel_timeout_ms]
    );

    // if the update was rejected, undo the timeout state
    const handle_pixel_update_rejected = useCallback(
        () => {
            setTimeoutStartTime(null);
            setTimeoutEndTime(null);
        },
        []
    );

    // use socket to check timeout
    useEffect(() => {
        socket.on("connect", () => console.log("Connected!", socket.id));

        socket.on("timeout_info", (info) => {
            // update timeout so far
            setTimeoutStartTime(info.started);
            setTimeoutEndTime(info.ends);

            // adjust remaining for clock sync (could also subtract the checked_at time, but this is simpler)
            const current_time = Date.now();
            const true_remaining = info.ends - current_time;

            // after timeout, switch back to color picker mode
            setTimeout(() => {
                setTimeoutStartTime(null);
                setTimeoutEndTime(null);
            }, true_remaining);
        });

        socket.on("readonly", (readonly) => {
            setIsReadonly(readonly);
            if (readonly) {
                alert("The canvas is now in read only mode. You cannot place pixels at this time.");
            }
        });

        socket.on("config_value", ({key, value}) => {
            console.log("Received config value:", key, value);

            if (key === CONFIG_KEY_PIXEL_TIMEOUT_MS) {
                setPixelTimeoutMs(value);
            }
        });

        socket.on("reload", () => {
            console.log("Received reload command from server, reloading page...");
            window.location.reload();
        });

        // check for any timeouts on page load
        socket.emit("check_timeout");

        // check if the canvas is in readonly mode
        socket.emit("check_readonly");

        // request timeout config value
        socket.emit("get_public_config_value", CONFIG_KEY_PIXEL_TIMEOUT_MS);

        return () => {
            socket.disconnect();
        }
    }, []);

    return (
        <>
            <FloatingAdminMessage />
            <FloatingPoll />

            <div className="flex-1">
                <PixelGrid
                    current_color={current_color}
                    can_submit={!is_readonly && timeout_start_time === null}

                    on_pixel_submitted={handle_pixel_submitted}
                    on_pixel_update_rejected={handle_pixel_update_rejected}
                />

                {!is_readonly &&
                    <FloatingWidget
                        mode={timeout_start_time ? "timeout" : "color"}

                        current_color={current_color}
                        on_color_change={setCurrentColor}

                        start_time={timeout_start_time ?? -1}
                        duration={(timeout_end_time && timeout_start_time) ? (timeout_end_time - timeout_start_time) : -1}
                    />
                }
            </div>

            <FloatingHelp />
        </>
    );
}
