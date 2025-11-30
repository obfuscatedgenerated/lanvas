import type {SocketHandlerFunction, SocketHandlerFlags} from "@/server/types";

import {start_poll} from "@/server/polls";

export const handler: SocketHandlerFunction = ({io, payload}) => {
    const {question, options} = payload;
    if (typeof question !== "string" || !Array.isArray(options) || options.length < 2) {
        return;
    }

    // TODO: store poll in database and send to clients on connection

    start_poll(question, options);

    console.log(`Admin started poll: ${question} [${options.join(", ")}]`);

    // broadcast the poll to all connected clients
    io.emit("poll", {question, options, counts: Array(options.length).fill(0)});
}

export const flags: SocketHandlerFlags = {
    require_admin: true,
}
