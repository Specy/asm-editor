<script lang="ts">
    import TryEditorLink from './TryEditorLink.svelte'

    interface Props {
        sections: { id: string; title: string }[]
        article: HTMLElement | undefined
    }

    let { sections, article }: Props = $props()
    let activeId = $state('')

    $effect(() => {
        if (!article) return
        const root = article
        const ids = new Set(sections.map((section) => section.id))
        let headings: HTMLElement[] = []
        let frame = 0

        function update() {
            frame = 0
            let current = headings[0]?.id ?? ''
            for (const heading of headings) {
                if (heading.getBoundingClientRect().top > 100) break
                current = heading.id
            }
            if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2) {
                current = headings.at(-1)?.id ?? current
            }
            activeId = current
        }

        function schedule() {
            if (!frame) frame = requestAnimationFrame(update)
        }

        function refresh() {
            headings = [...root.querySelectorAll<HTMLElement>('h2[id]')].filter((heading) =>
                ids.has(heading.id)
            )
            schedule()
        }

        // Markdown hydration replaces the prerendered headings; images and playgrounds resize them.
        const mutations = new MutationObserver(refresh)
        mutations.observe(root, { childList: true, subtree: true })
        const resize = new ResizeObserver(schedule)
        resize.observe(root)
        window.addEventListener('scroll', schedule, { passive: true })
        window.addEventListener('resize', schedule)
        refresh()

        return () => {
            mutations.disconnect()
            resize.disconnect()
            window.removeEventListener('scroll', schedule)
            window.removeEventListener('resize', schedule)
            cancelAnimationFrame(frame)
        }
    })
</script>

<aside class="blog-outline">
    {#if sections.length}
        <nav aria-label="On this page">
            <p class="blog-outline-title">On this page</p>
            <ol>
                {#each sections as section (section.id)}
                    <li>
                        <a
                            href={`#${section.id}`}
                            aria-current={(activeId || sections[0]?.id) === section.id
                                ? 'location'
                                : undefined}>{section.title}</a
                        >
                    </li>
                {/each}
            </ol>
        </nav>
    {/if}
    <TryEditorLink />
</aside>
