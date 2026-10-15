import { MS_PER_SECOND, SECONDS_PER_MINUTE } from "./constants";

/** Clock digits are padded to this width. */
const CLOCK_DIGITS = 2;

/**
 * Formats milliseconds as mm:ss. A time that is left rounds up, so a count down shows 00:00 only when the time is over.
 * A time that has run rounds down, so a count up shows 00:01 only after a whole second.
 * @param milliseconds Duration, negative values count as zero.
 * @param direction "down" for a time that is left, "up" for a time that has run.
 * @returns Text such as "59:03".
 */
export function formatClock(milliseconds: number, direction: "down" | "up" = "down"): string
{
    const seconds = milliseconds / MS_PER_SECOND;
    const totalSeconds = Math.max(0, direction === "down" ? Math.ceil(seconds) : Math.floor(seconds));
    const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
    const remainder = totalSeconds % SECONDS_PER_MINUTE;
    return `${String(minutes).padStart(CLOCK_DIGITS, "0")}:${String(remainder).padStart(CLOCK_DIGITS, "0")}`;
}
