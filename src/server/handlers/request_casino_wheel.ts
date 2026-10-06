import type {SocketHandlerFunction} from "@/server/types";

import {get_pot, get_wheel_segments} from "@/server/casino";

// the wheel's slices come from the server so they always match the real odds
export const handler: SocketHandlerFunction = ({socket}) => {
    socket.emit("casino_wheel", {
        segments: get_wheel_segments(),
        pot: get_pot(),
    });
}
