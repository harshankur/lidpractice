import { clampedText, el, icon, type Child } from "./dom";
import { i18n } from "./i18n";

/**
 * A label with the language and direction of its own text.
 * @param item The item.
 * @param text The text to show.
 * @param lines How many lines at most.
 * @returns The element.
 */
function labelOf(item: ListboxItem | undefined, text: string, lines?: number): HTMLElement
{
    const element = lines === undefined ? clampedText(text) : clampedText(text, lines);
    if (item?.lang)
    {
        element.setAttribute("lang", item.lang);
    }
    if (item?.dir)
    {
        element.setAttribute("dir", item.dir);
    }
    return element;
}

/** One choice of a listbox. */
export interface ListboxItem
{
    value: string;
    label: string;
    /** A smaller line under the label, for example what the choice means. */
    description?: string;
    /** A shorter text for the button, when the label is long. */
    short?: string;
    /** The language of the label, when it differs from the page, for example the name of a language in its own script. */
    lang?: string;
    /** The direction the label is written in, when it differs from the page. */
    dir?: "ltr" | "rtl";
}

/** What a listbox needs to be built. */
export interface ListboxConfig
{
    /** Unique id, used to name the parts. */
    id: string;
    /** Id of a visible label element that names the control. Give this or `label`. */
    labelId?: string;
    /** Name of the control when there is no visible label. Give this or `labelId`. */
    label?: string;
    items: ListboxItem[];
    /** Value of the chosen item. */
    value: string;
    /** Called when the user chooses a different item. */
    onChange: (value: string) => void;
    /** An icon in front of the button text. */
    icon?: () => Node;
    /** Text in front of the chosen value on the button, for example "Translation:". */
    prefix?: string;
    /** Show only the icon on the button. The accessible name still says what is chosen. */
    iconOnly?: boolean;
    /** The accessible name of the button, built from the chosen item. */
    buttonName?: (item: ListboxItem) => string;
    /** Extra class for the wrapper. */
    className?: string;
    /** The list opens towards the right (default) or the left edge of the button. */
    align?: "start" | "end";
    /** A short hint at the bottom of the open list. */
    note?: string;
    /** The list opens below the button (default) or above it, for a list near the bottom of the page. */
    placement?: "down" | "up";
    /** The choice cannot be changed right now: the button shows it and does not open. */
    disabled?: boolean;
}

/** The space an open list keeps to the edge of the window, in pixels. */
const WINDOW_MARGIN = 8;

/** Lines that Page Up and Page Down jump over. */
const PAGE_STEP = 8;

/** How long typed letters are collected for jumping to an item, in milliseconds. */
const TYPE_AHEAD_MS = 600;

/** Arrow shown on the button. */
const CHEVRON_ICON = "chevronDown";

/** The space between two words of the text of a button. */
const WORD_SPACE = " ";

/**
 * A choice list that replaces the browser's own select: a button that opens a
 * list drawn by the page, following the ARIA listbox pattern. Arrow keys, Home, End and Page keys move,
 * letters jump to an item, Enter and Space choose, Escape closes, a click outside closes.
 */
export class Listbox
{
    /** The element to put in the page: the button and its list. */
    public readonly element: HTMLElement;

    private readonly config: ListboxConfig;
    private readonly button: HTMLButtonElement;
    private readonly list: HTMLElement;
    private readonly optionElements: HTMLElement[];
    private active = 0;
    private expanded = false;
    private typed = "";
    private typedTimer = 0;
    private readonly onOutside = (event: Event): void =>
    {
        if (!this.element.contains(event.target as Node))
        {
            this.close(false);
        }
    };

    /**
     * @param config Items, the chosen value and the change callback.
     */
    public constructor(config: ListboxConfig)
    {
        this.config = config;
        const buttonId = `${config.id}-button`;
        const listId = `${config.id}-list`;
        const chosen = config.items.find((item) => item.value === config.value) ?? config.items[0];
        const buttonContent: Child[] = [
            config.icon ? config.icon() : null,
            config.iconOnly ? null : (config.prefix ? el("span", { class: "listbox-prefix" }, config.prefix) : null),
            // A space between what the list is for and what is chosen: the button lays them out apart anyway, but its text
            // must read as words, so that it is part of the name and a user of voice control can say what it shows.
            config.iconOnly || !config.prefix ? null : document.createTextNode(WORD_SPACE),
            config.iconOnly ? null : labelOf(chosen, chosen?.short ?? chosen?.label ?? "", 1),
            config.iconOnly ? null : el("span", { class: "listbox-chevron", "aria-hidden": "true" }, icon(CHEVRON_ICON)),
        ];
        const nameAttributes: Record<string, string> = config.buttonName && chosen
            ? { "aria-label": config.buttonName(chosen) }
            : { "aria-labelledby": `${config.labelId ?? ""} ${buttonId}`.trim() };
        this.button = el("button", {
            id: buttonId,
            class: config.iconOnly ? "listbox-button is-icon-only" : "listbox-button",
            type: "button",
            "aria-haspopup": "listbox",
            "aria-expanded": "false",
            "aria-controls": listId,
            disabled: config.disabled === true,
            ...nameAttributes,
            onclick: () => (this.expanded ? this.close(true) : this.open()),
            onkeydown: (event: Event) => this.onButtonKey(event as KeyboardEvent),
        }, ...buttonContent) as HTMLButtonElement;
        this.optionElements = config.items.map((item, index) => el("div", {
            id: `${config.id}-option-${index}`,
            class: "listbox-option",
            role: "option",
            "data-value": item.value,
            "aria-selected": String(item.value === config.value),
            onclick: () => this.choose(index),
            onmousemove: () => this.setActive(index),
        }, labelOf(item, item.label), item.description ? el("span", { class: "listbox-description" }, item.description) : null));
        const labelAttributes: Record<string, string> = config.labelId
            ? { "aria-labelledby": config.labelId }
            : { "aria-label": config.label ?? "" };
        this.list = el("div", {
            id: listId,
            class: "listbox-list",
            role: "listbox",
            tabindex: "-1",
            ...labelAttributes,
            hidden: true,
            onkeydown: (event: Event) => this.onListKey(event as KeyboardEvent),
        }, ...this.optionElements, config.note ? el("div", { class: "listbox-note", role: "presentation", "aria-hidden": "true" }, config.note) : null);
        const classes = ["listbox", config.align === "end" ? "listbox-end" : "", config.placement === "up" ? "listbox-up" : "", config.className ?? ""].filter(Boolean).join(" ");
        this.element = el("div", { class: classes }, this.button, this.list);
    }

    /** Whether the list is showing. */
    public get isOpen(): boolean
    {
        return this.expanded;
    }

    /** Opens the list with the chosen item active and moves focus into it. */
    public open(): void
    {
        if (this.expanded)
        {
            return;
        }
        this.expanded = true;
        this.list.hidden = false;
        this.button.setAttribute("aria-expanded", "true");
        this.keepInWindow();
        this.setActive(Math.max(0, this.config.items.findIndex((item) => item.value === this.config.value)));
        this.list.focus();
        document.addEventListener("pointerdown", this.onOutside, true);
    }

    /** Moves the open list sideways when it would reach out of the window, which happens near an edge on a small phone. */
    private keepInWindow(): void
    {
        this.list.style.removeProperty("translate");
        const box = this.list.getBoundingClientRect();
        const width = document.documentElement.clientWidth;
        if (box.width === 0 || width === 0)
        {
            return;
        }
        let shift = 0;
        if (box.left < WINDOW_MARGIN)
        {
            shift = WINDOW_MARGIN - box.left;
        }
        else if (box.right > width - WINDOW_MARGIN)
        {
            shift = width - WINDOW_MARGIN - box.right;
        }
        if (shift !== 0)
        {
            this.list.style.setProperty("translate", `${Math.round(shift)}px 0`);
        }
    }

    /**
     * Closes the list.
     * @param returnFocus Whether focus goes back to the button.
     */
    public close(returnFocus: boolean): void
    {
        if (!this.expanded)
        {
            return;
        }
        this.expanded = false;
        this.list.hidden = true;
        this.button.setAttribute("aria-expanded", "false");
        this.list.removeAttribute("aria-activedescendant");
        document.removeEventListener("pointerdown", this.onOutside, true);
        window.clearTimeout(this.typedTimer);
        this.typed = "";
        if (returnFocus)
        {
            this.button.focus();
        }
    }

    /**
     * Makes one item the active one, which is the one that Enter would choose.
     * @param index Position in the list.
     */
    private setActive(index: number): void
    {
        this.active = Math.min(this.optionElements.length - 1, Math.max(0, index));
        this.optionElements.forEach((option, position) => option.classList.toggle("is-active", position === this.active));
        this.list.setAttribute("aria-activedescendant", this.optionElements[this.active].id);
        this.optionElements[this.active].scrollIntoView?.({ block: "nearest" });
    }

    /**
     * Chooses an item and closes the list.
     * @param index Position in the list.
     */
    private choose(index: number): void
    {
        const item = this.config.items[index];
        this.close(true);
        if (item && item.value !== this.config.value)
        {
            this.config.onChange(item.value);
        }
    }

    /**
     * Keys on the closed button: arrows open the list, Enter and Space open it through the click.
     * @param event Keyboard event.
     */
    private onButtonKey(event: KeyboardEvent): void
    {
        if (event.key === "ArrowDown" || event.key === "ArrowUp")
        {
            event.preventDefault();
            this.open();
        }
    }

    /**
     * Keys inside the open list.
     * @param event Keyboard event.
     */
    private onListKey(event: KeyboardEvent): void
    {
        const last = this.optionElements.length - 1;
        switch (event.key)
        {
            case "ArrowDown":
                this.setActive(this.active + 1);
                break;
            case "ArrowUp":
                this.setActive(this.active - 1);
                break;
            case "Home":
                this.setActive(0);
                break;
            case "End":
                this.setActive(last);
                break;
            case "PageDown":
                this.setActive(this.active + PAGE_STEP);
                break;
            case "PageUp":
                this.setActive(this.active - PAGE_STEP);
                break;
            case "Enter":
            case " ":
                this.choose(this.active);
                break;
            case "Escape":
                event.stopPropagation();
                this.close(true);
                break;
            case "Tab":
                // Focus moves on from the button, the list just closes.
                this.close(true);
                return;
            default:
                if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey)
                {
                    this.typeAhead(event.key);
                    break;
                }
                return;
        }
        event.preventDefault();
    }

    /**
     * Jumps to the next item that starts with the letters typed so far.
     * @param character The typed character.
     */
    private typeAhead(character: string): void
    {
        window.clearTimeout(this.typedTimer);
        this.typed += character.toLocaleLowerCase(i18n.locale);
        this.typedTimer = window.setTimeout(() =>
        {
            this.typed = "";
        }, TYPE_AHEAD_MS);
        const labels = this.config.items.map((item) => item.label.toLocaleLowerCase(i18n.locale));
        const from = this.typed.length === 1 ? this.active + 1 : this.active;
        const order = [...labels.keys()].map((offset) => (from + offset) % labels.length);
        const match = order.find((index) => labels[index].startsWith(this.typed));
        if (match !== undefined)
        {
            this.setActive(match);
        }
    }
}
