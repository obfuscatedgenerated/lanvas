"use client";

import {add_debug_instrument} from "@/lib/debug_instrument";

import { io } from "socket.io-client";

// this module is a client component, but Next still executes it during SSR when rendering the initial
// HTML. autoConnect is therefore gated on the browser so the server never opens a stray connection;
// we connect explicitly below once we know we're client side.
const is_browser = typeof window !== "undefined";

export const socket = io({
    autoConnect: false,
    withCredentials: true,
    query: {
        context: is_browser ? window.location.pathname : "SSR"
    }
});

if (is_browser) {
    socket.connect();
    add_debug_instrument("socket", socket);
    add_debug_instrument("simulate_recv", (event: string, data: unknown) => {
        (socket as any).onpacket({
            type: 2,
            data: [event, data],
            nsp: "/"
        });
    });
}

// TODO: make this work between page changes somehow so <Link /> can be used for navigation
//  (saving jwt reloading by keeping login state in client but letting page changes happen)
//  template.tsx can be used to make effects re-run but the singleton here remains loaded across page changes it seems
//  need to change how connection and initial loading works or reset it here on page change
