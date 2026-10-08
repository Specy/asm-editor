/** Position a value's tooltip within its panel and any enclosing scroll areas. */
export function boundedValueHover(node: HTMLElement, boundary?: HTMLElement) {
    const popup = node.querySelector<HTMLElement>('.hover-element')!
    const content = popup.querySelector<HTMLElement>('.hover-content')!
    const anchor = node.querySelector<HTMLElement>('.tooltip-base')!
    const gap = 7
    let active = false
    let frame = 0
    let observer: ResizeObserver | undefined

    function place() {
        if (!active || !boundary) return
        const panel = boundary.getBoundingClientRect()
        let left = Math.max(0, panel.left)
        let right = Math.min(window.innerWidth, panel.right)
        let top = Math.max(0, panel.top)
        let bottom = Math.min(window.innerHeight, panel.bottom)
        // A page may be larger than the tab's scroll viewport. Only use its visible area.
        for (let parent = boundary.parentElement; parent; parent = parent.parentElement) {
            const css = getComputedStyle(parent)
            const rect = parent.getBoundingClientRect()
            if (css.overflowX !== 'visible') {
                left = Math.max(left, rect.left + parent.clientLeft)
                right = Math.min(right, rect.left + parent.clientLeft + parent.clientWidth)
            }
            if (css.overflowY !== 'visible') {
                top = Math.max(top, rect.top + parent.clientTop)
                bottom = Math.min(bottom, rect.top + parent.clientTop + parent.clientHeight)
            }
        }
        const target = anchor.getBoundingClientRect()
        const center = (target.left + target.right) / 2
        if (
            right - left < 12 ||
            bottom - top < 12 ||
            center < left ||
            center > right ||
            target.bottom <= top ||
            target.top >= bottom
        ) {
            popup.style.visibility = 'hidden'
            return
        }
        left += 5
        right -= 5
        top += 5
        bottom -= 5
        popup.style.maxWidth = `${right - left}px`
        popup.style.setProperty('--hover-max-height', `${bottom - top - 2}px`)
        const naturalHeight = popup.getBoundingClientRect().height
        const above = Math.max(0, target.top - top - gap)
        const below = Math.max(0, bottom - target.bottom - gap)
        const side =
            naturalHeight <= above
                ? 'above'
                : naturalHeight <= below
                  ? 'below'
                  : above >= below
                    ? 'above'
                    : 'below'
        const room = side === 'above' ? above : below
        // In an unusually short viewport, keep the box inside even if it must cover the byte.
        const overlaps = room < 20
        popup.style.setProperty(
            '--hover-max-height',
            `${Math.max(0, (overlaps ? bottom - top : room) - 2)}px`
        )
        const box = popup.getBoundingClientRect()
        const x = Math.max(left, Math.min(center - box.width / 2, right - box.width))
        const preferredY = side === 'above' ? target.top - gap - box.height : target.bottom + gap
        const y = Math.max(top, Math.min(preferredY, bottom - box.height))
        const origin = node.getBoundingClientRect()
        popup.style.left = `${x - origin.left}px`
        popup.style.top = `${y - origin.top}px`
        popup.style.setProperty(
            '--hover-notch-x',
            `${Math.max(6, Math.min(center - x, box.width - 6))}px`
        )
        popup.dataset.side = side
        popup.classList.toggle('overlapping', overlaps)
        popup.style.visibility = 'visible'
    }

    function schedule() {
        if (!frame)
            frame = requestAnimationFrame(() => {
                frame = 0
                place()
            })
    }

    function hide() {
        active = false
        cancelAnimationFrame(frame)
        frame = 0
        popup.classList.remove('shown')
        observer?.disconnect()
        window.removeEventListener('resize', schedule)
        window.removeEventListener('scroll', schedule, true)
    }

    function show(event: PointerEvent) {
        if (!boundary || event.pointerType === 'touch' || active) return
        active = true
        popup.classList.add('shown')
        place()
        observer = new ResizeObserver(schedule)
        observer.observe(boundary)
        observer.observe(anchor)
        observer.observe(content)
        window.addEventListener('resize', schedule)
        window.addEventListener('scroll', schedule, true)
    }

    node.addEventListener('pointerenter', show)
    node.addEventListener('pointerleave', hide)
    return {
        update(next?: HTMLElement) {
            boundary = next
            if (!boundary) hide()
            else if (active) schedule()
        },
        destroy() {
            hide()
            node.removeEventListener('pointerenter', show)
            node.removeEventListener('pointerleave', hide)
        }
    }
}
