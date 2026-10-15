import type { ThemeChoice } from "./types";

/** Class names on the root element. "auto" has none and follows the system setting. */
const THEME_CLASSES: Record<ThemeChoice, string | null> = { auto: null, light: "theme-light", dark: "theme-dark" };

/** Browser bar colour for each forced theme. */
const THEME_COLORS: Record<Exclude<ThemeChoice, "auto">, string> = { light: "#f2f3f6", dark: "#101319" };

/** Remembers the original bar colour of each theme-color tag, to put it back for "auto". */
const ORIGINAL_COLOR = "data-original-color";

/**
 * Applies a theme by toggling a class on the root element. All colours are custom properties
 * that the class re-defines, so nothing else has to change.
 * @param choice The theme.
 */
export function applyTheme(choice: ThemeChoice): void
{
    const root = document.documentElement;
    for (const name of Object.values(THEME_CLASSES))
    {
        if (name)
        {
            root.classList.remove(name);
        }
    }
    const name = THEME_CLASSES[choice];
    if (name)
    {
        root.classList.add(name);
    }
    for (const meta of Array.from(document.querySelectorAll<HTMLMetaElement>("meta[name=theme-color]")))
    {
        if (!meta.hasAttribute(ORIGINAL_COLOR))
        {
            meta.setAttribute(ORIGINAL_COLOR, meta.content);
        }
        meta.content = choice === "auto" ? (meta.getAttribute(ORIGINAL_COLOR) as string) : THEME_COLORS[choice];
    }
}
