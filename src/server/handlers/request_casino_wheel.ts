import type {SocketHandlerFunction} from "@/server/types";

import {get_pot, get_wheel_segments} from "@/server/casino";
import {get_calculated_casino_timeout} from "@/server/timeouts";

// the wheel's slices come from the server so they always match the real odds
export const handler: SocketHandlerFunction = ({socket}) => {
    const user_id = socket.user?.sub;
    const casino_timeout = user_id ? get_calculated_casino_timeout(user_id) : null;

    socket.emit("casino_wheel", {
        segments: get_wheel_segments(),
        pot: get_pot(),

        // so reopening the popup still shows the countdown from a spin made earlier
        casino_timeout_remaining_ms: casino_timeout ? casino_timeout.remaining : 0,
    });
}
