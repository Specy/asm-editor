<script lang="ts">
    /**
     * A line of text to type, drawn as every field in the app is (`styles/field.scss`): the fill the
     * Testcases' fields had (`--secondary` mixed with `--tertiary`), the surface's `--line` round it, `--r-control` corners and
     * the placeholder in `--hint`. With a `label` it stands under that label, which names it; with
     * none, the caller names it (`aria-label`, `aria-labelledby` or a `<label>` round it). The rest
     * goes to the `<input>`, so it takes every attribute and handler an input does.
     */
    import { onMount } from 'svelte'
    import type { HTMLInputAttributes } from 'svelte/elements'

    interface Props extends Omit<HTMLInputAttributes, 'value' | 'size'> {
        value?: string | number | null
        el?: HTMLInputElement
        /** The words above it, its name. */
        label?: string
        /** A word at the right of the label, such as "Optional", read with it as part of its name. */
        hint?: string
        /** `md` for a form, `sm` for a panel's or a tray's dense rows. */
        size?: 'sm' | 'md'
        /** Typed in Fira Code, for an address, a value, a command line's arguments. */
        mono?: boolean
        /** Edged in the danger colour; the caller says why to a screen reader (`aria-invalid`,
         *  `aria-describedby`), since not every such state is an invalid value. */
        invalid?: boolean
        /** Focused as soon as it is shown. */
        focus?: boolean
        /** The style of the label round it, when it has one. */
        wrapperStyle?: string
    }

    let {
        value = $bindable(),
        el = $bindable(),
        label,
        hint,
        size = 'md',
        mono = false,
        invalid = false,
        focus = false,
        wrapperStyle,
        type = 'text',
        spellcheck = false,
        class: className,
        ...rest
    }: Props = $props()

    onMount(() => {
        if (focus) el?.focus()
    })
</script>

{#snippet field()}
    <input
        bind:this={el}
        bind:value
        {type}
        {spellcheck}
        {...rest}
        class={['text-field', size, className]}
        class:mono
        class:invalid
    />
{/snippet}

{#if label}
    <label class="labelled" class:hinted={hint !== undefined} style={wrapperStyle}>
        <span>{label}</span>
        {#if hint}<span class="hint">{hint}</span>{/if}
        {@render field()}
    </label>
{:else}
    {@render field()}
{/if}

<style lang="scss">
    @use '../../../styles/field.scss';

    .text-field {
        @include field.input;
    }
    .md {
        padding: 0.5rem 0.75rem;
    }
    .sm {
        padding: 0.25rem 0.5rem;
    }
    .mono {
        font-family: var(--font-mono);
    }
    .invalid {
        border-color: var(--danger);
    }
    .invalid:focus-visible {
        outline-color: var(--danger);
    }

    .labelled {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
    }

    /* the label at the left, its hint at the right, the field across both under them */
    .hinted {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: baseline;
        column-gap: 0.75rem;

        .text-field {
            grid-column: 1 / -1;
        }
    }
    .hint {
        font-size: var(--fs-caption);
        color: var(--text-muted);
    }
</style>
