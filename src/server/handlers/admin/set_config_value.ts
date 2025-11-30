import type {SocketHandlerFunction, SocketHandlerFlags} from "@/server/types";

import {set_config} from "@/server/config";

export const handler: SocketHandlerFunction = async ({io, socket, pool, payload}) => {
    const user = socket.user!;
    const {key, value, is_public} = payload;

    if (is_public === undefined) {
        console.log(`admin_set_config_value missing is_public by ${socket.id} (user id: ${user.sub})`);
        return;
    }

    // update in-memory config
    await set_config(pool, key, value, is_public);
    console.log(`Config key ${key} set to ${value} by admin ${user.name} (id: ${user.sub}), public: ${is_public}`);

    // if public, broadcast the new value to all clients
    if (is_public) {
        io.emit("config_value", {key, value});
    } else {
        // otherwise only send to admin room
        io.to("admin").emit("config_value", {key, value});
    }
}

export const flags: SocketHandlerFlags = {
    require_admin: true,
}
