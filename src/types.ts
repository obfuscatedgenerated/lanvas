export interface Author {
    name: string;
    user_id: string;
    avatar_url: string | null;
}

export interface OnlineUser extends Author {
    is_active: boolean;
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

    // relative rather than a timestamp, so client clock drift doesn't matter
    burst_remaining_ms: number;
    burst_gap_ms: number;
}

export interface GiftLogEntry {
    id: string;
    timestamp: number;
    from: {user_id: string; name: string | null};
    to: {user_id: string; name: string | null};
    amount: number;
    used: number;
}

export interface WheelSegment {
    id: string;
    label: string;
    color: string;
    weight?: number; // relative slice size, defaults to 1
}
