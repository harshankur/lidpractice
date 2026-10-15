// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Listbox, type ListboxItem } from "../../src/listbox";

/** The entries of the list under test. */
const ITEMS: ListboxItem[] = [
    { value: "all", label: "All questions" },
    { value: "general", label: "General" },
    { value: "berlin", label: "Berlin only" },
    { value: "familie-bildung-alltag", label: "Bildung" },
    { value: "kommune", label: "Kommune" },
];

describe("Listbox", () =>
{
    let listbox: Listbox;
    let changes: string[];

    /** The button that opens the list. */
    const button = (): HTMLButtonElement => document.getElementById("test-button") as HTMLButtonElement;
    /** The list. */
    const list = (): HTMLElement => document.getElementById("test-list") as HTMLElement;
    /** The options. */
    const options = (): HTMLElement[] => Array.from(list().querySelectorAll<HTMLElement>("[role=option]"));
    /** Sends a key to the list, or to the button when the list is closed. */
    const press = (key: string, init: KeyboardEventInit = {}, target: HTMLElement = list()): KeyboardEvent =>
    {
        const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
        target.dispatchEvent(event);
        return event;
    };
    /** Index of the active option. */
    const activeIndex = (): number => options().findIndex((option) => option.classList.contains("is-active"));

    beforeEach(() =>
    {
        document.body.innerHTML = "<span id=\"test-label\">Draw from</span><button id=\"outside\">outside</button>";
        changes = [];
        listbox = new Listbox({ id: "test", labelId: "test-label", items: ITEMS, value: "general", onChange: (value) => changes.push(value) });
        document.body.append(listbox.element);
    });

    afterEach(() =>
    {
        listbox.close(false);
        vi.useRealTimers();
        document.body.innerHTML = "";
    });

    describe("markup", () =>
    {
        it("is a button that opens a listbox, named by the visible label and its own value", () =>
        {
            expect(button().getAttribute("aria-haspopup")).toBe("listbox");
            expect(button().getAttribute("aria-expanded")).toBe("false");
            expect(button().getAttribute("aria-controls")).toBe("test-list");
            expect(button().getAttribute("aria-labelledby")).toBe("test-label test-button");
            expect(button().textContent).toContain("General");
            expect(list().getAttribute("role")).toBe("listbox");
            expect(list().getAttribute("aria-labelledby")).toBe("test-label");
        });

        it("has one option per item, with the chosen one selected", () =>
        {
            expect(options().map((option) => option.textContent)).toEqual(ITEMS.map((item) => item.label));
            expect(options().map((option) => option.getAttribute("aria-selected"))).toEqual(["false", "true", "false", "false", "false"]);
            expect(options().map((option) => option.getAttribute("data-value"))).toEqual(ITEMS.map((item) => item.value));
            expect(new Set(options().map((option) => option.id)).size).toBe(ITEMS.length);
        });

        it("is closed to begin with", () =>
        {
            expect(listbox.isOpen).toBe(false);
            expect(list().hidden).toBe(true);
        });

        it("shows the first item when the value is unknown", () =>
        {
            const other = new Listbox({ id: "other", labelId: "test-label", items: ITEMS, value: "missing", onChange: () => undefined });
            expect(other.element.querySelector("button")?.textContent).toContain("All questions");
        });

        it("copes with an empty list", () =>
        {
            const empty = new Listbox({ id: "empty", labelId: "test-label", items: [], value: "", onChange: () => undefined });
            expect(empty.element.querySelector("button")?.textContent).toBe("");
        });
    });

    describe("a list that is off", () =>
    {
        it("shows the choice on a disabled button", () =>
        {
            document.body.innerHTML = "";
            const off = new Listbox({ id: "off", label: "State", items: ITEMS, value: "berlin", onChange: (value) => changes.push(value), disabled: true });
            document.body.append(off.element);
            const offButton = document.getElementById("off-button") as HTMLButtonElement;
            expect(offButton.disabled).toBe(true);
            expect(offButton.textContent).toContain("Berlin only");
            offButton.click();
            expect(off.isOpen).toBe(false);
            expect(changes).toEqual([]);
        });

        it("is on unless it is switched off", () =>
        {
            expect(button().disabled).toBe(false);
        });
    });

    describe("opening", () =>
    {
        it("opens with a click, with the chosen item active and the focus in the list", () =>
        {
            button().click();
            expect(listbox.isOpen).toBe(true);
            expect(list().hidden).toBe(false);
            expect(button().getAttribute("aria-expanded")).toBe("true");
            expect(activeIndex()).toBe(1);
            expect(list().getAttribute("aria-activedescendant")).toBe("test-option-1");
            expect(document.activeElement).toBe(list());
        });

        it("closes again with a second click on the button", () =>
        {
            button().click();
            button().click();
            expect(listbox.isOpen).toBe(false);
            expect(document.activeElement).toBe(button());
        });

        it("opens with the arrow keys on the button", () =>
        {
            const down = press("ArrowDown", {}, button());
            expect(listbox.isOpen).toBe(true);
            expect(down.defaultPrevented).toBe(true);
            listbox.close(false);
            press("ArrowUp", {}, button());
            expect(listbox.isOpen).toBe(true);
        });

        it("ignores other keys on the button", () =>
        {
            const event = press("a", {}, button());
            expect(listbox.isOpen).toBe(false);
            expect(event.defaultPrevented).toBe(false);
        });

        it("does nothing when opened twice", () =>
        {
            listbox.open();
            listbox.open();
            expect(listbox.isOpen).toBe(true);
        });
    });

    describe("moving", () =>
    {
        beforeEach(() =>
        {
            button().click();
        });

        it("moves with ArrowDown and ArrowUp and stops at the ends", () =>
        {
            press("ArrowDown");
            expect(activeIndex()).toBe(2);
            press("ArrowDown");
            press("ArrowDown");
            press("ArrowDown");
            expect(activeIndex()).toBe(4);
            press("ArrowUp");
            expect(activeIndex()).toBe(3);
            for (let step = 0; step < 10; step++)
            {
                press("ArrowUp");
            }
            expect(activeIndex()).toBe(0);
        });

        it("jumps with Home, End, PageDown and PageUp", () =>
        {
            press("End");
            expect(activeIndex()).toBe(4);
            press("Home");
            expect(activeIndex()).toBe(0);
            press("PageDown");
            expect(activeIndex()).toBe(4);
            press("PageUp");
            expect(activeIndex()).toBe(0);
        });

        it("announces the active item through aria-activedescendant", () =>
        {
            press("ArrowDown");
            expect(list().getAttribute("aria-activedescendant")).toBe("test-option-2");
        });

        it("follows the mouse", () =>
        {
            options()[3].dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
            expect(activeIndex()).toBe(3);
        });

        it("keeps the keys it handles from scrolling the page", () =>
        {
            expect(press("ArrowDown").defaultPrevented).toBe(true);
            expect(press("Home").defaultPrevented).toBe(true);
        });

        it("jumps to the item whose label starts with the letters typed", () =>
        {
            press("b");
            expect(activeIndex()).toBe(2);
            press("i");
            expect(activeIndex()).toBe(3);
        });

        it("starts a new word after a pause, and cycles through items with the same first letter", () =>
        {
            vi.useFakeTimers();
            press("k");
            expect(activeIndex()).toBe(4);
            vi.advanceTimersByTime(700);
            press("a");
            expect(activeIndex()).toBe(0);
            vi.advanceTimersByTime(700);
            press("g");
            expect(activeIndex()).toBe(1);
        });

        it("ignores letters that match nothing, and shortcut combinations", () =>
        {
            press("z");
            expect(activeIndex()).toBe(1);
            const combo = press("b", { ctrlKey: true });
            expect(activeIndex()).toBe(1);
            expect(combo.defaultPrevented).toBe(false);
        });

        it("ignores keys that are not letters", () =>
        {
            const event = press("F5");
            expect(event.defaultPrevented).toBe(false);
            expect(activeIndex()).toBe(1);
        });
    });

    describe("choosing", () =>
    {
        beforeEach(() =>
        {
            button().click();
        });

        it("chooses with Enter, closes and gives focus back to the button", () =>
        {
            press("ArrowDown");
            press("Enter");
            expect(changes).toEqual(["berlin"]);
            expect(listbox.isOpen).toBe(false);
            expect(document.activeElement).toBe(button());
        });

        it("chooses with Space", () =>
        {
            press("End");
            press(" ");
            expect(changes).toEqual(["kommune"]);
        });

        it("chooses with a click on an item", () =>
        {
            options()[3].click();
            expect(changes).toEqual(["familie-bildung-alltag"]);
            expect(listbox.isOpen).toBe(false);
        });

        it("does not report a change when the chosen item is chosen again", () =>
        {
            press("Enter");
            expect(changes).toEqual([]);
            expect(listbox.isOpen).toBe(false);
        });
    });

    describe("closing", () =>
    {
        beforeEach(() =>
        {
            button().click();
        });

        it("closes with Escape, gives focus back and does not let the key reach anything else", () =>
        {
            let reached = false;
            document.addEventListener("keydown", () =>
            {
                reached = true;
            });
            const event = press("Escape");
            expect(listbox.isOpen).toBe(false);
            expect(document.activeElement).toBe(button());
            expect(event.defaultPrevented).toBe(true);
            expect(reached).toBe(false);
            expect(changes).toEqual([]);
        });

        it("closes with Tab, without choosing, and leaves the focus on the button so Tab moves on from there", () =>
        {
            press("ArrowDown");
            const event = press("Tab");
            expect(listbox.isOpen).toBe(false);
            expect(changes).toEqual([]);
            expect(document.activeElement).toBe(button());
            expect(event.defaultPrevented).toBe(false);
        });

        it("closes with a press outside, but not inside", () =>
        {
            options()[0].dispatchEvent(new Event("pointerdown", { bubbles: true }));
            expect(listbox.isOpen).toBe(true);
            document.getElementById("outside")?.dispatchEvent(new Event("pointerdown", { bubbles: true }));
            expect(listbox.isOpen).toBe(false);
        });

        it("stops listening outside once closed", () =>
        {
            listbox.close(false);
            document.getElementById("outside")?.dispatchEvent(new Event("pointerdown", { bubbles: true }));
            expect(listbox.isOpen).toBe(false);
        });

        it("can close without taking the focus", () =>
        {
            document.getElementById("outside")?.focus();
            listbox.close(false);
            expect(document.activeElement).toBe(document.getElementById("outside"));
        });

        it("is safe to close when it is already closed", () =>
        {
            listbox.close(false);
            listbox.close(true);
            expect(listbox.isOpen).toBe(false);
        });

        it("starts again with the chosen item active when opened the next time", () =>
        {
            press("End");
            listbox.close(false);
            button().click();
            expect(activeIndex()).toBe(1);
        });
    });
});
