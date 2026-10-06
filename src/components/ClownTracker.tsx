"use client";

import {useEffect} from "react";

import {socket} from "@/socket";
import {clown_user} from "@/lib/clowned";

interface ClownedUser {
    user_id: string;
    remaining_ms: number;
}

// keeps the clown store in sync with the server, renders nothing
const ClownTracker = () => {
    useEffect(() => {
        const handle_clowned = ({user_id, remaining_ms}: ClownedUser) => clown_user(user_id, remaining_ms);

        const handle_clowned_users = (clowned_users: ClownedUser[]) => {
            for (const {user_id, remaining_ms} of clowned_users) {
                clown_user(user_id, remaining_ms);
            }
        };

        socket.on("clowned", handle_clowned);
        socket.on("clowned_users", handle_clowned_users);
        socket.emit("request_clowned_users");

        return () => {
            socket.off("clowned", handle_clowned);
            socket.off("clowned_users", handle_clowned_users);
        };
    }, []);

    return null;
};

export default ClownTracker;