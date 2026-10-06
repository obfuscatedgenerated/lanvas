"use client";

// the whole page is rotated 180 degrees as a casino curse, so anything working in screen coordinates needs to know

const FLIPPED_CLASS = "page-flipped";

export const is_page_flipped = (): boolean =>
    typeof document !== "undefined" && document.documentElement.classList.contains(FLIPPED_CLASS);

export const set_page_flipped = (flipped: boolean): void => {
    document.documentElement.classList.toggle(FLIPPED_CLASS, flipped);
};

// pointer events and bounding rects report where things appear on screen, but fixed elements are positioned in the unrotated page, so a screen point has to be mirrored before it can be used to place something
export const screen_to_page_space = (screen_x: number, screen_y: number): {page_x: number; page_y: number} =>
    is_page_flipped()
        ? {page_x: window.innerWidth - screen_x, page_y: window.innerHeight - screen_y}
        : {page_x: screen_x, page_y: screen_y};
