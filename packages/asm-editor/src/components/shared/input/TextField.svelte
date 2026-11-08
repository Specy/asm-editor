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
        /**
         * A secret shown as dots that no browser or password manager offers to save, for the exam's
         * passwords: a "Save password?" bubble takes the focus from the page, which a running exam
         * reads as the student leaving it. A text field with its characters masked
         * (`-webkit-text-security`), never a password field, which is what a browser offers to
         * save; where a browser can't mask one, a password field after all, so the secret is never
         * shown in the clear. It can't be copied or cut out.
         */
        concealed?: boolean
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
        concealed = false,
        type = 'text',
        spellcheck = false,
        class: className,
        ...rest
    }: Props = $props()

    //whether this browser draws a text field's characters as dots (Chrome, Edge, Safari, Firefox
    //from 2024); assumed until the page has started, which is where a concealed field is used
    let masks = $state(true)
    onMount(() => {
        if (concealed) masks = CSS.supports('-webkit-text-security', 'disc')
        if (focus) el?.focus()
    })

    //no password manager's own detection either (1Password, LastPass, Bitwarden, Dashlane)
    const concealedAttributes = {
        autocomplete: 'off',
        'data-1p-ignore': '',
        'data-lpignore': 'true',
        'data-bwignore': '',
        'data-form-type': 'other'
    } as const
    const keepSecret = (event: ClipboardEvent) => event.preventDefault()
</script>

{#snippet field()}
    <input
        bind:this={el}
        bind:value
        type={concealed ? (masks ? 'text' : 'password') : type}
        {spellcheck}
        {...rest}
        {...concealed ? concealedAttributes : {}}
        oncopy={concealed ? keepSecret : rest.oncopy}
        oncut={concealed ? keepSecret : rest.oncut}
        class={['text-field', size, className]}
        class:mono
        class:invalid
        class:concealed
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
    .concealed {
        -webkit-text-security: disc;
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
