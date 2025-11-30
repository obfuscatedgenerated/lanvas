let question: string | null = null;
let options: string[] | null = null;
let votes: Map<string, number> | null = null; // user id to option index

export const start_poll = (question_text: string, option_list: string[]) => {
    question = question_text;
    options = option_list;
    votes = new Map();
}

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

export const vote_in_poll = (user_id: string, option_index: number) => {
    if (votes && options && option_index >= 0 && option_index < options.length) {
        votes.set(user_id, option_index);
    }
}

export const has_user_voted = (user_id: string) => {
    return votes ? votes.has(user_id) : false;
}

export const end_poll = () => {
    const counts = get_vote_counts();

    question = null;
    options = null;
    votes = null;

    return counts;
}
