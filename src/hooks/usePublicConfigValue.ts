"use client";

import {useEffect, useState} from "react";
import {socket} from "@/socket";

interface ConfigValueMessage {
    key: string;
    value: unknown;
}

// requests a public config key and stays in sync with live changes broadcast by the admin
const usePublicConfigValue = <ValueType,>(config_key: string, default_value: ValueType): ValueType => {
    const [value, setValue] = useState<ValueType>(default_value);

    useEffect(() => {
        const handle_config_value = ({key, value: incoming}: ConfigValueMessage) => {
            if (key !== config_key) {
                return;
            }

            setValue((incoming === undefined || incoming === null ? default_value : incoming) as ValueType);
        };

        socket.on("config_value", handle_config_value);
        socket.emit("get_public_config_value", config_key);

        return () => {
            socket.off("config_value", handle_config_value);
        };
    }, [config_key, default_value]);

    return value;
};

export default usePublicConfigValue;
