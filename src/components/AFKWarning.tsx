"use client";

import {useEffect, useState} from "react";
import {socket} from "@/socket";

export const AFKWarning = () => {
    const [is_active, setIsActive] = useState(true);

    useEffect(() => {
        socket.on("activity_change", ({is_active}: { is_active: boolean }) => {
            setIsActive(is_active);
        });
    }, []);

    if (is_active) {
        return null;
    }

    return (
        <div className="absolute top-0 left-0 right-0 bg-yellow-400 text-black text-center p-2 z-50">
            You are currently AFK and cannot recieve gifts. Move your mouse, press a key, or draw a pixel to become active again.
        </div>
    );
}
