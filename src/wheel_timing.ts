// shared by the wheel and the server, so announcements go out the moment the spinner's wheel stops

export const WHEEL_SPIN_DURATION_MS = 4500;

export const WHEEL_SUSPENSE_SEGMENT_ID = "jackpot";
export const WHEEL_SLOWMO_LEAD_DEGREES = 70;
export const WHEEL_SLOWMO_DURATION_MS = 2600;

// a quick slip off a teased slice onto the real result
export const WHEEL_SLIP_DURATION_MS = 450;

// a beat after landing, so the result never shows up a frame before the wheel visibly stops
const LANDING_GRACE_MS = 150;

// how long the wheel takes from starting a spin to stopping on its final slice
export const wheel_spin_total_ms = (segment_id: string, tease_segment_id: string | null | undefined): number => {
    const first_stop = tease_segment_id ?? segment_id;

    let total = WHEEL_SPIN_DURATION_MS;

    if (first_stop === WHEEL_SUSPENSE_SEGMENT_ID) {
        total += WHEEL_SLOWMO_DURATION_MS;
    }

    if (tease_segment_id) {
        total += WHEEL_SLIP_DURATION_MS;
    }

    return total + LANDING_GRACE_MS;
};
