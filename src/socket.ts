"use client";

import { io } from "socket.io-client";

// TODO: dont let this run on server side

export const socket = io({
    withCredentials: true,
    query: {
        context: typeof window !== "undefined" ? window.location.pathname : "SSR"
    }
});

// TODO: make this work between page changes somehow so <Link /> can be used for navigation
//  (saving jwt reloading by keeping login state in client but letting page changes happen)
//  template.tsx can be used to make effects re-run but the singleton here remains loaded across page changes it seems
//  need to change how connection and initial loading works or reset it here on page change
