"use client";

import {useEffect, useState} from "react";
import {socket} from "@/socket";

import {config_default, type ConfigKey, type ConfigValueType} from "@/config_registry";

interface ConfigValueMessage {
    key: string;
    value: unknown;
}

export interface PublicConfigState<K extends ConfigKey> {
    value: ConfigValueType<K>;
    // false until the server has answered for this key at least once. use it to avoid flashing a
    // value based on the registry default before the real value arrives (e.g. secret features).
    loaded: boolean;
}

// requests a public config key and stays in sync with live changes broadcast by the admin.
// returns the current value plus whether it has loaded yet. the default comes from the registry,
// but callers may override it (e.g. clamped bounds).
export const usePublicConfigState = <K extends ConfigKey>(config_key: K, default_override?: ConfigValueType<K>): PublicConfigState<K> => {
    const default_value = (default_override ?? config_default(config_key)) as ConfigValueType<K>;

    const [state, setState] = useState<PublicConfigState<K>>({value: default_value, loaded: false});

    useEffect(() => {
        const handle_config_value = ({key, value: incoming}: ConfigValueMessage) => {
            if (key !== config_key) {
                return;
            }

            // an unset key comes back null/undefined, which means "use the registry default"
            const resolved = (incoming === undefined || incoming === null ? default_value : incoming) as ConfigValueType<K>;
            setState({value: resolved, loaded: true});
        };

        socket.on("config_value", handle_config_value);
        socket.emit("get_public_config_value", config_key);

        return () => {
            socket.off("config_value", handle_config_value);
        };
    }, [config_key, default_value]);

    return state;
};

// convenience wrapper for callers that are happy to show the registry default until the real
// value arrives (timeouts, grid size, etc.)
const usePublicConfigValue = <K extends ConfigKey>(config_key: K, default_override?: ConfigValueType<K>): ConfigValueType<K> =>
    usePublicConfigState(config_key, default_override).value;

export default usePublicConfigValue;
