/** What an element's Tooltip says, read through its description as a screen reader would. */
export function tooltipText(element: Element | null | undefined): string | undefined {
    const id = element?.getAttribute('aria-describedby')?.split(/\s+/).at(-1)
    return id ? document.getElementById(id)?.textContent?.replace(/\s+/g, ' ').trim() : undefined
}
