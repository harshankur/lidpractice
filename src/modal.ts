import { el } from "./dom";
import { t } from "./i18n";

/** What the dialog shows. */
export interface ModalView
{
    /** Heading, also the accessible name of the dialog. */
    title: string;
    /** Body content. */
    content: HTMLElement;
    /** Extra class for the dialog, for example a wider or taller variant. */
    className?: string;
    /** Called when the dialog closes, however it was closed. */
    onClose?: () => void;
}

/** Elements that can take keyboard focus inside the dialog. */
const FOCUSABLE = "a[href], button:not([disabled]), summary, input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex=\"-1\"])";

/** The multiplication sign shown on the close button. */
const CLOSE_GLYPH = "\u00d7";

/** Class on the body while a dialog is open, so the page behind does not scroll. */
const BODY_OPEN_CLASS = "modal-open";

/**
 * One blocking dialog for the whole page: the page behind is blocked, keyboard focus
 * stays inside, and Escape and a click on the backdrop do the same thing, which is to close it.
 * The dialog lives in its own container, so re-rendering the app does not destroy it.
 */
export class Modal
{
    private readonly root: HTMLElement;
    private readonly background: HTMLElement[];
    private opener: HTMLElement | null = null;
    private backdrop: HTMLElement | null = null;
    private title: HTMLElement | null = null;
    private body: HTMLElement | null = null;
    private dialog: HTMLElement | null = null;
    private closeHandler: (() => void) | undefined;
    private readonly onClosed: () => void;
    private readonly onKeydown = (event: KeyboardEvent): void => this.handleKeydown(event);

    /**
     * @param root Container the dialog is rendered into, outside the app's own root.
     * @param background Page content that is blocked and hidden from assistive technology while the dialog is open.
     * @param onClosed Called after the dialog closed, whatever it showed, once its own `onClose` has run: what waits for
     *        no dialog to be open can go on then.
     */
    public constructor(root: HTMLElement, background: HTMLElement[] = [], onClosed: () => void = () => undefined)
    {
        this.root = root;
        this.background = background;
        this.onClosed = onClosed;
    }

    /** Whether the dialog is showing. */
    public get isOpen(): boolean
    {
        return this.backdrop !== null;
    }

    /**
     * Opens the dialog, or replaces its content when it is already open. Focus returns to the element
     * that had it before, when the dialog closes.
     * @param view Heading and body.
     */
    public show(view: ModalView): void
    {
        if (!this.isOpen)
        {
            this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            this.build();
        }
        (this.dialog as HTMLElement).className = `modal ${view.className ?? ""}`.trim();
        this.closeHandler = view.onClose;
        (this.title as HTMLElement).textContent = view.title;
        (this.body as HTMLElement).replaceChildren(view.content);
        (this.body as HTMLElement).scrollTop = 0;
        (this.title as HTMLElement).focus();
    }

    /**
     * Replaces what an open dialog shows while the user works in it: the scroll position stays, and the keyboard focus
     * is left to the caller, who knows where the user was. When the caller puts it nowhere, it rests on the heading,
     * never outside the dialog. Does nothing while the dialog is closed.
     * @param view Heading and body.
     */
    public update(view: ModalView): void
    {
        if (!this.isOpen)
        {
            return;
        }
        (this.dialog as HTMLElement).className = `modal ${view.className ?? ""}`.trim();
        this.closeHandler = view.onClose;
        (this.title as HTMLElement).textContent = view.title;
        (this.body as HTMLElement).replaceChildren(view.content);
        if (!(this.backdrop as HTMLElement).contains(document.activeElement))
        {
            (this.title as HTMLElement).focus();
        }
    }

    /** Closes the dialog and gives focus back. Safe to call when it is closed. */
    public close(): void
    {
        if (!this.backdrop)
        {
            return;
        }
        document.removeEventListener("keydown", this.onKeydown, true);
        document.body.classList.remove(BODY_OPEN_CLASS);
        for (const element of this.background)
        {
            element.removeAttribute("inert");
            element.removeAttribute("aria-hidden");
        }
        this.backdrop.remove();
        this.backdrop = null;
        this.title = null;
        this.body = null;
        this.dialog = null;
        const closed = this.closeHandler;
        this.closeHandler = undefined;
        // The page may have been drawn anew under the dialog: then the control that opened it is found again by its id.
        const opener = this.opener;
        const again = opener && !opener.isConnected && opener.id ? document.getElementById(opener.id) : null;
        const target = opener?.isConnected ? opener : again ?? document.querySelector<HTMLElement>("[data-focus]");
        this.opener = null;
        target?.focus();
        closed?.();
        this.onClosed();
    }

    /** Builds the dialog frame. */
    private build(): void
    {
        this.title = el("h2", { id: "modal-title", class: "modal-title", tabindex: "-1" });
        this.body = el("div", { class: "modal-body" });
        const close = el("button", { class: "modal-close", type: "button", "aria-label": t("modal.close"), onclick: () => this.close() }, CLOSE_GLYPH);
        this.dialog = el("section", { class: "modal", role: "dialog", "aria-modal": "true", "aria-labelledby": "modal-title" },
            el("header", { class: "modal-head" }, this.title, close),
            this.body);
        const dialog = this.dialog;
        this.backdrop = el("div", {
            class: "modal-backdrop",
            onclick: (event: Event) =>
            {
                if (event.target === this.backdrop)
                {
                    this.close();
                }
            },
        }, dialog);
        this.root.append(this.backdrop);
        document.body.classList.add(BODY_OPEN_CLASS);
        for (const element of this.background)
        {
            element.setAttribute("inert", "");
            element.setAttribute("aria-hidden", "true");
        }
        document.addEventListener("keydown", this.onKeydown, true);
    }

    /**
     * Escape closes. Tab and Shift+Tab cycle inside the dialog.
     * @param event Keyboard event, seen before any other handler.
     */
    private handleKeydown(event: KeyboardEvent): void
    {
        if (!this.backdrop)
        {
            return;
        }
        if (event.key === "Escape")
        {
            // An open list inside the dialog takes the key first and closes itself.
            if (this.backdrop.querySelector("[aria-expanded=true]"))
            {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            this.close();
            return;
        }
        if (event.key !== "Tab")
        {
            return;
        }
        const focusable = Array.from(this.backdrop.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (focusable.length === 0)
        {
            event.preventDefault();
            return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        if (event.shiftKey && (active === first || !this.backdrop.contains(active) || active === this.title))
        {
            event.preventDefault();
            last.focus();
        }
        else if (!event.shiftKey && (active === last || !this.backdrop.contains(active)))
        {
            event.preventDefault();
            first.focus();
        }
    }
}
