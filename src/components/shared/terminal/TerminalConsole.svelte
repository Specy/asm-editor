<script lang="ts">
    /**
     * The **Terminal** as a console: what the program wrote, and a caret where a read waits for
     * what is typed ([ADR 0036](../../../../docs/adr/0036-programs-read-input-typed-in-the-terminal.md)).
     * It only delivers keys: the Terminal's Line discipline decides what each read receives and
     * echoes it into the transcript, which this draws.
     *
     * The keys go to a visually hidden textarea at the caret, so a phone's keyboard, an IME and
     * paste work as in any text field; a composition is drawn at the caret until it is committed.
     * While it has focus the program owns the keyboard, as the focused Screen does
     * ([ADR 0008](../../../../docs/adr/0008-poll-keyboard-and-mouse-input.md)): a key down stops
     * here, so the page's shortcuts never see it, and Escape gives the keyboard back.
     *
     * A read takes the focus when it starts, and a host whose console is hidden reveals it first
     * (the [plan's](../../../../docs/design/environment-library-plan.md) decision 10); only a shown
     * console counts as attached for that. A touch keyboard opens only for a focus inside a gesture,
     * so a tap on the console focuses it again.
     */
    import { tick, untrack } from 'svelte'
    import type { Terminal } from '$lib/languages/peripherals/Terminal.svelte'
    import { TerminalTranscriptReader, styleClasses } from './terminalEscapes'

    interface Props {
        terminal: Terminal
        /** What is shown before the transcript and is not the program's: diagnostics, errors. */
        prefix?: string
        /** Whether the output's escape sequences are drawn, x86's SGR colours and clear screen. */
        escapes?: boolean
        /** Whether the console is on screen: a hidden one neither counts as attached nor scrolls. */
        visible?: boolean
        /** Whether a program is built and has not ended, so that typing has somewhere to go. */
        interactive?: boolean
        /** What an empty console says. */
        placeholder?: string
        style?: string
    }

    let {
        terminal,
        prefix = '',
        escapes = false,
        visible = true,
        interactive = true,
        placeholder = '',
        style = ''
    }: Props = $props()

    const id = $props.id()
    let scroller: HTMLDivElement | undefined = $state()
    let input: HTMLTextAreaElement | undefined = $state()
    let focused = $state(false)
    /** An IME's text not committed yet, drawn at the caret. */
    let composition = $state('')
    let composing = false
    /** How the last press on the console was made: a touch keyboard needs a focus inside it. */
    let pointerType = 'mouse'

    const output = $derived(terminal.output)
    const pendingRead = $derived(terminal.pendingRead)
    /** A read waiting on what is typed here, rather than on the focused Screen (ADR 0009). */
    const typingRead = $derived(pendingRead?.source === 'terminal' ? pendingRead : null)
    const screenRead = $derived(pendingRead?.source === 'keyboard' ? pendingRead : null)
    /**
     * Whether the read wants its prompt drawn: the blinking caret and the question. EASy68K's task
     * 16 turns its flashing cursor off, and then the console draws neither, though it still takes
     * the keys; a focused console keeps the outline it has when nothing is read.
     */
    const prompting = $derived(typingRead?.prompt === true)
    /** A read that does not echo, EASy68K's task 12, shows nothing of what is typed. */
    const echoing = $derived(typingRead?.echo !== false)
    /** Ctrl+D and the button do something only for standard input, and only on an empty line. */
    const offersEndOfInput = $derived(typingRead?.endOfInput === true && typingRead.line === '')
    const showsHint = $derived(
        typingRead !== null && prompting && typingRead.line === '' && composition === ''
    )
    const empty = $derived(!prefix && !output && !pendingRead && !focused && !composition)

    const reader = new TerminalTranscriptReader()
    const spans = $derived(escapes ? reader.spansOf(output) : null)

    const label = $derived(typingRead ? `Program input: ${typingRead.question}` : 'Program input')
    //expressions, because Svelte trims the space a tag's text starts with
    const CLICK_HINT = ' · click to type'
    const TAP_HINT = ' · tap to type'

    //only a console on screen is somewhere to type, which is what a host asks before revealing one
    $effect(() => {
        if (!visible) return
        return terminal.attachConsole()
    })

    //each of these moves the end of the console, which it follows as the program writes, and when
    //it is shown again, since what was written meanwhile could not be scrolled to
    const end = $derived([output, prefix, pendingRead, composition])
    $effect(() => {
        if (scroller && visible && end) scroller.scrollTop = scroller.scrollHeight
    })

    //a read that starts, or a console shown while one waits, takes the keyboard
    $effect(() => {
        const read = typingRead
        if (!read || !visible || !interactive) return
        untrack(takeFocus)
        if (untrack(() => document.activeElement === input)) return
        //A host can reveal an ancestor in the same update that starts this read. The
        //textarea may still be inside that hidden ancestor when the first focus runs.
        //Retry once after the DOM settles, unless this read/view has already changed.
        let current = true
        tick().then(() => {
            if (current && terminal.pendingRead === read && visible && interactive) takeFocus()
        })
        return () => {
            current = false
        }
    })

    //nothing can read what is typed once the program has ended: the keyboard goes back to the page.
    //Before the textarea is disabled, which would leave a focused one where it is
    $effect.pre(() => {
        if (interactive || !input) return
        untrack(() => {
            if (document.activeElement === input) input?.blur()
            focused = false
            composing = false
            composition = ''
            if (input) input.value = ''
        })
    })

    function takeFocus() {
        if (!input || input.disabled) return
        const active = document.activeElement
        if (active === input) return
        //someone typing in a field of the page keeps it; the code editor is read only while a
        //program runs, so it gives the keyboard up
        if (active instanceof HTMLElement && isTextEntry(active)) return
        input.focus()
    }

    function handleKeyDown(event: KeyboardEvent) {
        //the program owns the keys while the console has focus: a key down stops here, so the
        //page's window-level shortcuts never see it (Shift+C would clear the execution while a
        //program reads it). Ctrl and ⌘ combinations type nothing: they keep their browser default
        //and reach the page as from any text field, so a host's own guard, the exam's on Ctrl+P,
        //still sees them, and the Workbench ignores them there. Only a key down is stopped, so a
        //page that tracks held keys still sees them released
        if (!(event.ctrlKey || event.metaKey) || isEndOfInputKey(event)) event.stopPropagation()
        //a key an IME is composing with belongs to the IME
        if (event.isComposing || event.keyCode === 229) return
        if (event.key === 'Escape') {
            input?.blur()
            return
        }
        if (isEndOfInputKey(event)) {
            event.preventDefault()
            terminal.sendEndOfInput()
            return
        }
        const command = event.ctrlKey || event.metaKey || event.altKey
        if (event.key === 'Enter' && !command) {
            event.preventDefault()
            terminal.pressEnter()
            return
        }
        if (event.key === 'Backspace') {
            event.preventDefault()
            eraseBackward(event)
            return
        }
        //Shift+Tab still moves the focus back, a way out besides Escape
        if (event.key === 'Tab' && !command && !event.shiftKey) {
            event.preventDefault()
            terminal.insertText('\t')
            return
        }
        if ((event.key === 'PageUp' || event.key === 'PageDown') && scroller) {
            event.preventDefault()
            const page = scroller.clientHeight * 0.9
            scroller.scrollTop += event.key === 'PageUp' ? -page : page
        }
        //text is left to the input event, which also carries dead keys, IMEs and phone keyboards
    }

    /** Ctrl+D, also on a Mac, where Ctrl is not the command key and the shortcut is a terminal's. */
    function isEndOfInputKey(event: KeyboardEvent): boolean {
        if (!event.ctrlKey || event.metaKey || event.altKey) return false
        const key = event.key.toLowerCase()
        //a layout without Latin letters names the key by what it types; its position is D's
        return /^[a-z]$/.test(key) ? key === 'd' : event.code === 'KeyD'
    }

    /**
     * Backspace erases a character; with Ctrl (Option on a Mac) the word before the caret, with
     * Command the whole line, as a text field does. Each is Backspace pressed as many times.
     */
    function eraseBackward(event: KeyboardEvent) {
        const line = typingRead?.line ?? ''
        let count = 1
        if (event.metaKey) count = [...line].length
        else if (event.ctrlKey || event.altKey) count = wordLength(line)
        for (let erased = 0; erased < Math.max(1, count); erased++) terminal.pressBackspace()
    }

    /**
     * A phone keyboard that names every key 229 sends Backspace on an empty field only as an input
     * event with nothing to delete, which never reaches `input`.
     */
    function handleBeforeInput(event: InputEvent) {
        if (composing || event.isComposing || !input || input.value !== '') return
        if (event.inputType !== 'deleteContentBackward') return
        event.preventDefault()
        terminal.pressBackspace()
    }

    function handleInput(event: Event) {
        if (!input) return
        if (composing || (event as InputEvent).isComposing) {
            composition = input.value
            return
        }
        deliver()
    }

    /** Hands what the textarea holds to the Terminal and empties it for the next keystroke. */
    function deliver() {
        if (!input) return
        const text = input.value
        input.value = ''
        composition = ''
        //a line break that reached the textarea (a phone keyboard's Enter) is Enter, which
        //`insertText` already makes of it
        if (text.length > 0 && interactive) terminal.insertText(text)
    }

    function handleCompositionStart() {
        composing = true
    }

    function handleCompositionEnd() {
        composing = false
        deliver()
    }

    function handlePaste(event: ClipboardEvent) {
        event.preventDefault()
        const text = event.clipboardData?.getData('text')
        if (text && interactive) terminal.paste(text)
    }

    function handlePointerDown(event: PointerEvent) {
        pointerType = event.pointerType
    }

    function handleClick(event: MouseEvent) {
        if (!interactive || !input) return
        //the console's own button does its own thing
        if (event.target instanceof Element && event.target.closest('button')) return
        //a selection is someone copying output, which the focus would take away
        const selection = window.getSelection()
        if (selection && !selection.isCollapsed) return
        //a touch keyboard opens for a focus inside the gesture, and not for an element that has
        //it already, as a textarea that a read focused on its own does
        if (pointerType !== 'mouse' && document.activeElement === input) input.blur()
        input.focus({ preventScroll: true })
    }

    function endInput() {
        terminal.sendEndOfInput()
    }

    /** A field of the page someone may be typing in, other than the code editor. */
    function isTextEntry(element: HTMLElement): boolean {
        if (element.closest('.monaco-editor')) return false
        if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)
            return true
        if (element instanceof HTMLInputElement) return !NON_TEXT_INPUTS.has(element.type)
        return element.isContentEditable
    }

    const NON_TEXT_INPUTS = new Set([
        'button',
        'checkbox',
        'color',
        'file',
        'image',
        'radio',
        'range',
        'reset',
        'submit'
    ])

    /** How many characters Ctrl+Backspace takes: the spaces before the caret, then a word. */
    function wordLength(line: string): number {
        const characters = [...line]
        let count = 0
        const at = () => characters[characters.length - 1 - count]
        while (count < characters.length && /\s/.test(at())) count++
        while (count < characters.length && !/\s/.test(at())) count++
        return count
    }
</script>

<!-- a click anywhere hands the keyboard to the hidden textarea, which keyboard users reach by Tab;
     the inline parts are written without whitespace between them, which the console would show -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
    class="terminal-console"
    class:focused
    class:interactive
    {style}
    bind:this={scroller}
    onpointerdown={handlePointerDown}
    onclick={handleClick}
>
    <div class="screen">
        {#if empty && placeholder}<span class="placeholder">{placeholder}</span>{/if}<span
            class="transcript"
            role="log"
            aria-live="polite"
            aria-label="Program output"
            >{#if prefix}<span class="prefix">{prefix}</span
                >{/if}{#if spans}{#each spans as span, index (index)}{#if span.kind === 'text'}<span
                            class={styleClasses(span.style)}>{span.text}</span
                        >{:else}<span class="escape">{span.text}</span
                        >{/if}{/each}{:else}{output}{/if}</span
        ><span class="input-anchor"
            >{#if composition && echoing}<span class="composition">{composition}</span>{/if}<span
                class="caret"
                class:waiting={prompting}
                class:shown={prompting || focused}
                aria-hidden="true"
            ></span><textarea
                bind:this={input}
                class="input"
                rows={1}
                disabled={!interactive}
                aria-label={label}
                aria-describedby="{id}-keys"
                autocomplete="off"
                autocapitalize="off"
                spellcheck="false"
                inputmode="text"
                enterkeyhint="enter"
                onkeydown={handleKeyDown}
                onbeforeinput={handleBeforeInput}
                oninput={handleInput}
                onpaste={handlePaste}
                oncompositionstart={handleCompositionStart}
                oncompositionend={handleCompositionEnd}
                onfocus={() => (focused = true)}
                onblur={() => (focused = false)}></textarea></span
        >{#if showsHint && typingRead}<span class="hint" aria-hidden="true"
                >{typingRead.question}{#if !focused}<span class="fine">{CLICK_HINT}</span>{/if}<span
                    class="coarse">{TAP_HINT}</span
                ></span
            >{/if}{#if offersEndOfInput}<button
                type="button"
                class="end-of-input"
                title="End the program's standard input (Ctrl+D)"
                aria-keyshortcuts="Control+D"
                onpointerdown={(event) => event.preventDefault()}
                onclick={endInput}>End of input <kbd>Ctrl+D</kbd></button
            >{/if}{#if screenRead?.prompt}<span class="hint" aria-hidden="true"
                >{screenRead.question} · type on the focused Screen</span
            >{/if}
    </div>
    <span id="{id}-keys" class="visually-hidden">
        What is typed here goes to the program. Enter sends the line, Ctrl+D ends standard input,
        Escape gives the keyboard back to the page.
    </span>
</div>

<style lang="scss">
    .terminal-console {
        /* the sixteen colours of x86 output (terminalEscapes.ts), from the theme: a hue mixed with
           the panel's own text colour keeps its contrast on a dark panel and on a light one, and
           the bright half leans further towards it */
        --terminal-0: color-mix(in srgb, #000 55%, var(--secondary-text));
        --terminal-1: var(--red);
        --terminal-2: color-mix(in srgb, #3fa65a 80%, var(--secondary-text));
        --terminal-3: color-mix(in srgb, #c9a227 80%, var(--secondary-text));
        --terminal-4: color-mix(in srgb, #3f82d8 80%, var(--secondary-text));
        --terminal-5: color-mix(in srgb, #b25ed1 80%, var(--secondary-text));
        --terminal-6: color-mix(in srgb, #2aa5b8 80%, var(--secondary-text));
        --terminal-7: color-mix(in srgb, #fff 35%, var(--secondary-text));
        --terminal-8: var(--hint);
        --terminal-9: color-mix(in srgb, var(--red) 65%, var(--secondary-text));
        --terminal-10: color-mix(in srgb, #3fa65a 55%, var(--secondary-text));
        --terminal-11: color-mix(in srgb, #c9a227 55%, var(--secondary-text));
        --terminal-12: color-mix(in srgb, #3f82d8 55%, var(--secondary-text));
        --terminal-13: color-mix(in srgb, #b25ed1 55%, var(--secondary-text));
        --terminal-14: color-mix(in srgb, #2aa5b8 55%, var(--secondary-text));
        --terminal-15: color-mix(in srgb, #fff 70%, var(--secondary-text));
        position: relative;
        flex: 1;
        min-height: 0;
        min-width: 0;
        overflow: auto;
        /* the scrollbar keeps its room from the start, so output that starts to scroll does not
           shift sideways */
        scrollbar-gutter: stable;
        padding: var(--terminal-padding, 0.5rem 0.5rem 0.5rem 0.8rem);
        font-family: monospace;
    }

    .interactive {
        cursor: text;
    }

    /* the Screen's ring: while it shows, keys are the program's and the shortcuts are off */
    .focused {
        outline: 1px solid var(--accent);
        outline-offset: -1px;
    }

    .screen {
        white-space: pre-wrap;
    }

    .placeholder,
    .hint {
        font-family: Rubik, sans-serif;
        color: var(--hint);
        user-select: none;
    }

    .placeholder {
        font-size: 0.8rem;
    }

    .hint {
        margin-left: 0.6em;
        font-size: 0.8em;
    }

    .coarse {
        display: none;
    }

    @media (pointer: coarse) {
        .coarse {
            display: inline;
        }

        .fine,
        kbd {
            display: none;
        }
    }

    /* a sequence the console does not interpret, shown as the program wrote it */
    .escape {
        color: var(--hint);
        background-color: color-mix(in srgb, var(--hint) 14%, transparent);
        border-radius: 0.2rem;
    }

    .bold {
        font-weight: bold;
    }

    @for $color from 0 through 15 {
        .fg-#{$color} {
            color: var(--terminal-#{$color});
        }

        .bg-#{$color} {
            background-color: color-mix(in srgb, var(--terminal-#{$color}) 40%, transparent);
        }
    }

    .input-anchor {
        position: relative;
    }

    .composition {
        text-decoration: underline;
    }

    /* one cell of the monospace text, where the next character typed goes */
    .caret {
        display: none;
        width: 0.6em;
        height: 1.15em;
        vertical-align: text-bottom;
        border-radius: 1px;
        box-shadow: inset 0 0 0 1px var(--accent);

        &.shown {
            display: inline-block;
        }
    }

    .focused .caret.waiting {
        background-color: var(--accent);
        animation: blink 1.1s steps(1) infinite;
    }

    @keyframes blink {
        50% {
            background-color: transparent;
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .focused .caret.waiting {
            animation: none;
        }
    }

    /* there to take the keys, the IME and a phone's keyboard, at the caret so that a candidate
       window or a scroll into view lands there; 16px, because a phone zooms into a smaller field */
    .input {
        position: absolute;
        left: 0;
        top: 0;
        width: 1px;
        height: 1em;
        padding: 0;
        border: none;
        opacity: 0;
        resize: none;
        overflow: hidden;
        white-space: nowrap;
        font-size: 16px;
        line-height: 1;
        color: transparent;
        background: transparent;
        caret-color: transparent;
        pointer-events: none;
    }

    .end-of-input {
        display: inline-flex;
        align-items: baseline;
        gap: 0.4em;
        margin-left: 0.6em;
        padding: 0.05rem 0.5rem;
        border-radius: 0.3rem;
        border: 1px solid color-mix(in srgb, var(--tertiary) 80%, transparent);
        background-color: color-mix(in srgb, var(--tertiary) 45%, transparent);
        color: var(--secondary-text);
        font-family: Rubik, sans-serif;
        font-size: 0.75rem;
        font-weight: 500;
        white-space: nowrap;
        cursor: pointer;
        transition: background-color 0.15s;

        &:hover {
            background-color: var(--tertiary);
        }

        &:focus-visible {
            outline: 2px solid var(--accent);
            outline-offset: -2px;
        }

        kbd {
            font-family: inherit;
            color: var(--hint);
        }
    }

    .visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
    }
</style>
