import states from "../data/states.json";
import { LAST_GENERAL_NUMBER } from "./constants";

/** A federal state, as the catalogue lists it. */
export interface StateInfo
{
    /** Id, also the category id of the questions of the state. */
    id: string;
    /** Two letter code (ISO 3166-2:DE), used in short labels such as "BE 3". */
    code: string;
    /** Name as printed in the catalogue. */
    name: string;
}

/** The 16 federal states in the order of the catalogue. */
export const STATES: readonly StateInfo[] = states;

/** The state that is chosen until the user chooses another one. */
export const DEFAULT_STATE = "berlin";

/** Number of tasks per federal state in the catalogue. */
export const QUESTIONS_PER_STATE = 10;

/** Ids of all states. */
export const STATE_IDS: readonly string[] = STATES.map((state) => state.id);

/**
 * The state a question number belongs to. State questions are numbered from 301 in the order of the catalogue.
 * @param questionNumber Question number.
 * @returns The state, or undefined for a general question or a number beyond the last state.
 */
export function stateOfNumber(questionNumber: number): StateInfo | undefined
{
    return questionNumber > LAST_GENERAL_NUMBER
        ? STATES[Math.floor((questionNumber - LAST_GENERAL_NUMBER - 1) / QUESTIONS_PER_STATE)]
        : undefined;
}

/**
 * The task number printed in the catalogue: 1 to 300 for general questions, 1 to 10 within a state.
 * @param questionNumber Question number.
 * @returns Task number.
 */
export function taskOfNumber(questionNumber: number): number
{
    return questionNumber > LAST_GENERAL_NUMBER
        ? ((questionNumber - LAST_GENERAL_NUMBER - 1) % QUESTIONS_PER_STATE) + 1
        : questionNumber;
}

/**
 * Short name of a question that is the same in every language and tells the question apart from all others:
 * "123" for a general question, "BE 3" for task 3 of Berlin.
 * @param questionNumber Question number.
 * @returns The label.
 */
export function questionName(questionNumber: number): string
{
    const state = stateOfNumber(questionNumber);
    return state ? `${state.code} ${taskOfNumber(questionNumber)}` : String(questionNumber);
}
