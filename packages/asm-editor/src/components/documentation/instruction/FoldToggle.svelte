<script lang="ts">
    /**
     * The button inside a heading that folds what follows it away, drawn as the app's folding
     * headers are (a Documentation Chapter's, `CollapsibleSection`): the whole row a button tinted
     * under the pointer, a chevron that turns as it opens, and how many it holds after its name in
     * muted text. In the Workbench's Documentation panel an instruction's Operands legend and a
     * folded Forms section open with it (owner, 2026-11-08). It takes its heading's size.
     */
    import FaChevronRight from '~icons/fa-solid/chevron-right'

    interface Props {
        label: string
        /** What it holds, after its name: "6", "3 rows". */
        count: string
        open: boolean
    }

    let { label, count, open = $bindable(false) }: Props = $props()
</script>

<button type="button" class="fold-toggle" aria-expanded={open} onclick={() => (open = !open)}>
    <span class="chevron" class:open aria-hidden="true"><FaChevronRight /></span>
    <span class="label">{label}</span>
    <span class="count">{count}</span>
</button>

<style>
    /* the row's width and a little past its text on either side, for the tint */
    .fold-toggle {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        width: calc(100% + 0.8rem);
        margin: 0 -0.4rem;
        padding: 0.3rem 0.4rem;
        border: none;
        border-radius: var(--r-control);
        background: transparent;
        color: inherit;
        font: inherit;
        font-weight: 700;
        text-align: left;
        cursor: pointer;
    }
    .fold-toggle:hover {
        background-color: var(--hover-bg);
    }
    .fold-toggle:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: -2px;
    }
    /* the Chapters' chevron (DocumentationBrowser) */
    .chevron {
        display: flex;
        flex: none;
        width: var(--fs-micro);
        height: var(--fs-micro);
        opacity: 0.6;
        transition: transform var(--dur-base) ease;
    }
    .chevron.open {
        transform: rotate(90deg);
    }
    .count {
        font-weight: 400;
        color: var(--text-muted);
    }
</style>
