<script lang="ts">
    import { onDestroy, untrack } from 'svelte'
    import MarkdownRenderer from '#cmp/shared/markdown/MarkdownRenderer.svelte'
    import { headingSlug } from '#lib/content/headings.ts'
    import { fileBytes, type ProjectFile, type ProjectFiles } from '#lib/projectFiles.ts'
    import { markdownImageType, markdownTarget } from './markdownLinks'

    /**
     * The **Preview** of a Markdown File: its text rendered as the Documentation renders a
     * Lecture, kept current as it is typed in another pane. Its images and links point into the
     * Project, as they would on GitHub: an image File shows from its bytes, a link opens its File
     * in the Workbench, and nothing reaches the page's own address. What whoever shared the
     * Project wrote cannot style, frame or cover the page around it.
     */
    interface Props {
        path: string
        file: ProjectFile
        /** The Project's Files, which the Markdown's images and links point at. */
        files: ProjectFiles
        /** A link to another File of the Project was followed. */
        onOpenFile: (path: string) => void
        /** Whether the execution dock floats over the pane's bottom edge, which the end scrolls clear of. */
        dockInset?: boolean
    }

    let { path, file, files, onOpenFile, dockInset = false }: Props = $props()

    /** How long typing beside the Preview pauses before it renders again. */
    const RENDER_PAUSE = 150

    const text = $derived(file.encoding === 'plain' ? file.content : '')
    /** The text rendered, which follows the File's once typing pauses. */
    let source = $state(untrack(() => text))
    $effect(() => {
        const next = text
        if (next === untrack(() => source)) return
        const timer = setTimeout(() => (source = next), RENDER_PAUSE)
        return () => clearTimeout(timer)
    })

    /**
     * Which Files could be images, and in which version: a File stored as bytes, or an SVG. The
     * Project's map of Files is a new one at every edit, typing in this very File included, so
     * the images are rendered again only when one of these changes.
     */
    const recordIds = new WeakMap<ProjectFile, number>()
    let nextRecordId = 0
    const idOf = (record: ProjectFile) => {
        let id = recordIds.get(record)
        if (id === undefined) recordIds.set(record, (id = nextRecordId++))
        return id
    }
    const imageFiles = $derived(
        Object.entries(files)
            .filter(([name, record]) => record.encoding !== 'plain' || /\.svg$/i.test(name))
            .map(([name, record]) => `${name}\0${idOf(record)}`)
            .join('\n')
    )

    /** The Blob URL of each image File the Markdown shows, made again when its bytes change. */
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- A cache read while preparing a render; nothing renders from it.
    const images = new Map<string, { record: ProjectFile; url: string }>()
    function imageUrl(target: string, record: ProjectFile, type: string) {
        const kept = images.get(target)
        if (kept?.record === record) return kept.url
        if (kept) URL.revokeObjectURL(kept.url)
        const blob = new Blob([fileBytes(record) as Uint8Array<ArrayBuffer>], { type })
        const url = URL.createObjectURL(blob)
        images.set(target, { record, url })
        return url
    }
    onDestroy(() => {
        for (const { url } of images.values()) URL.revokeObjectURL(url)
    })

    /**
     * Points each image at its File's bytes, before the browser could ask the page's own address
     * for it: an image that is no image File of the Project shows its description instead.
     */
    const prepare = $derived.by(() => {
        void imageFiles
        const from = path
        return (content: DocumentFragment) => {
            for (const image of content.querySelectorAll('img')) {
                const src = image.getAttribute('src')
                if (src === null) continue
                const target = markdownTarget(from, src)
                if (target.to === 'web') continue
                const record = target.to === 'file' ? untrack(() => files[target.path]) : undefined
                const type =
                    target.to === 'file' && record && markdownImageType(target.path, record)
                if (target.to === 'file' && record && type) {
                    image.setAttribute('src', imageUrl(target.path, record, type))
                    continue
                }
                image.removeAttribute('src')
                image.setAttribute(
                    'title',
                    target.to === 'file' ? `No image File at ${target.path}` : 'No image here'
                )
            }
        }
    })

    let body = $state<HTMLDivElement>()

    /** Scrolls the Preview to the first heading whose slug is `slug`, as GitHub's anchors do. */
    function showHeading(slug: string) {
        if (!body) return
        const wanted = headingSlug(slug)
        const heading = [...body.querySelectorAll('h1, h2, h3, h4, h5, h6')].find(
            (candidate) => headingSlug(candidate.textContent ?? '') === wanted
        )
        if (!heading) return
        //the Preview scrolls, not the Workbench around it, which `scrollIntoView` would move too
        const offset = heading.getBoundingClientRect().top - body.getBoundingClientRect().top
        body.scrollBy({ top: offset - 16, behavior: 'smooth' })
    }

    /**
     * A link out opens a new tab, as the renderer marks it to; any other stays in the Workbench: a
     * heading scrolls into view, a File of the Project opens. A middle click on one is stopped
     * too, since the browser would open the page's own address with the path on it.
     */
    function follow(event: MouseEvent) {
        const anchor = (event.target as Element | null)?.closest('a[href]')
        if (!anchor) return
        const target = markdownTarget(path, anchor.getAttribute('href') ?? '')
        if (target.to === 'web') return
        event.preventDefault()
        if (event.type !== 'click') return
        if (target.to === 'heading') showHeading(target.slug)
        else if (target.to === 'file' && target.path === path) {
            if (target.slug) showHeading(target.slug)
        } else if (target.to === 'file' && files[target.path]) onOpenFile(target.path)
    }
</script>

<!-- the links inside are what is clicked, and they take the keyboard's Enter as a click too -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<div
    bind:this={body}
    class="markdown-preview"
    class:dock-inset={dockInset}
    role="region"
    aria-label="Preview of {path}"
    onclick={follow}
    onauxclick={follow}
>
    <MarkdownRenderer {source} untrusted live centered={false} {prepare} />
</div>

<style lang="scss">
    .markdown-preview {
        /* the execution dock's tray and the gap under it, which the end of the text scrolls clear of */
        --dock-room: 0px;
        flex: 1;
        min-width: 0;
        min-height: 0;
        overflow: auto;
        padding: 1.25rem 1rem calc(1.5rem + var(--dock-room));
        background: var(--secondary);
        color: var(--secondary-text);
    }
    .dock-inset {
        --dock-room: calc(var(--wb-control-height, 2.6rem) + 0.75rem);
    }
    /* one column, every block from its left edge, as a README reads: the prose keeps its own
       measure, code and tables the column's */
    .markdown-preview > :global(._markdown) {
        max-width: 48rem;
        margin-inline: auto;
    }
    .markdown-preview :global(img) {
        max-width: 100%;
    }
    /* as the Documentation's entries mark them, since the page's own links take the text's colour */
    .markdown-preview :global(a) {
        color: var(--accent);
        text-decoration: underline;
    }
    .markdown-preview :global(blockquote) {
        box-sizing: border-box;
        width: min(100%, 70ch);
        margin: 0 var(--md-inline-margin, auto);
        padding: 0.4rem 0.8rem;
        border-left: 0.2rem solid var(--accent);
        border-radius: 0.3rem;
        background-color: color-mix(in srgb, var(--accent) 8%, transparent);
    }
    .markdown-preview :global(blockquote p) {
        width: 100%;
    }
</style>
