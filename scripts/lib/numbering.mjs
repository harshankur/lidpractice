// How the questions of the catalogue are numbered in this project.
//
// The catalogue has 300 general tasks (part I) and, for each of the 16 federal states, 10 tasks (part II).
// Every question gets one number that is unique in the whole bank:
//
//   1 to 300      the general tasks, same number as printed
//   301 to 460    the state tasks, in the order of the catalogue: 300 + 10 * (index of the state) + task number
//                 (Baden-Württemberg 301 to 310, Bayern 311 to 320, Berlin 321 to 330, and so on)
import { readFileSync } from "node:fs";

/** The federal states in the order of the catalogue: id (also the topic id), ISO code and the name as printed. */
export const STATES = JSON.parse(readFileSync("data/states.json", "utf8"));

/** Number of general tasks. */
export const GENERAL_COUNT = 300;

/** Number of tasks per federal state. */
export const PER_STATE = 10;

/** Number of all questions in the bank. */
export const TOTAL_COUNT = GENERAL_COUNT + STATES.length * PER_STATE;

/**
 * Number of a state task in the bank.
 * @param {string} stateId State id, for example "berlin".
 * @param {number} task Task number within the state, 1 to 10.
 * @returns {number} Question number.
 */
export function stateNumber(stateId, task)
{
    const index = STATES.findIndex((state) => state.id === stateId);
    if (index < 0)
    {
        throw new Error(`Unknown state: ${stateId}`);
    }
    return GENERAL_COUNT + index * PER_STATE + task;
}

/**
 * The state a question number belongs to.
 * @param {number} number Question number.
 * @returns {{ id: string, code: string, name: string } | undefined} The state, or undefined for a general question.
 */
export function stateOf(number)
{
    return number > GENERAL_COUNT ? STATES[Math.floor((number - GENERAL_COUNT - 1) / PER_STATE)] : undefined;
}

/**
 * The task number printed in the catalogue for a question number.
 * @param {number} number Question number.
 * @returns {number} Task number: 1 to 300 for general questions, 1 to 10 for state questions.
 */
export function taskOf(number)
{
    return number > GENERAL_COUNT ? ((number - GENERAL_COUNT - 1) % PER_STATE) + 1 : number;
}
