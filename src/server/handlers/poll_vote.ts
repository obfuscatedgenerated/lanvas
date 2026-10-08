import type {SocketHandlerFunction} from "@/server/types";

import {get_vote_counts, vote_in_poll} from "@/server/polls";

export const handler: SocketHandlerFunction = ({io, payload, socket}) => {
    const user = socket.user!;

    if (typeof payload !== "number") {
        return;
    }

    // only broadcast when the vote actually landed in an active poll, otherwise a client could
    // spam this event to force a server-wide fan-out of poll_counts (often null) as an amplification DoS
    if (!vote_in_poll(user.sub!, payload)) {
        return;
    }

    const counts = get_vote_counts();
    if (!counts) {
        return;
    }

    // broadcast the updated counts to all connected clients
    io.emit("poll_counts", counts);
}
