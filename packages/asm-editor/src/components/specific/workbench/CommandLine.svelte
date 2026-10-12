<script lang="ts">
    /**
     * The Terminal's first line, the **Command line** `$ ./crackme hunter2`
     * ([binary-import.md](../../../../../../docs/design/binary-import.md), decision 12): the name the
     * program starts under, fixed, and its Arguments, typed as in a shell. Outside a Debug session
     * an edit saves the Project's Setting at once; during one the line is locked to what that run
     * started with. It is not a shell: Build and Run start the program, and nothing typed here runs.
     * The words the program will get are its tooltip, and text that does not parse says why beside
     * it. On a phone it stays one line, scrolled sideways.
     */
    import { untrack } from 'svelte'
    import { describeArgv } from '#lib/commandLine.ts'
    import type { CommandLineState } from '#lib/workbench/WorkbenchSession.svelte.ts'

    interface Props {
        commandLine: CommandLineState
        onChange: (text: string) => void
        /** A change asks for the keyboard, as a Problem about the Arguments does when chosen. */
        focusRequest?: number
    }

    let { commandLine, onChange, focusRequest = 0 }: Props = $props()

    const id = $props.id()
    let input: HTMLInputElement | undefined = $state()
    const argv0 = $derived(`./${commandLine.program}`)
    const parsed = $derived(commandLine.parsed)
    const problem = $derived('error' in parsed ? parsed.error : undefined)
    const tooltip = $derived.by(() => {
        const words = 'error' in parsed ? parsed.error : describeArgv(argv0, parsed.args)
        return commandLine.locked && !('error' in parsed)
            ? `${words}\n\nWhat this run started with. Stop the Debug session to change it.`
            : words
    })

    //only a request made after the line was drawn takes the keyboard
    let lastFocusRequest = untrack(() => focusRequest)
    $effect(() => {
        if (focusRequest === lastFocusRequest) return
        lastFocusRequest = focusRequest
        input?.focus()
        input?.select()
    })
</script>

<div class="command-line" class:locked={commandLine.locked} title={tooltip}>
    <div class="line">
        <span class="prompt" aria-hidden="true">$</span>
        <label class="program" for="{id}-arguments">{argv0}</label>
        <input
            bind:this={input}
            id="{id}-arguments"
            class="arguments"
            class:invalid={problem}
            type="text"
            value={commandLine.text}
            readonly={commandLine.locked}
            size={Math.max(12, [...commandLine.text].length + 1)}
            placeholder={commandLine.locked ? '' : 'arguments'}
            aria-label="Arguments of {argv0}"
            aria-invalid={problem ? 'true' : undefined}
            aria-describedby={problem ? `${id}-problem` : undefined}
            spellcheck="false"
            autocomplete="off"
            autocapitalize="off"
            enterkeyhint="done"
            oninput={(event) => onChange(event.currentTarget.value)}
            onkeydown={(event) => {
                if (event.key === 'Enter' || event.key === 'Escape') event.currentTarget.blur()
            }}
        />
        {#if problem}
            <span class="problem" id="{id}-problem" role="alert">{problem}</span>
        {/if}
    </div>
</div>

<style lang="scss">
    /* a terminal's line, ruled off from the transcript under it; one line however long, scrolled
       sideways where the panel is narrower than it */
    .command-line {
        flex: none;
        overflow-x: auto;
        overflow-y: hidden;
        padding: 0.2rem 0.8rem;
        border-bottom: 1px solid var(--wb-line, color-mix(in srgb, var(--hint) 30%, transparent));
        font-family: monospace;
        scrollbar-width: thin;
    }

    .line {
        display: flex;
        align-items: baseline;
        gap: 0.6ch;
        width: max-content;
        min-width: 100%;
        white-space: pre;
    }

    .prompt {
        color: var(--hint);
        user-select: none;
    }

    .program {
        color: var(--accent);
        font-weight: bold;
    }

    /* the input reads as the rest of the line: no box, only an underline that shows it is typed in */
    .arguments {
        min-width: 0;
        padding: 0 0.1rem;
        border: none;
        border-bottom: 1px dashed color-mix(in srgb, var(--hint) 60%, transparent);
        border-radius: 0;
        background: transparent;
        color: inherit;
        font: inherit;
        field-sizing: content;

        &:focus {
            outline: none;
            border-bottom: 1px solid var(--accent);
        }

        &::placeholder {
            color: var(--hint);
            opacity: 0.6;
        }

        &.invalid {
            border-bottom: 1px solid var(--red);
        }
    }

    .locked .arguments {
        border-bottom-color: transparent;
        cursor: default;
    }

    .problem {
        font-family: Rubik, sans-serif;
        font-size: 0.78em;
        color: var(--red);
    }
</style>
