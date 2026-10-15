/** The digit zero of the Arabic-Indic, the extended Arabic-Indic and the Devanagari digits. Each block runs from 0 to 9. */
const ARABIC_INDIC_ZERO = 0x0660;
const EXTENDED_ARABIC_INDIC_ZERO = 0x06f0;
const DEVANAGARI_ZERO = 0x0966;
const DIGIT_BLOCKS = [ARABIC_INDIC_ZERO, EXTENDED_ARABIC_INDIC_ZERO, DEVANAGARI_ZERO];

/** How many digits a block has. */
const DIGITS_PER_BLOCK = 10;

/** A key that is one character on the keyboard: a letter or a digit. */
const SINGLE_CHARACTER = /^[a-z0-9]$/;

/**
 * The key a shortcut should see. A keyboard layout of another script (Arabic, Ukrainian, Hindi) types other characters
 * on the same keys, and a number row can type digits of its own script, so the shortcuts 1 to 4, A to D, T and M would
 * silently stop working. Digits of other scripts count as the digits 0 to 9, and a character that is not a Latin letter
 * or digit is replaced by the Latin letter or digit that is printed on the physical key. A Latin key stays as it is, so
 * a layout like AZERTY or Dvorak keeps the letters the user sees. Named keys (Enter, ArrowLeft) are returned in lower case.
 * @param key The `key` of a keyboard event.
 * @param code The `code` of the same event: the physical key, for example "KeyA" or "Digit1".
 * @returns The key in lower case.
 */
export function shortcutKey(key: string, code: string): string
{
    const lower = key.toLowerCase();
    if (lower.length !== 1 || SINGLE_CHARACTER.test(lower))
    {
        return lower;
    }
    const point = lower.codePointAt(0) as number;
    for (const start of DIGIT_BLOCKS)
    {
        if (point >= start && point < start + DIGITS_PER_BLOCK)
        {
            return String(point - start);
        }
    }
    const letter = /^Key([A-Z])$/.exec(code);
    if (letter)
    {
        return letter[1].toLowerCase();
    }
    const digit = /^(?:Digit|Numpad)([0-9])$/.exec(code);
    return digit ? digit[1] : lower;
}
