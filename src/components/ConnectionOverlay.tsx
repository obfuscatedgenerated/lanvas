"use client";

import {useEffect, useState} from "react";
import {socket} from "@/socket";
import {LoaderCircle} from "lucide-react";

const lan_number = process.env.NEXT_PUBLIC_LAN_NUMBER ?? "";

const ConnectionOverlay = () => {
    const [connected, setConnected] = useState(socket.connected);
    const [error, setError] = useState<string | null>(null);

    const [retrying, setRetrying] = useState(true);

    useEffect(() => {
        const handle_connect = () => {
            setConnected(true);
            setError(null);
            setRetrying(true);
        };

        const handle_disconnect = () => {
            setConnected(false);
        };

        const handle_connect_error = (connect_error: Error) => {
            setError(connect_error.message);
            setRetrying(socket.active);
        };

        socket.on("connect", handle_connect);
        socket.on("disconnect", handle_disconnect);
        socket.on("connect_error", handle_connect_error);

        // the socket may have connected between render and this effect
        setConnected(socket.connected);

        // only drop our own listeners, other components rely on connect for resyncing
        return () => {
            socket.off("connect", handle_connect);
            socket.off("disconnect", handle_disconnect);
            socket.off("connect_error", handle_connect_error);
        };
    }, []);

    if (connected) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 text-white">
            <div className="text-center">
                <h1 className="text-2xl sm:text-3xl font-bold font-doodle mb-12">LANvas {lan_number}</h1>

                {retrying
                    ? <>
                        <p className="text-xl font-semibold">Connecting...</p>
                        {error && <p className="text-sm text-neutral-400 mt-2">Retrying after error: {error}</p>}
                        <LoaderCircle className="mx-auto mt-4 h-8 w-8 animate-spin" />
                    </>
                    : <>
                        <p className="text-xl font-semibold text-red-500">Connection error: {error}</p>
                        <button
                            className="mt-6 px-4 py-2 rounded bg-white text-black font-semibold"
                            onClick={() => window.location.reload()}
                        >
                            Reload
                        </button>
                    </>
                }
            </div>
        </div>
    );
};

export default ConnectionOverlay;