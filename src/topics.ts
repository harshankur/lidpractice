import { msg, type MessageKey } from "./i18n";

/** A heading under which related topics are listed in the topic panel. */
export interface TopicGroup
{
    /** Stable id, used for element ids. */
    id: string;
    /** Message key of the group name. */
    title: MessageKey;
    /** Category ids in the group, in the order they are listed. */
    topics: string[];
}

/** The subjects of the general questions, grouped so that 13 checkboxes can be scanned. The grouping is ours, it is not part of the official catalogue. */
export const TOPIC_GROUPS: TopicGroup[] = [
    {
        id: "state",
        title: msg("group.state"),
        topics: [
            "grundrechte", "demokratie-und-rechtsstaat", "bund-laender-gemeinden", "staatsorgane", "parteien-und-wahlen", "staatssymbole",
        ],
    },
    {
        id: "history",
        title: msg("group.history"),
        topics: ["nationalsozialismus", "nachkriegszeit-ddr-einheit", "europa"],
    },
    {
        id: "society",
        title: msg("group.society"),
        topics: [
            "recht-und-justiz", "arbeit-und-soziales", "familie-bildung-alltag", "religion-vielfalt-migration",
        ],
    },
];

/** Every topic id, in the order of the groups. */
export const ALL_TOPICS: string[] = TOPIC_GROUPS.flatMap((group) => group.topics);

/**
 * Whether two lists hold the same topics, whatever their order.
 * @param first A list of topic ids.
 * @param second Another list.
 * @returns True when they hold the same ids.
 */
export function sameTopics(first: readonly string[], second: readonly string[]): boolean
{
    // As sets: a subject named twice is one subject.
    const one = new Set(first);
    const other = new Set(second);
    return one.size === other.size && [...one].every((topic) => other.has(topic));
}

/** What a choice of subjects amounts to, for the one line summary. */
export type SubjectsKind = "all" | "none" | "group" | "list";

/** A choice of subjects described for display. */
export interface SubjectsDescription
{
    kind: SubjectsKind;
    /** The group, when the choice is exactly one group. */
    group?: TopicGroup;
}

/**
 * Describes a choice of subjects: all of them, none, exactly one group, or a list.
 * @param topics Ticked subject ids.
 * @returns The description.
 */
export function describeSubjects(topics: readonly string[]): SubjectsDescription
{
    if (sameTopics(topics, ALL_TOPICS))
    {
        return { kind: "all" };
    }
    if (topics.length === 0)
    {
        return { kind: "none" };
    }
    const group = TOPIC_GROUPS.find((candidate) => candidate.topics.length > 1 && sameTopics(topics, candidate.topics));
    return group ? { kind: "group", group } : { kind: "list" };
}
