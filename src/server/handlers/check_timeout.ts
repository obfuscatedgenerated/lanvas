import type { SocketHandlerFunction } from "@/server/types";
import {get_calculated_timeout} from "@/server/timeouts";
import {get_config} from "@/server/config";

import {CONFIG_KEY_ADMIN_GOD} from "@/consts";
import {DEFAULT_ADMIN_GOD} from "@/defaults";

export const handler: SocketHandlerFunction = ({socket}) => {
    const user = socket.user;
    if (!user || !user.sub) {
        return;
    }

    const is_admin = user.sub === process.env.DISCORD_ADMIN_USER_ID;
    const god = is_admin && get_config(CONFIG_KEY_ADMIN_GOD, DEFAULT_ADMIN_GOD);

    if (god) {
        // admins in god mode do not have timeouts
        return;
    }

    const timeout = get_calculated_timeout(user.sub);
    if (timeout) {
        socket.emit("timeout_info", timeout);
    }
}
