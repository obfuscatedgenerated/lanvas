"use client";

import { useEffect, useState } from "react";
import { socket } from "@/socket";

const FloatingAdminMessage = () => {
    const [message, setMessage] = useState<string | null>(null);
    const [persistent, setPersistent] = useState(false);

    // setup socket listener
    useEffect(() => {
        socket.on("admin_message", ({ message, persist }: { message: string; persist: boolean }) => {
            console.log("Received admin message:", message, "persist:", persist);

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
                : <span key={message} className="inline-block animate-scroll-from-right">{message}</span>
            }
        </div>
    );
};

export default FloatingAdminMessage;
