"use client";

import { useEffect, useState, useRef } from "react";
import { socket } from "@/socket";

const FloatingAdminMessage = () => {
    const [message, setMessage] = useState<string | null>(null);
    const [persistent, setPersistent] = useState(false);

    const [scroll_duration_seconds, setScrollDurationSeconds] = useState<number>(0);
    const timeout_ref = useRef<NodeJS.Timeout | null>(null);

    const [key, setKey] = useState(0);

    // setup socket listener
    useEffect(() => {
        socket.on("admin_message", ({ message, persist, duration_ms }: { message: string; persist: boolean; duration_ms?: number }) => {
            console.log("Received admin message:", message, "persist:", persist);

            if (timeout_ref.current) {
                clearTimeout(timeout_ref.current);
            }

            if (duration_ms && duration_ms > 0) {
                // for both message types, clear the message after duration_ms
                timeout_ref.current = setTimeout(() => {
                    setMessage(null);
                    timeout_ref.current = null;
                }, duration_ms);

                // for specific non-persistent messages, adjust scroll duration
                if (!persist) {
                    const duration_seconds = duration_ms / 1000;
                    setScrollDurationSeconds(duration_seconds);
                }
            } else {
                // if left undefined, use 3.33s per character as scroll duration
                if (!persist) {
                    const duration_seconds = Math.max(5, message.length * 3.33);
                    setScrollDurationSeconds(duration_seconds);
                }
            }

            setMessage(message);
            setPersistent(persist);

            if (!persist) {
                // change key to trigger re-mount for animation (using message as key doesn't work if same message is sent twice)
                setKey(prevKey => prevKey + 1);
            }
        });
    }, []);

    if (!message) {
        return null;
    }

    return (
        <div className="relative w-full h-0 pointer-events-none select-none z-9999 pt-2 text-orange-600 drop-shadow-md font-sans text-xl flex">
            {persistent
                ? <span className="text-center w-full">{message}</span>
                : <span key={key} className="inline-block animate-scroll-from-right text-nowrap" style={{animationDuration: `${scroll_duration_seconds}s`}}>{message}</span>
            }
        </div>
    );
};

export default FloatingAdminMessage;
