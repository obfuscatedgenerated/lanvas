import type {SocketHandlerFunction, SocketHandlerFlags} from "@/server/types";

import {get_poll_question, get_poll_options, get_vote_counts} from "@/server/polls";

export const handler: SocketHandlerFunction = ({socket}) => {
    const question = get_poll_question();
    if (!question) {
        return;
    }

    const options = get_poll_options()!;
    const counts = get_vote_counts()!;

    // send the poll to the requesting client
    socket.emit("poll", {question, options, counts});
}
