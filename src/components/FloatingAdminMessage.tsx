"use client";

import { useEffect, useState } from "react";
import { socket } from "@/socket";

const FloatingAdminMessage = () => {
    const [message, setMessage] = useState<string | null>(null);
    const [persistent, setPersistent] = useState(false);
    const [key, setKey] = useState(0);

    // setup socket listener
    useEffect(() => {
        socket.on("admin_message", ({ message, persist }: { message: string; persist: boolean }) => {
            console.log("Received admin message:", message, "persist:", persist);

            if (!persist) {
                // change key to trigger re-mount for animation (using message as key doesn't work if same message is sent twice)
                setKey(prevKey => prevKey + 1);
            }

            setMessage(message);
            setPersistent(persist);
        });
    }, []);

    if (!message) {
        return null;
    }

    return (
        <div className="relative w-full h-0 pointer-events-none select-none z-9999 pt-2 text-orange-600 drop-shadow-md font-sans text-xl flex">
            {persistent
                ? <span className="text-center w-full">{message}</span>
                : <span key={key} className="inline-block animate-scroll-from-right text-nowrap">{message}</span>
            }
        </div>
    );
};

export default FloatingAdminMessage;
