import type {SocketHandlerFunction, SocketHandlerFlags} from "@/server/types";

import {set_config} from "@/server/config";

export const handler: SocketHandlerFunction = async ({ pool, io, payload }) => {
    if (typeof payload !== "boolean") {
        return;
    }

    await set_config(pool, "readonly", payload);
    console.log(`Readonly mode set to ${payload}`);

    // broadcast the new readonly value to all clients
    io.emit("readonly", payload);
}

export const flags: SocketHandlerFlags = {
    require_admin: true,
}
