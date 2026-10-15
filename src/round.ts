import { randomInt } from "./random";
import type { PresentedQuestion, RoundOrder } from "./types";

/** How a question of a round stands. */
export type SlotOutcome = "correct" | "wrong" | "skipped" | "open";

/** One question of a round, with what the user did with it. */
export interface RoundSlot
{
    n: number;
    outcome: SlotOutcome;
    /** The question as it was shown (its options keep their order), or null before it was shown. */
    item: PresentedQuestion | null;
    /** The option the user chose, as a position in the shown options, or null. */
    selected: number | null;
}

/** Builds the question as shown. */
export type Presenter = (questionNumber: number, shuffle: boolean) => PresentedQuestion;

/** Counts for the head of the timeline. */
export interface RoundCounts
{
    correct: number;
    wrong: number;
    skipped: number;
    /** Questions not asked yet. */
    open: number;
    /** All questions of the round. */
    total: number;
    /** Questions with an answer. */
    answered: number;
}

/**
 * A round of practice: a list of questions in one order, with the answer to each, the question that is
 * shown, and the place where the round goes on.
 *
 * In booklet order every slot exists from the start, so the timeline shows what is coming. In random
 * order the next question is drawn only when the user moves on, so only the slots seen so far exist.
 * Skipping is allowed. A skipped question stays in the round, can be answered later in its own place,
 * and is never offered again by Next. Any move forward that leaves a question without an answer marks it as
 * skipped, whether it was made with the Skip button or by jumping ahead in the timeline. An answer can be changed
 * unless the round locks answers.
 */
export class Round
{
    /** The order of the round. */
    public readonly order: RoundOrder;

    /** The slots seen so far (booklet order: all slots). */
    public readonly slots: RoundSlot[] = [];

    /** Index of the slot that is shown, or -1 for the end of the round. */
    public view = 0;

    /** Index of the slot where Next goes on. It differs from `view` while the user looks at another slot. */
    public resume = 0;

    /** True once there is nothing left to ask. Skipped questions may remain. */
    public ended = false;

    /** Random order: question numbers that were not drawn yet. */
    private readonly remaining: number[] = [];

    private readonly present: Presenter;

    /** Whether an answer that was given cannot be changed. */
    private readonly lock: boolean;

    /**
     * @param numbers Question numbers of the round, in any order.
     * @param order Random, or ascending by number as in the booklet.
     * @param present Builds a question as shown.
     * @param lock Whether an answer that was given is final. Off: it can be changed, and the new answer counts.
     */
    public constructor(numbers: readonly number[], order: RoundOrder, present: Presenter, lock = false)
    {
        this.order = order;
        this.present = present;
        this.lock = lock;
        const sorted = [...numbers].sort((first, second) => first - second);
        if (order === "booklet")
        {
            this.slots.push(...sorted.map((n): RoundSlot => ({ n, outcome: "open", item: null, selected: null })));
        }
        else
        {
            this.remaining.push(...sorted);
            this.draw();
        }
        if (this.slots.length === 0)
        {
            this.end();
        }
        else
        {
            this.ensureItem(0);
        }
    }

    /** The slot that is shown, or undefined at the end of the round. */
    public get current(): RoundSlot | undefined
    {
        return this.view >= 0 ? this.slots[this.view] : undefined;
    }

    /** Whether the user looks at another slot than the one where Next goes on. */
    public get isDetour(): boolean
    {
        return !this.ended && this.view >= 0 && this.view !== this.resume;
    }

    /** Whether answers are final in this round. */
    public get locked(): boolean
    {
        return this.lock;
    }

    /** Whether an option of the question that is shown can be chosen: it has no answer yet, or answers can be changed. */
    public get canAnswer(): boolean
    {
        const slot = this.current;
        if (slot === undefined)
        {
            return false;
        }
        return slot.selected === null ? (slot.outcome === "open" || slot.outcome === "skipped") : !this.lock;
    }

    /** All questions of the round, including those not drawn yet. */
    public get total(): number
    {
        return this.slots.length + this.remaining.length;
    }

    /** Counts of every state. */
    public get counts(): RoundCounts
    {
        const count = (outcome: SlotOutcome): number => this.slots.filter((slot) => slot.outcome === outcome).length;
        const correct = count("correct");
        const wrong = count("wrong");
        return {
            correct,
            wrong,
            skipped: count("skipped"),
            open: count("open") + this.remaining.length,
            total: this.total,
            answered: correct + wrong,
        };
    }

    /** Question numbers that were answered wrongly in this round. */
    public get mistakes(): number[]
    {
        return this.slots.filter((slot) => slot.outcome === "wrong").map((slot) => slot.n);
    }

    /** Whether the right hand button leads to another question (and not to the end of the round). */
    public get hasNext(): boolean
    {
        if (this.ended)
        {
            return false;
        }
        return this.order === "random" ? this.remaining.length > 0 : this.slots.some((slot, index) => slot.outcome === "open" && index !== this.resume);
    }

    /** Whether there is an earlier question to look at. */
    public get canGoBack(): boolean
    {
        return this.previousIndex() !== -1;
    }

    /**
     * Records the answer to the question that is shown. Choosing the option that is already chosen changes nothing.
     * @param optionIndex Position of the chosen option among the shown options.
     * @returns The question number, whether it was right, and whether it is the first answer to this question in the
     * round (a later one is a changed answer), or null when nothing was recorded.
     */
    public answer(optionIndex: number): { n: number; wasCorrect: boolean; first: boolean } | null
    {
        const slot = this.current;
        if (!slot || !this.canAnswer || !slot.item || optionIndex < 0 || optionIndex >= slot.item.options.length || slot.selected === optionIndex)
        {
            return null;
        }
        const wasCorrect = slot.item.options[optionIndex].isCorrect;
        const first = slot.selected === null;
        slot.selected = optionIndex;
        slot.outcome = wasCorrect ? "correct" : "wrong";
        return { n: slot.n, wasCorrect, first };
    }

    /**
     * The right hand button. On the current question it skips (if unanswered) or goes on. While looking at
     * another question it returns to where the round goes on. At the end it walks through skipped questions.
     */
    public advance(): void
    {
        if (this.ended)
        {
            const next = this.slots.findIndex((slot, index) => index > this.view && slot.outcome === "skipped");
            this.view = next === -1 ? -1 : next;
            this.ensureView();
            return;
        }
        if (this.view !== this.resume)
        {
            this.view = this.resume;
            this.ensureView();
            return;
        }
        if (this.slots[this.view].outcome === "open")
        {
            this.slots[this.view].outcome = "skipped";
        }
        const target = this.nextTarget();
        if (target === null)
        {
            this.end();
            return;
        }
        this.resume = target;
        this.view = target;
        this.ensureView();
    }

    /**
     * A click on a slot of the timeline. Answered and skipped questions are shown. A question that was not
     * asked yet (booklet order) becomes the place where the round goes on, and jumping ahead to it leaves
     * every question that was passed on the way without an answer marked as skipped, as the Skip button does.
     * @param index Index of the slot.
     */
    public open(index: number): void
    {
        const slot = this.slots[index];
        if (!slot)
        {
            return;
        }
        if (slot.outcome === "open" && !this.ended)
        {
            for (let passed = this.resume; passed < index; passed++)
            {
                if (this.slots[passed].outcome === "open")
                {
                    this.slots[passed].outcome = "skipped";
                }
            }
            this.resume = index;
        }
        if (slot.outcome === "open" && this.ended)
        {
            return;
        }
        this.view = index;
        this.ensureView();
    }

    /** Goes to the previous question that was answered or skipped. */
    public back(): void
    {
        const previous = this.previousIndex();
        if (previous !== -1)
        {
            this.view = previous;
            this.ensureView();
        }
    }

    /** At the end of the round: shows the first skipped question, so it can be answered. */
    public answerSkipped(): void
    {
        const first = this.slots.findIndex((slot) => slot.outcome === "skipped");
        if (first !== -1)
        {
            this.view = first;
            this.ensureView();
        }
    }

    /** Ends the round now and shows its summary. Questions that were not asked stay as they are. */
    public finish(): void
    {
        if (!this.ended)
        {
            this.end();
        }
    }

    /** Ends the round and shows its summary. */
    private end(): void
    {
        this.ended = true;
        this.view = -1;
    }

    /**
     * The question to ask next, or null when none is left. In random order it is drawn now.
     * In booklet order it is the next unasked question after this one, and then the ones left behind by a jump.
     * @returns Slot index or null.
     */
    private nextTarget(): number | null
    {
        if (this.order === "random")
        {
            return this.draw();
        }
        const after = this.slots.findIndex((slot, index) => index > this.resume && slot.outcome === "open");
        if (after !== -1)
        {
            return after;
        }
        const before = this.slots.findIndex((slot, index) => index < this.resume && slot.outcome === "open");
        return before === -1 ? null : before;
    }

    /**
     * Draws a random question that was not drawn yet and appends it as a slot.
     * @returns Index of the new slot, or null when none is left.
     */
    private draw(): number | null
    {
        if (this.remaining.length === 0)
        {
            return null;
        }
        const [n] = this.remaining.splice(randomInt(this.remaining.length), 1);
        this.slots.push({ n, outcome: "open", item: null, selected: null });
        return this.slots.length - 1;
    }

    /** Makes sure the question that is shown has been built. */
    private ensureView(): void
    {
        if (this.view >= 0)
        {
            this.ensureItem(this.view);
        }
    }

    /**
     * Builds the question of a slot the first time it is needed, so its options keep their order afterwards.
     * @param index Slot index.
     */
    private ensureItem(index: number): void
    {
        const slot = this.slots[index];
        if (slot.item === null)
        {
            slot.item = this.present(slot.n, this.order === "random");
        }
    }

    /**
     * Index of the previous answered or skipped slot before the one that is shown.
     * @returns Slot index, or -1.
     */
    private previousIndex(): number
    {
        const from = this.view === -1 ? this.slots.length : this.view;
        for (let index = from - 1; index >= 0; index--)
        {
            if (this.slots[index].outcome !== "open")
            {
                return index;
            }
        }
        return -1;
    }
}
