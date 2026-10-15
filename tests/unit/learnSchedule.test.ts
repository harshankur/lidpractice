import { describe, expect, it } from "vitest";
import {
    BOX_WAITS, CARD_RETRY_GAP, CardSession, LAST_BOX, SECURE_BOX, SESSION_SIZE, dayNumber, dueSession, grade, introduce, isDue, spread, type CardState,
} from "../../src/learn/schedule";
import type { Card } from "../../src/learn/types";

/** A day to count from. */
const TODAY = 20000;

/** Leaves a list in its order, so a test knows what comes out. */
const keep = <T>(items: readonly T[]): T[] => [...items];

/**
 * Makes a card.
 * @param id Its id, which is also its unit.
 * @param lesson The lesson it belongs to.
 * @returns The card.
 */
function card(id: string, lesson = "one"): Card
{
    return { id: `${lesson}/${id}`, lesson, unit: id, front: `front ${id}`, questions: [] };
}

describe("the boxes", () =>
{
    it("are five, with waits of 1, 3, 7, 14 and 30 days, and a lesson is secure from box 3", () =>
    {
        expect(BOX_WAITS).toEqual([1, 3, 7, 14, 30]);
        expect(LAST_BOX).toBe(5);
        expect(SECURE_BOX).toBe(3);
    });

    it("count days where the user is, so that tomorrow begins at midnight there", () =>
    {
        const lateEvening = new Date(2026, 9, 12, 23, 59);
        const justAfter = new Date(2026, 9, 13, 0, 1);
        const nextNoon = new Date(2026, 9, 13, 12, 0);
        expect(dayNumber(justAfter) - dayNumber(lateEvening)).toBe(1);
        expect(dayNumber(nextNoon)).toBe(dayNumber(justAfter));
        expect(Number.isInteger(dayNumber(lateEvening))).toBe(true);
    });

    it("put a new card into the first box, due the next day", () =>
    {
        expect(introduce(TODAY)).toEqual({ box: 1, due: TODAY + 1 });
        expect(isDue(introduce(TODAY), TODAY)).toBe(false);
        expect(isDue(introduce(TODAY), TODAY + 1)).toBe(true);
        expect(isDue(introduce(TODAY), TODAY + 9)).toBe(true);
    });

    it("move a card that was known on its day one box up, with the wait of that box", () =>
    {
        let state: CardState = introduce(TODAY);
        const seen: number[] = [];
        for (let step = 0; step < LAST_BOX; step++)
        {
            const day = state.due;
            seen.push(day - TODAY);
            state = grade(state, true, day);
        }
        // A card that is always known is seen on days 1, 4, 11, 25 and 55, and then stays in the last box.
        expect(seen).toEqual([1, 4, 11, 25, 55]);
        expect(state.box).toBe(LAST_BOX);
        expect(grade(state, true, state.due)).toEqual({ box: LAST_BOX, due: state.due + BOX_WAITS[LAST_BOX - 1] });
    });

    it("send a card that was not known back to the first box, from any box", () =>
    {
        expect(grade({ box: 4, due: TODAY }, false, TODAY)).toEqual({ box: 1, due: TODAY + 1 });
        expect(grade({ box: 1, due: TODAY + 5 }, false, TODAY)).toEqual({ box: 1, due: TODAY + 1 });
    });

    it("never move a card up that was known before its day: only knowing it after the pause counts", () =>
    {
        const waiting: CardState = { box: 2, due: TODAY + 2 };
        expect(grade(waiting, true, TODAY)).toBe(waiting);
        expect(grade(waiting, true, TODAY + 2)).toEqual({ box: 3, due: TODAY + 2 + BOX_WAITS[2] });
    });
});

describe("a review of the cards that are due", () =>
{
    it("takes the cards whose day has come, and leaves out cards that are not due or were never introduced", () =>
    {
        const cards = [card("a"), card("b"), card("c"), card("d")];
        const states = { "one/a": { box: 1, due: TODAY }, "one/b": { box: 2, due: TODAY + 1 }, "one/c": { box: 1, due: TODAY - 3 } };
        const session = dueSession(cards, states, TODAY, keep);
        expect(session.due).toBe(2);
        expect(session.cards.map((entry) => entry.unit).sort()).toEqual(["a", "c"]);
    });

    it("holds at most 20 cards, the longest overdue first, and still says how many are due in all", () =>
    {
        const cards = Array.from({ length: 30 }, (_, index) => card(`c${index}`, `lesson${index}`));
        const states = Object.fromEntries(cards.map((entry, index) => [entry.id, { box: 1, due: TODAY - index }]));
        const session = dueSession(cards, states, TODAY, keep);
        expect(SESSION_SIZE).toBe(20);
        expect(session.due).toBe(30);
        expect(session.cards).toHaveLength(SESSION_SIZE);
        // The ten cards that became due last wait for the next round.
        expect(session.cards.map((entry) => entry.unit)).not.toContain("c0");
        expect(session.cards.map((entry) => entry.unit)).toContain("c29");
    });

    it("mixes the lessons, so two cards of one lesson are not neighbours where that is possible", () =>
    {
        const cards = [card("a1", "a"), card("a2", "a"), card("a3", "a"), card("b1", "b"), card("b2", "b"), card("c1", "c")];
        const order = spread(cards, keep).map((entry) => entry.lesson);
        expect([...order].sort()).toEqual(["a", "a", "a", "b", "b", "c"]);
        for (let index = 1; index < order.length; index++)
        {
            expect(order[index], order.join(" ")).not.toBe(order[index - 1]);
        }
    });

    it("puts cards of one lesson next to each other only when there is no other card left", () =>
    {
        const order = spread([card("a1", "a"), card("a2", "a"), card("a3", "a"), card("b1", "b")], keep).map((entry) => entry.lesson);
        expect(order).toEqual(["a", "b", "a", "a"]);
        expect(spread([], keep)).toEqual([]);
    });

    it("shuffles with the random source of the site when no other is given, and loses no card", () =>
    {
        const cards = [card("a"), card("b"), card("c")];
        expect(spread(cards).map((entry) => entry.unit).sort()).toEqual(["a", "b", "c"]);
        expect(dueSession(cards, { "one/a": { box: 1, due: TODAY } }, TODAY).cards.map((entry) => entry.unit)).toEqual(["a"]);
    });
});

describe("one run through cards", () =>
{
    it("shows one card at a time and waits for the answer to be uncovered before it takes a rating", () =>
    {
        const session = new CardSession([card("a"), card("b")]);
        expect(session.total).toBe(2);
        expect(session.current?.unit).toBe("a");
        expect(session.revealed).toBe(false);
        expect(session.rate(true)).toBeUndefined();
        expect(session.current?.unit).toBe("a");
        session.reveal();
        expect(session.revealed).toBe(true);
        expect(session.rate(true)).toEqual({ card: card("a"), first: true });
        expect(session.current?.unit).toBe("b");
        expect(session.revealed).toBe(false);
        expect(session.remaining).toBe(1);
    });

    it("ends when every card was known, and then takes nothing more", () =>
    {
        const session = new CardSession([card("a")]);
        session.reveal();
        session.rate(true);
        expect(session.current).toBeUndefined();
        expect(session.remaining).toBe(0);
        expect(session.known).toBe(1);
        expect(session.again).toBe(0);
        session.reveal();
        expect(session.revealed).toBe(false);
        expect(session.rate(true)).toBeUndefined();
    });

    it("brings a card that was not known back after three other cards, until it was known once", () =>
    {
        const session = new CardSession(["a", "b", "c", "d", "e"].map((id) => card(id)));
        const order: string[] = [];
        const answer = (known: boolean): { card: Card; first: boolean } | undefined =>
        {
            order.push(session.current?.unit as string);
            session.reveal();
            return session.rate(known);
        };
        expect(CARD_RETRY_GAP).toBe(3);
        expect(answer(false)?.first).toBe(true);
        answer(true);
        answer(true);
        answer(true);
        // The card that was missed is up again, and this answer is not its first.
        expect(session.current?.unit).toBe("a");
        expect(answer(false)?.first).toBe(false);
        answer(true);
        expect(session.current?.unit).toBe("a");
        expect(answer(true)?.first).toBe(false);
        expect(session.current).toBeUndefined();
        expect(order).toEqual(["a", "b", "c", "d", "a", "e", "a"]);
        expect(session.again).toBe(1);
        expect(session.known).toBe(5);
    });

    it("puts a missed card at the end when fewer than three cards are left", () =>
    {
        const session = new CardSession([card("a"), card("b")]);
        session.reveal();
        session.rate(false);
        expect(session.current?.unit).toBe("b");
        expect(session.remaining).toBe(2);
        session.reveal();
        session.rate(true);
        expect(session.current?.unit).toBe("a");
    });

    it("is over at once when it has no cards", () =>
    {
        const session = new CardSession([]);
        expect(session.total).toBe(0);
        expect(session.current).toBeUndefined();
    });
});
