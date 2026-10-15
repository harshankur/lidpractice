import { CLOCK_CRITICAL_MINUTES, CLOCK_NUDGE_MINUTES, CLOCK_WARN_MINUTES, MS_PER_SECOND, SECONDS_PER_MINUTE } from "./constants";

/** Milliseconds in one minute. */
const MS_PER_MINUTE = SECONDS_PER_MINUTE * MS_PER_SECOND;

/** Which way the clock runs: up from zero, or down from a set time. */
export type ClockMode = "up" | "down";

/** How urgent a count down is: calm, a colour nudge, a yellow border, a red border. */
export type ClockLevel = "calm" | "nudge" | "warn" | "critical";

/**
 * A clock that counts up from zero or down from a set time. It does not tick by itself: whoever uses it asks for the
 * time and passes the current time in, so it can be tested without waiting and survives a page that is drawn again.
 */
export class Clock
{
    /** Up or down. */
    public mode: ClockMode;

    /** Length of a count down, in milliseconds. */
    public durationMs: number;

    /** Time that ran before the last start, in milliseconds. */
    private before = 0;

    /** When the clock was last started, or null while it stands still. */
    private startedAt: number | null = null;

    /**
     * @param mode Up or down.
     * @param minutes Length of a count down, in minutes.
     */
    public constructor(mode: ClockMode, minutes: number)
    {
        this.mode = mode;
        this.durationMs = minutes * MS_PER_MINUTE;
    }

    /** Whether the clock is running. */
    public get running(): boolean
    {
        return this.startedAt !== null;
    }

    /**
     * Starts or continues.
     * @param now The current time in milliseconds.
     */
    public start(now: number): void
    {
        this.startedAt ??= now;
    }

    /**
     * Stops, keeping the time that ran.
     * @param now The current time in milliseconds.
     */
    public pause(now: number): void
    {
        if (this.startedAt !== null)
        {
            this.before += now - this.startedAt;
            this.startedAt = null;
        }
    }

    /** Stops and goes back to the start. */
    public reset(): void
    {
        this.before = 0;
        this.startedAt = null;
    }

    /**
     * How much time has run.
     * @param now The current time in milliseconds.
     * @returns Milliseconds, never negative.
     */
    public elapsed(now: number): number
    {
        return Math.max(0, this.before + (this.startedAt === null ? 0 : now - this.startedAt));
    }

    /**
     * How much of a count down is left.
     * @param now The current time in milliseconds.
     * @returns Milliseconds, never below zero.
     */
    public remaining(now: number): number
    {
        return Math.max(0, this.durationMs - this.elapsed(now));
    }

    /**
     * The time to show: what is left for a count down, what has run for a count up.
     * @param now The current time in milliseconds.
     * @returns Milliseconds.
     */
    public shown(now: number): number
    {
        return this.mode === "down" ? this.remaining(now) : this.elapsed(now);
    }

    /**
     * Whether a count down has run out.
     * @param now The current time in milliseconds.
     * @returns True for a count down at zero.
     */
    public over(now: number): boolean
    {
        return this.mode === "down" && this.remaining(now) <= 0;
    }

    /**
     * How urgent the time is. Only a count down has levels: a count up is never urgent.
     * @param now The current time in milliseconds.
     * @returns The level.
     */
    public level(now: number): ClockLevel
    {
        if (this.mode === "up")
        {
            return "calm";
        }
        const left = this.remaining(now);
        if (left <= CLOCK_CRITICAL_MINUTES * MS_PER_MINUTE)
        {
            return "critical";
        }
        if (left <= CLOCK_WARN_MINUTES * MS_PER_MINUTE)
        {
            return "warn";
        }
        return left <= CLOCK_NUDGE_MINUTES * MS_PER_MINUTE ? "nudge" : "calm";
    }
}
