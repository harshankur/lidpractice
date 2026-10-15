import { MS_PER_SECOND, SECONDS_PER_MINUTE } from "../constants";
import { shuffled } from "../random";
import type { Card } from "./types";

/**
 * When a flash card comes back: five boxes on calendar days (Leitner). A card that is known moves up one box and waits
 * longer; a card that is not known goes back to the first box. Knowing a card on the day it was last seen never moves it
 * up, so the boxes show what was still known after a real pause.
 */

/** Days a card waits in each of the five boxes before it is due again. */
const WAIT_FIRST = 1;
const WAIT_SECOND = 3;
const WAIT_THIRD = 7;
const WAIT_FOURTH = 14;
const WAIT_FIFTH = 30;

/** The waits of the boxes, box 1 first. A card that is always known is seen on days 1, 4, 11, 25 and 55. */
export const BOX_WAITS: readonly number[] = [WAIT_FIRST, WAIT_SECOND, WAIT_THIRD, WAIT_FOURTH, WAIT_FIFTH];

/** The highest box. */
export const LAST_BOX = BOX_WAITS.length;

/** A lesson counts as secure when every card of it has reached this box. */
export const SECURE_BOX = 3;

/** The most cards a review session holds. */
export const SESSION_SIZE = 20;

/** A card that was not known comes back in the same session after this many other cards. */
export const CARD_RETRY_GAP = 3;

/** Minutes in an hour and hours in a day, for counting days. */
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;

/** Milliseconds in a day. */
const MS_PER_DAY = HOURS_PER_DAY * MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MS_PER_SECOND;

/** Where a card stands. */
export interface CardState
{
    /** Its box, 1 to {@link LAST_BOX}. */
    box: number;
    /** The day it is due, as a day number (see {@link dayNumber}). */
    due: number;
}

/**
 * The number of a calendar day where the user is: days since 1 January 1970 in local time, so that "tomorrow" begins at midnight.
 * @param moment A moment.
 * @returns The day number.
 */
export function dayNumber(moment: Date): number
{
    return Math.floor((moment.getTime() - moment.getTimezoneOffset() * SECONDS_PER_MINUTE * MS_PER_SECOND) / MS_PER_DAY);
}

/**
 * A card that is new: in the first box, due the next day.
 * @param today The day number of today.
 * @returns Its state.
 */
export function introduce(today: number): CardState
{
    return { box: 1, due: today + BOX_WAITS[0] };
}

/**
 * Whether a card is due.
 * @param state Its state.
 * @param today The day number of today.
 * @returns True when its day has come.
 */
export function isDue(state: CardState, today: number): boolean
{
    return state.due <= today;
}

/**
 * What an answer does to a card.
 * @param state The state of the card.
 * @param known Whether the user knew the answer.
 * @param today The day number of today.
 * @returns The new state. A card that was known before it was due stays as it is.
 */
export function grade(state: CardState, known: boolean, today: number): CardState
{
    if (!known)
    {
        return introduce(today);
    }
    if (!isDue(state, today))
    {
        return state;
    }
    const box = Math.min(LAST_BOX, state.box + 1);
    return { box, due: today + BOX_WAITS[box - 1] };
}

/**
 * Puts cards in an order in which two cards of the same lesson are not neighbours, as far as that is possible.
 * @param cards The cards.
 * @param shuffle Shuffles a list. Replaced in tests.
 * @returns The cards in the new order.
 */
export function spread(cards: readonly Card[], shuffle: <T>(items: readonly T[]) => T[] = shuffled): Card[]
{
    const waiting = shuffle(cards);
    const ordered: Card[] = [];
    while (waiting.length > 0)
    {
        const last = ordered[ordered.length - 1];
        // The lesson with the most cards left goes first, unless it was the last one: that leaves the fewest pairs at the end.
        const counts = new Map<string, number>();
        for (const card of waiting)
        {
            counts.set(card.lesson, (counts.get(card.lesson) ?? 0) + 1);
        }
        const candidates = waiting.filter((card) => card.lesson !== last?.lesson);
        const pool = candidates.length > 0 ? candidates : waiting;
        const next = pool.reduce((best, card) => ((counts.get(card.lesson) as number) > (counts.get(best.lesson) as number) ? card : best));
        waiting.splice(waiting.indexOf(next), 1);
        ordered.push(next);
    }
    return ordered;
}

/**
 * The cards of a review: those that are due, the longest overdue first, at most {@link SESSION_SIZE}, mixed across lessons.
 * @param cards Every card of the course.
 * @param states Where the cards stand, by card id. A card without a state was not introduced yet and is left out.
 * @param today The day number of today.
 * @param shuffle Shuffles a list. Replaced in tests.
 * @returns The cards of the session and how many are due in all.
 */
export function dueSession(
    cards: readonly Card[],
    states: Readonly<Record<string, CardState>>,
    today: number,
    shuffle: <T>(items: readonly T[]) => T[] = shuffled,
): { cards: Card[]; due: number }
{
    const due = cards
        .filter((card) => states[card.id] !== undefined && isDue(states[card.id], today))
        .sort((first, second) => states[first.id].due - states[second.id].due);
    return { cards: spread(due.slice(0, SESSION_SIZE), shuffle), due: due.length };
}

/**
 * One run through a set of cards. A card that was not known comes back after a few others until it was known once.
 * The session only says what to show next; what an answer does to the boxes is up to the caller.
 */
export class CardSession
{
    private readonly queue: Card[];
    private shown = false;
    private knownCount = 0;
    private readonly missed = new Set<string>();

    /** How many cards the session started with. */
    public readonly total: number;

    /**
     * @param cards The cards, in the order they are asked.
     */
    public constructor(cards: readonly Card[])
    {
        this.queue = [...cards];
        this.total = cards.length;
    }

    /** The card that is up, or undefined when the session is over. */
    public get current(): Card | undefined
    {
        return this.queue[0];
    }

    /** Whether the answer of the card that is up is showing. */
    public get revealed(): boolean
    {
        return this.shown;
    }

    /** How many cards were known. */
    public get known(): number
    {
        return this.knownCount;
    }

    /** How many different cards were not known at least once. */
    public get again(): number
    {
        return this.missed.size;
    }

    /** How many cards are still to come, the one that is up included. */
    public get remaining(): number
    {
        return this.queue.length;
    }

    /** Shows the answer of the card that is up. */
    public reveal(): void
    {
        if (this.current)
        {
            this.shown = true;
        }
    }

    /**
     * Takes the answer to the card that is up, and moves on.
     * @param known Whether the user knew it.
     * @returns The card that was answered and whether this was its first answer in the session, or undefined when no answer was due.
     */
    public rate(known: boolean): { card: Card; first: boolean } | undefined
    {
        const card = this.queue[0];
        if (!card || !this.shown)
        {
            return undefined;
        }
        const first = !this.missed.has(card.id);
        this.queue.shift();
        this.shown = false;
        if (known)
        {
            this.knownCount += 1;
        }
        else
        {
            this.missed.add(card.id);
            this.queue.splice(Math.min(CARD_RETRY_GAP, this.queue.length), 0, card);
        }
        return { card, first };
    }
}
