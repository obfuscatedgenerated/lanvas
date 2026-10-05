import type {SocketHandlerFunction} from "@/server/types";

// unsubscribe from activity changes when the gifting ui closes
export const handler: SocketHandlerFunction = ({socket}) => {
    socket.leave("online_users");
}
