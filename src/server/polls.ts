export type PollSource = "admin" | "chaos";

let question: string | null = null;
let options: string[] | null = null;
let votes: Map<string, number> | null = null; // user id to option index
let source: PollSource | null = null; // who started the active poll, so chaos and admin polls don't clobber each other

export const start_poll = (question_text: string, option_list: string[], poll_source: PollSource = "admin") => {
    question = question_text;
    options = option_list;
    votes = new Map();
    source = poll_source;
}

// null when no poll is active, otherwise who started it
export const get_poll_source = (): PollSource | null => source;

export const get_poll_question = () => {
    return question;
}

export const get_poll_options = () => {
    return options;
}

export const get_vote_counts = () => {
    if (!options || !votes) {
        return null;
    }

    const counts = new Array(options.length).fill(0);
    for (const option_index of votes.values()) {
        counts[option_index]++;
    }

    return counts;
}

// returns true only when the vote was accepted into an active poll
export const vote_in_poll = (user_id: string, option_index: number): boolean => {
    if (votes && options && Number.isInteger(option_index) && option_index >= 0 && option_index < options.length) {
        votes.set(user_id, option_index);
        return true;
    }

    return false;
}

export const has_user_voted = (user_id: string) => {
    return votes ? votes.has(user_id) : false;
}

export const end_poll = () => {
    const counts = get_vote_counts();

    question = null;
    options = null;
    votes = null;
    source = null;

    return counts;
}
