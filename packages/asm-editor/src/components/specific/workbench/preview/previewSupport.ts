/**
 * What this browser can show of a **Preview** ([file-views.md](../../../../../../../docs/design/file-views.md),
 * decision 14), apart from the component so that it can be asked of any navigator.
 */

/** What a pane says, over the File's bytes, where the browser cannot show what the File is. */
export const PREVIEW_UNAVAILABLE = {
    image: 'This browser cannot show this image.',
    audio: 'This browser cannot play this audio.',
    video: 'This browser cannot play this video.'
} as const

/**
 * How a PDF can be shown: in a frame, where the browser says it has a PDF viewer; only its first
 * page, on iOS and iPadOS, whose frames show no more although they report a viewer; or in a tab of
 * its own, elsewhere (Android). iPadOS's Safari names itself a Mac, so a Mac with a touch screen
 * is taken for an iPad.
 */
export type PdfDisplay = 'frame' | 'first-page' | 'tab'

export function pdfDisplay(
    navigator: Pick<Navigator, 'pdfViewerEnabled' | 'userAgent' | 'maxTouchPoints'>
): PdfDisplay {
    const agent = navigator.userAgent ?? ''
    const ios =
        /iPhone|iPad|iPod/.test(agent) ||
        (/Macintosh/.test(agent) && (navigator.maxTouchPoints ?? 0) > 1)
    if (ios) return 'first-page'
    return navigator.pdfViewerEnabled === true ? 'frame' : 'tab'
}

/** A duration in seconds as minutes and seconds, `3:07`, or hours too, `1:02:03`. */
export function formatDuration(seconds: number): string | undefined {
    if (!Number.isFinite(seconds) || seconds < 0) return undefined
    const whole = Math.round(seconds)
    const [hours, minutes, rest] = [
        Math.floor(whole / 3600),
        Math.floor(whole / 60) % 60,
        whole % 60
    ]
    const tail = String(rest).padStart(2, '0')
    return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${tail}` : `${minutes}:${tail}`
}
