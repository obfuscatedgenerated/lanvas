import type {SocketHandlerFunction, SocketHandlerFlags} from "@/server/types";

import {end_poll, get_poll_options} from "@/server/polls";

export const handler: SocketHandlerFunction = ({io}) => {
    const options = get_poll_options()!;
    const counts = end_poll()!;

    // augment options to counts
    const results: Record<string, number> = {};
    options.forEach((option, index) => {
        results[option] = counts[index];
    });

    // get winners
    const max_votes = Math.max(...counts);
    const winners = options.filter((option, index) => counts[index] === max_votes);

    console.log(`Admin ended poll. Winners: ${winners} Results: ${JSON.stringify(results)}`);

    // broadcast the results to all connected clients
    io.emit("end_poll", {winners, results, total_votes: counts.reduce((a, b) => a + b, 0)});
}

export const flags: SocketHandlerFlags = {
    require_admin: true,
}
