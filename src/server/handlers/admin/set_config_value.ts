import type {SocketHandlerFunction, SocketHandlerFlags} from "@/server/types";

import type {ConfigKey, ConfigValueType} from "@/config_registry";
import {set_config, is_config_key, is_config_key_public, validate_config_value} from "@/server/config";
import {get_visible_leaderboards} from "@/server/leaderboards";
import {FEATURE_TOGGLE_KEYS, get_visible_stats} from "@/server/feature_stats";
import {sync_chaos} from "@/server/chaos";

export const handler: SocketHandlerFunction = async ({io, socket, pool, payload}) => {
    const user = socket.user!;
    const {key, value} = payload ?? {};

    // the registry is the source of truth: reject unknown keys and values that don't fit the definition
    if (typeof key !== "string" || !is_config_key(key)) {
        console.log(`admin_set_config_value rejected unknown key ${key} by ${socket.id} (user id: ${user.sub})`);
        return;
    }

    const invalid_reason = validate_config_value(key, value);
    if (invalid_reason !== null) {
        console.log(`admin_set_config_value rejected value ${value} for key ${key} (${invalid_reason}) by ${socket.id} (user id: ${user.sub})`);
        return;
    }

    // visibility comes from the registry, not the client
    const is_public = is_config_key_public(key);

    // update in-memory config
    await set_config(pool, key, value as ConfigValueType<ConfigKey>);
    console.log(`Config key ${key} set to ${value} by admin ${user.name} (id: ${user.sub}), public: ${is_public}`);

    // if public, broadcast the new value to all clients
    if (is_public) {
        io.emit("config_value", {key, value});
    } else {
        // otherwise only send to admin room
        io.to("admin").emit("config_value", {key, value});
    }

    // revealing or hiding a feature shows or hides its stats straight away, rather than at the next gift or spin
    if (FEATURE_TOGGLE_KEYS.includes(key)) {
        io.to("stats").emit("stats", get_visible_stats());
        io.to("stats").emit("leaderboards", get_visible_leaderboards());
    }

    // start or stop the chaos scheduler the moment it's toggled, and revert live effects when turned off
    if (key === "chaos_enabled") {
        sync_chaos({io, pool});
    }
}

export const flags: SocketHandlerFlags = {
    require_admin: true,
}
