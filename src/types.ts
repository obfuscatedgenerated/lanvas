export interface Author {
    name: string;
    user_id: string;
    avatar_url: string | null;
}

export interface Comment {
    comment: string;
    x: number;
    y: number;
    author: Author;
}
