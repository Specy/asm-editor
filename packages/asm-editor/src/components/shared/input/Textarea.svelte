<script lang="ts">
    interface Props {
        value?: string
        title?: string
        /** The hint inside it while it is empty: its title when left out. */
        placeholder?: string
        /** A word at the right of the title, such as "Optional", read with it as part of its name. */
        hint?: string
    }

    let { value = $bindable(''), title = '', placeholder, hint }: Props = $props()
</script>

<label class="wrapper" class:hinted={hint !== undefined}>
    <span>{title}</span>
    {#if hint}<span class="hint">{hint}</span>{/if}
    <textarea placeholder={placeholder ?? title} bind:value></textarea>
</label>

<style lang="scss">
    @use '../../../styles/field.scss';

    /* drawn as every field is (styles/field.scss), as TextField is */
    textarea {
        @include field.input;
        padding: 0.5rem 0.75rem;
        min-height: 4rem;
        max-height: 20rem;
        resize: vertical;
    }
    .wrapper {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        flex: 1;
    }

    /* the title at the left, its hint at the right, as TextField draws a hint */
    .hinted {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: baseline;
        column-gap: 0.75rem;

        textarea {
            grid-column: 1 / -1;
        }
    }
    .hint {
        font-size: var(--fs-caption);
        color: var(--text-muted);
    }
</style>
