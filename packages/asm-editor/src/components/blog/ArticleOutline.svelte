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
                //a heading is the current one once it reaches the line a jump to it lands on (its
                //scroll margin, --anchor-offset), so following a link marks the section opened
                const landing = parseFloat(getComputedStyle(heading).scrollMarginTop) || 0
                if (heading.getBoundingClientRect().top > landing + 1) break
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
            <p class="group-title">On this page</p>
            <ol class="rows">
                {#each sections as section (section.id)}
                    <li>
                        <a
                            class="row"
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

<style lang="scss">
    @use '../../styles/outline.scss';
    @use '../../styles/focus.scss' as *;

    /* the course sidebar's and the exam builder's outline (styles/outline.scss): the heading as
       its group title, level with the rows' text, no room above it so it stays level with the
       article's back link (the aside's padding gives that room) */
    .group-title {
        @include outline.group-title;
        padding-top: 0;
    }

    /* the sections as the outline's rows along the list's 1px rule: each row starts on the rule
       (-1px), so the section being read lays its accent edge over it; edge to edge with no gap,
       their own padding the rhythm, the row under the pointer in the hover tint, the keyboard's
       ring inside the row (the list scrolls, so a ring outside it would be cut) */
    .rows {
        @include outline.rows;
        border-left: 1px solid var(--line);
    }
    .row {
        @include outline.row('[aria-current="location"]');
        @include outline.row-padding;
        @include focus-ring($inset: true);
        margin-left: -1px;
        font-size: var(--fs-small);
        line-height: 1.45;
        color: var(--background-text-prose);
        text-decoration: none;
    }
</style>
