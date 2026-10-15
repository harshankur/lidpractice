/**
 * Hands a link to the user to pass on. A device that is used by touch and has a share sheet opens the sheet, which is
 * where its users expect a link to go. Everywhere else the link is copied, which is what a link button does on a desk.
 */

/** What became of a link: it went to the share sheet, it was copied, the user closed the sheet, or the device can do neither. */
export type ShareOutcome = "shared" | "copied" | "cancelled" | "unavailable";

/** What a device can do with a link. */
export interface ShareDevice
{
    /** Whether the device is used by touch. */
    touch: boolean;
    /** Opens the share sheet, when the device has one. */
    share?: (data: { title: string; url: string }) => Promise<void>;
    /** Copies a text, when the page may do so. */
    copy?: (text: string) => Promise<void>;
}

/**
 * What the browser the page runs in can do with a link.
 * @returns Its share sheet and its clipboard, where it has them.
 */
export function browserDevice(): ShareDevice
{
    return {
        touch: window.matchMedia?.("(pointer: coarse)").matches === true,
        ...(typeof navigator.share === "function" ? { share: (data: { title: string; url: string }) => navigator.share(data) } : {}),
        ...(navigator.clipboard?.writeText ? { copy: (text: string) => navigator.clipboard.writeText(text) } : {}),
    };
}

/**
 * Hands a link to the share sheet of the device, or copies it.
 * @param title What the link leads to, for the share sheet.
 * @param url The link.
 * @param device What the device can do. Replaced in tests.
 * @returns What became of the link. It never rejects: a sheet that was closed and a clipboard that refuses are outcomes too.
 */
export function shareLink(title: string, url: string, device: ShareDevice = browserDevice()): Promise<ShareOutcome>
{
    if (device.touch && device.share)
    {
        return device.share({ title, url }).then((): ShareOutcome => "shared", (): ShareOutcome => "cancelled");
    }
    if (device.copy)
    {
        return device.copy(url).then((): ShareOutcome => "copied", (): ShareOutcome => "unavailable");
    }
    return Promise.resolve("unavailable");
}
