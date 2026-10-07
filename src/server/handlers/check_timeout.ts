import type { SocketHandlerFunction } from "@/server/types";
import {get_calculated_pixel_timeout} from "@/server/timeouts";
import {get_config} from "@/server/config";

export const handler: SocketHandlerFunction = ({socket}) => {
    const user = socket.user;
    if (!user || !user.sub) {
        return;
    }

    const is_admin = user.sub === process.env.DISCORD_ADMIN_USER_ID;
    const god = is_admin && get_config("admin_god");

    if (god) {
        // admins in god mode do not have timeouts
        return;
    }

    const timeout = get_calculated_pixel_timeout(user.sub);
    if (timeout) {
        socket.emit("timeout_info", timeout);
    }
}
