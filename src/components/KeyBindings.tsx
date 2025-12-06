"use client";

import { useEffect } from "react";

interface KeyBindingsProps {
    bindings: {  [key: string]: (event: KeyboardEvent) => void };
    enabled?: boolean;
}

const KeyBindings = ({ bindings, enabled = true }: KeyBindingsProps) => {
    useEffect(() => {
        if (!enabled) {
            return;
        }

        const keydown = (event: KeyboardEvent) => {
            const handler = bindings[event.key];

            if (handler) {
                handler(event);
            }
        };

        window.addEventListener("keydown", keydown);
        return () => {
            window.removeEventListener("keydown", keydown);
        };
    }, [bindings, enabled]);

    return null;
};

export default KeyBindings;
