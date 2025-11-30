import type {SocketHandlerFunction} from "@/server/types";

import {get_vote_counts, vote_in_poll} from "@/server/polls";

export const handler: SocketHandlerFunction = ({io, payload, socket}) => {
    const user = socket.user!;

    if (typeof payload !== "number") {
        return;
    }

    vote_in_poll(user.sub!, payload);

    const counts = get_vote_counts();

    // broadcast the updated counts to all connected clients
    io.emit("poll_counts", counts);
}
