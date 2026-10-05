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

export interface HeldGift {
    id: string;
    from: Author;
    amount: number;
    expires: number;
}

export interface GiftInfo {
    balance: number;
    next_expiry: number | null;
    gifts: HeldGift[];
}
