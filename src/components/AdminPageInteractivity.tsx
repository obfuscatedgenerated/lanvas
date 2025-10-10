"use client";

import { useEffect } from "react";
import {socket} from "@/socket";

const AdminPageInteractivity = () => {
    // setup socket
    useEffect(() => {
        socket.on("connect", () => console.log("Connected!", socket.id));

        return () => {
            socket.disconnect();
        }
    }, []);

    return null;
}

export default AdminPageInteractivity;
