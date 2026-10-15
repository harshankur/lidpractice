// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { el } from "../../src/dom";
import { i18n } from "../../src/i18n";
import { Modal } from "../../src/modal";

/**
 * Builds simple dialog content with two buttons.
 * @returns Body element.
 */
function content(): HTMLElement
{
    return el("div", {}, el("button", { id: "first" }, "First"), el("a", { href: "#x", id: "link" }, "Link"), el("button", { id: "last" }, "Last"));
}

/**
 * Presses a key on the document, where the dialog listens.
 * @param key Key value.
 * @param init Extra event fields.
 * @returns The event, so tests can look at `defaultPrevented`.
 */
function press(key: string, init: KeyboardEventInit = {}): KeyboardEvent
{
    const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
    document.dispatchEvent(event);
    return event;
}

describe("Modal", () =>
{
    let root: HTMLElement;
    let modal: Modal;
    let opener: HTMLButtonElement;

    beforeEach(() =>
    {
        i18n.setLocale("en");
        document.body.innerHTML = "<button id=\"opener\">Open</button><div id=\"app\"><h1 data-focus tabindex=\"-1\">App</h1></div><div id=\"root\"></div>";
        root = document.getElementById("root") as HTMLElement;
        opener = document.getElementById("opener") as HTMLButtonElement;
        modal = new Modal(root, [document.getElementById("app") as HTMLElement]);
        opener.focus();
    });

    afterEach(() =>
    {
        modal.close();
        document.body.innerHTML = "";
    });

    describe("opening", () =>
    {
        it("is closed to begin with", () =>
        {
            expect(modal.isOpen).toBe(false);
            expect(root.children).toHaveLength(0);
        });

        it("renders a labelled modal dialog with the given title and content", () =>
        {
            modal.show({ title: "Hello", content: content() });
            const dialog = root.querySelector("[role=dialog]") as HTMLElement;
            expect(modal.isOpen).toBe(true);
            expect(dialog.getAttribute("aria-modal")).toBe("true");
            expect(dialog.getAttribute("aria-labelledby")).toBe("modal-title");
            expect(document.getElementById("modal-title")?.textContent).toBe("Hello");
            expect(dialog.querySelector("#first")).not.toBeNull();
        });

        it("moves focus to the title, so screen readers announce the dialog", () =>
        {
            modal.show({ title: "Hello", content: content() });
            expect(document.activeElement?.id).toBe("modal-title");
        });

        it("stops the page behind from scrolling", () =>
        {
            modal.show({ title: "Hello", content: content() });
            expect(document.body.classList.contains("modal-open")).toBe(true);
            modal.close();
            expect(document.body.classList.contains("modal-open")).toBe(false);
        });

        it("blocks the page behind and hides it from assistive technology, and restores it on close", () =>
        {
            const app = document.getElementById("app") as HTMLElement;
            modal.show({ title: "Hello", content: content() });
            expect(app.hasAttribute("inert")).toBe(true);
            expect(app.getAttribute("aria-hidden")).toBe("true");
            expect(root.hasAttribute("inert")).toBe(false);
            modal.close();
            expect(app.hasAttribute("inert")).toBe(false);
            expect(app.hasAttribute("aria-hidden")).toBe(false);
        });

        it("works without a background list", () =>
        {
            const plain = new Modal(root);
            plain.show({ title: "Hello", content: content() });
            expect(plain.isOpen).toBe(true);
            plain.close();
        });

        it("shows the title as text, never as markup", () =>
        {
            modal.show({ title: "<img src=x onerror=alert(1)>", content: content() });
            expect(root.querySelector("img")).toBeNull();
            expect(document.getElementById("modal-title")?.textContent).toBe("<img src=x onerror=alert(1)>");
        });
    });

    describe("changing the view while open", () =>
    {
        it("replaces title and content in the same dialog", () =>
        {
            modal.show({ title: "One", content: el("p", { id: "one" }, "1") });
            modal.show({ title: "Two", content: el("p", { id: "two" }, "2") });
            expect(root.querySelectorAll("[role=dialog]")).toHaveLength(1);
            expect(document.getElementById("modal-title")?.textContent).toBe("Two");
            expect(document.getElementById("one")).toBeNull();
            expect(document.getElementById("two")).not.toBeNull();
        });

        it("scrolls to the top and puts focus on the new title", () =>
        {
            modal.show({ title: "One", content: content() });
            (root.querySelector(".modal-body") as HTMLElement).scrollTop = 200;
            (document.getElementById("last") as HTMLElement).focus();
            modal.show({ title: "Two", content: content() });
            expect((root.querySelector(".modal-body") as HTMLElement).scrollTop).toBe(0);
            expect(document.activeElement?.id).toBe("modal-title");
        });

        it("gives focus back to the control that opened it when the page was drawn anew under the dialog, by its id", () =>
        {
            modal.show({ title: "One", content: content() });
            const fresh = el("button", { id: "opener" }, "Open");
            opener.replaceWith(fresh);
            modal.close();
            expect(document.activeElement).toBe(fresh);
        });

        it("falls back to the heading of the page when the control that opened it is gone and had no id", () =>
        {
            const nameless = el("button", {}, "Open");
            document.body.append(nameless);
            nameless.focus();
            modal.show({ title: "One", content: content() });
            nameless.remove();
            modal.close();
            expect(document.activeElement).toBe(document.querySelector("[data-focus]"));
        });

        it("still gives focus back to the first opener after several views", () =>
        {
            modal.show({ title: "One", content: content() });
            modal.show({ title: "Two", content: content() });
            modal.close();
            expect(document.activeElement).toBe(opener);
        });
    });

    describe("updating what an open dialog shows, while the user works in it", () =>
    {
        it("replaces the title, the content and the class, in the same dialog", () =>
        {
            modal.show({ title: "Card 1", content: el("p", { id: "one" }, "1"), className: "modal-fixed" });
            modal.update({ title: "Card 2", content: el("p", { id: "two" }, "2"), className: "modal-fixed modal-cards" });
            expect(root.querySelectorAll("[role=dialog]")).toHaveLength(1);
            expect(document.getElementById("modal-title")?.textContent).toBe("Card 2");
            expect(document.getElementById("one")).toBeNull();
            expect(document.getElementById("two")).not.toBeNull();
            expect(root.querySelector("[role=dialog]")?.className).toBe("modal modal-fixed modal-cards");
            modal.update({ title: "Card 3", content: el("p", {}, "3") });
            expect(root.querySelector("[role=dialog]")?.className).toBe("modal");
        });

        it("leaves the scroll position alone", () =>
        {
            modal.show({ title: "One", content: content() });
            (root.querySelector(".modal-body") as HTMLElement).scrollTop = 200;
            modal.update({ title: "One", content: content() });
            expect((root.querySelector(".modal-body") as HTMLElement).scrollTop).toBe(200);
        });

        it("leaves the focus to the caller, who knows where the user was", () =>
        {
            modal.show({ title: "One", content: content() });
            modal.update({ title: "One", content: content() });
            (document.getElementById("last") as HTMLElement).focus();
            expect(document.activeElement?.id).toBe("last");
        });

        it("rests the focus on the heading when the control that had it is gone, never outside the dialog", () =>
        {
            modal.show({ title: "One", content: content() });
            (document.getElementById("last") as HTMLElement).focus();
            modal.update({ title: "Two", content: el("p", {}, "nothing to press") });
            expect(document.activeElement?.id).toBe("modal-title");
            // A focus that is still inside, on the heading or the close button, is not touched.
            (root.querySelector(".modal-close") as HTMLElement).focus();
            modal.update({ title: "Three", content: el("p", {}, "still nothing") });
            expect(document.activeElement).toBe(root.querySelector(".modal-close"));
        });

        it("takes the new handler for closing, and still gives focus back to the opener", () =>
        {
            const closed: string[] = [];
            modal.show({ title: "One", content: content(), onClose: () => closed.push("first") });
            modal.update({ title: "Two", content: content(), onClose: () => closed.push("second") });
            modal.close();
            expect(closed).toEqual(["second"]);
            expect(document.activeElement).toBe(opener);
        });

        it("does nothing while the dialog is closed", () =>
        {
            modal.update({ title: "One", content: content() });
            expect(modal.isOpen).toBe(false);
            expect(root.children).toHaveLength(0);
        });
    });

    describe("closing", () =>
    {
        it("closes with Escape and gives focus back", () =>
        {
            modal.show({ title: "Hello", content: content() });
            const event = press("Escape");
            expect(modal.isOpen).toBe(false);
            expect(root.children).toHaveLength(0);
            expect(document.activeElement).toBe(opener);
            expect(event.defaultPrevented).toBe(true);
        });

        it("swallows Escape so nothing else reacts to it", () =>
        {
            let reached = false;
            document.addEventListener("keydown", () =>
            {
                reached = true;
            });
            modal.show({ title: "Hello", content: content() });
            press("Escape");
            expect(reached).toBe(false);
        });

        it("closes with the close button", () =>
        {
            modal.show({ title: "Hello", content: content() });
            (root.querySelector(".modal-close") as HTMLButtonElement).click();
            expect(modal.isOpen).toBe(false);
            expect(root.querySelector(".modal-close")).toBeNull();
        });

        it("labels the close button for assistive technology, in the language of the interface", () =>
        {
            modal.show({ title: "Hello", content: content() });
            expect(root.querySelector(".modal-close")?.getAttribute("aria-label")).toBe("Close");
            modal.close();
            i18n.setLocale("de");
            modal.show({ title: "Hallo", content: content() });
            expect(root.querySelector(".modal-close")?.getAttribute("aria-label")).toBe("Schließen");
        });

        it("closes when the backdrop is clicked, exactly like Escape", () =>
        {
            modal.show({ title: "Hello", content: content() });
            (root.querySelector(".modal-backdrop") as HTMLElement).click();
            expect(modal.isOpen).toBe(false);
            expect(document.activeElement).toBe(opener);
        });

        it("stays open when something inside the dialog is clicked", () =>
        {
            modal.show({ title: "Hello", content: content() });
            (root.querySelector(".modal") as HTMLElement).click();
            (document.getElementById("first") as HTMLElement).click();
            expect(modal.isOpen).toBe(true);
        });

        it("is safe to close twice or when it was never opened", () =>
        {
            modal.close();
            modal.show({ title: "Hello", content: content() });
            modal.close();
            modal.close();
            expect(modal.isOpen).toBe(false);
        });

        it("stops listening to the keyboard once closed", () =>
        {
            modal.show({ title: "Hello", content: content() });
            modal.close();
            opener.focus();
            const event = press("Escape");
            expect(event.defaultPrevented).toBe(false);
            const tab = press("Tab");
            expect(tab.defaultPrevented).toBe(false);
        });

        it("focuses the page heading when the opener is gone", () =>
        {
            modal.show({ title: "Hello", content: content() });
            opener.remove();
            modal.close();
            expect(document.activeElement?.tagName).toBe("H1");
        });

        it("works when nothing had focus before", () =>
        {
            (document.activeElement as HTMLElement).blur();
            modal.show({ title: "Hello", content: content() });
            modal.close();
            expect(modal.isOpen).toBe(false);
        });

        it("can be reopened after closing", () =>
        {
            modal.show({ title: "One", content: content() });
            modal.close();
            modal.show({ title: "Two", content: content() });
            expect(modal.isOpen).toBe(true);
            expect(root.querySelectorAll("[role=dialog]")).toHaveLength(1);
            press("Escape");
            expect(modal.isOpen).toBe(false);
        });
    });

    describe("keeping focus inside", () =>
    {
        beforeEach(() =>
        {
            modal.show({ title: "Hello", content: content() });
        });

        it("wraps from the last control to the first with Tab", () =>
        {
            (document.getElementById("last") as HTMLElement).focus();
            const event = press("Tab");
            expect(event.defaultPrevented).toBe(true);
            expect(document.activeElement).toBe(root.querySelector(".modal-close"));
        });

        it("wraps from the first control to the last with Shift+Tab", () =>
        {
            (root.querySelector(".modal-close") as HTMLElement).focus();
            const event = press("Tab", { shiftKey: true });
            expect(event.defaultPrevented).toBe(true);
            expect(document.activeElement?.id).toBe("last");
        });

        it("sends Shift+Tab from the title to the last control", () =>
        {
            expect(document.activeElement?.id).toBe("modal-title");
            press("Tab", { shiftKey: true });
            expect(document.activeElement?.id).toBe("last");
        });

        it("pulls focus back in when it has escaped the dialog", () =>
        {
            opener.focus();
            press("Tab");
            expect(root.contains(document.activeElement)).toBe(true);
            opener.focus();
            press("Tab", { shiftKey: true });
            expect(root.contains(document.activeElement)).toBe(true);
        });

        it("leaves Tab alone while focus is in the middle", () =>
        {
            (document.getElementById("link") as HTMLElement).focus();
            const event = press("Tab");
            expect(event.defaultPrevented).toBe(false);
        });

        it("ignores other keys", () =>
        {
            const event = press("a");
            expect(event.defaultPrevented).toBe(false);
            expect(modal.isOpen).toBe(true);
        });

        it("keeps Tab inside even when the content has nothing to focus", () =>
        {
            modal.show({ title: "Empty", content: el("p", {}, "text") });
            root.querySelector(".modal-close")?.remove();
            const event = press("Tab");
            expect(event.defaultPrevented).toBe(true);
        });
    });
});
