<script lang="ts">
    import Card from '$cmp/shared/layout/Card.svelte'
    import Column from '$cmp/shared/layout/Column.svelte'
    import MarkdownRenderer from '$cmp/shared/markdown/MarkdownRenderer.svelte'
    import {
        formatMarsBaseAddress,
        MARS_BASE_ADDRESS_CHOICES,
        MARS_DISPLAY_SIZE_CHOICES,
        MARS_UNIT_SIZE_CHOICES,
        DEFAULT_PROJECT_DISPLAY
    } from '$lib/languages/mars/marsDisplay'
    import {
        MARS_INTERRUPT_ENABLE_BIT,
        MARS_READY_BIT,
        MARS_RECEIVER_CONTROL,
        MARS_RECEIVER_DATA,
        MARS_TRANSMITTER_CONTROL,
        MARS_TRANSMITTER_DATA
    } from '$lib/languages/mars/MarsDevices'

    /**
     * The screen and memory-mapped I/O page for MIPS and RISC-V. One component for both: MARS's
     * bitmap display and keyboard-and-display simulator and RARS's ports of them are the same two
     * tools with the same parameters and the same registers, so only the syscall register names and
     * the example syntax differ.
     */

    interface Props {
        /** Which environment the page is for; it decides the register names and the code samples. */
        variant: 'MIPS' | 'RISC-V'
        disableLinks?: boolean
    }

    let { variant, disableLinks = false }: Props = $props()

    const simulator = $derived(variant === 'MIPS' ? 'MARS' : 'RARS')
    const call = $derived(variant === 'MIPS' ? 'syscall' : 'ecall')
    const service = $derived(variant === 'MIPS' ? '$v0' : 'a7')
    const argument = $derived(variant === 'MIPS' ? '$a0' : 'a0')
    const highArgument = $derived(variant === 'MIPS' ? '$a1' : 'a1')
    const fence = $derived(variant === 'MIPS' ? 'mips' : 'riscv')
    const examples = $derived(variant === 'MIPS' ? 'examples/mips/' : 'examples/risc-v/')

    const registers = [
        {
            address: MARS_RECEIVER_CONTROL,
            name: 'Receiver control',
            description:
                'Bit 0 is **Ready**: a typed character is waiting in the receiver data register. The device sets it and clears it; a program only reads it.'
        },
        {
            address: MARS_RECEIVER_DATA,
            name: 'Receiver data',
            description:
                'The typed character, in the low byte. Reading it takes that character; the next one, if any, appears at once and Ready stays set until the queue is empty.'
        },
        {
            address: MARS_TRANSMITTER_CONTROL,
            name: 'Transmitter control',
            description:
                'Bit 0 is **Ready**, and here it is always set: the console never makes a program wait to print.'
        },
        {
            address: MARS_TRANSMITTER_DATA,
            name: 'Transmitter data',
            description:
                'Storing a character in the low byte prints it on the console. ASCII 12, a form feed, clears the console instead.'
        }
    ]

    const bitmapExample = $derived(
        variant === 'MIPS'
            ? `        .data
display:.space  262144          # 256 * 256 words

        .text
main:
        la      $t0, display
        li      $t1, 0x00ff8000 # low 24 bits: red 0xff, green 0x80, blue 0x00
        sw      $t1, 0($t0)     # the pixel at the top left
        sw      $t1, 1024($t0)  # 256 words further on: the one below it`
            : `        .data
display:.space  262144          # 256 * 256 words

        .text
main:
        la      t0, display
        li      t1, 0x00ff8000  # low 24 bits: red 0xff, green 0x80, blue 0x00
        sw      t1, 0(t0)       # the pixel at the top left
        sw      t1, 1024(t0)    # 256 words further on: the one below it`
    )

    const keyboardExample = $derived(
        variant === 'MIPS'
            ? `        li      $s0, 0xffff0000
poll:
        lw      $t0, 0($s0)     # receiver control
        andi    $t0, $t0, 1     # the Ready bit
        bnez    $t0, take
        li      $v0, 32         # nothing typed yet: a wait costs no instructions
        li      $a0, 10
        syscall
        j       poll
take:
        lw      $t1, 4($s0)     # receiver data, one character
        sw      $t1, 12($s0)    # transmitter data: print it`
            : `        li      s0, 0xffff0000
poll:
        lw      t0, 0(s0)       # receiver control
        andi    t0, t0, 1       # the Ready bit
        bnez    t0, take
        li      a7, 32          # nothing typed yet: a wait costs no instructions
        li      a0, 10
        ecall
        j       poll
take:
        lw      t1, 4(s0)       # receiver data, one character
        sw      t1, 12(s0)      # transmitter data: print it`
    )

    function hex(address: number): string {
        return `0x${(address >>> 0).toString(16).padStart(8, '0')}`
    }
</script>

<Column gap="1rem" style="width: 100%;">
    <p class="note">
        {variant} programs draw and read input through memory, not through system calls: the screen is
        a grid of words anywhere in memory, and the keyboard and the console are four words at
        <code>{hex(MARS_RECEIVER_CONTROL)}</code>. Both are {simulator}'s own tools, the
        <em>bitmap display</em>
        and the <em>keyboard and display simulator</em>, with the same parameters and the same
        register layout, so a program written for {simulator} runs here unchanged.
    </p>

    <section class="group">
        <h2 class="group-title" id="bitmap-display">Bitmap display</h2>
        <p class="note">
            One word of memory is one pixel. Its low 24 bits are the color, red in bits 23-16, green
            in 15-8 and blue in 7-0; the top byte is ignored. Words run left to right and then top
            to bottom, so the pixel below a word is one row of words further on.
        </p>
        <p class="note">
            The screen panel's <strong>Display</strong> button configures it, with {simulator}'s own
            five parameters. There is no way for a program to set them: like the tool it comes from,
            the display is something the user points at a region of memory. The parameters are saved
            with the project, and testcases run with them too, which is why every example states
            them in its header comment.
        </p>
        <Card gap="0.6rem" padding="1rem" background="secondary" style="width: 100%;">
            <div class="row">
                <span class="tag">1</span>
                <span class="sub-description">
                    <strong>Unit width</strong> and <strong>unit height in pixels</strong>: {MARS_UNIT_SIZE_CHOICES.join(
                        ', '
                    )}. How large one word is drawn. Default {DEFAULT_PROJECT_DISPLAY.unitWidth} by {DEFAULT_PROJECT_DISPLAY.unitHeight}.
                </span>
            </div>
            <div class="row">
                <span class="tag">2</span>
                <span class="sub-description">
                    <strong>Display width</strong> and <strong>height in pixels</strong>: {MARS_DISPLAY_SIZE_CHOICES.join(
                        ', '
                    )}. Default {DEFAULT_PROJECT_DISPLAY.width} by {DEFAULT_PROJECT_DISPLAY.height}.
                    Divided by the unit size, they give the word grid: the default is
                    {DEFAULT_PROJECT_DISPLAY.width} by {DEFAULT_PROJECT_DISPLAY.height} words, one megabyte
                    of memory.
                </span>
            </div>
            <div class="row">
                <span class="tag">3</span>
                <span class="sub-description">
                    <strong>Base address for display</strong>: where the grid starts.
                    {#each MARS_BASE_ADDRESS_CHOICES as choice, index (choice.address)}<code
                            >{formatMarsBaseAddress(choice.address)}</code
                        >{index < MARS_BASE_ADDRESS_CHOICES.length - 1 ? ', ' : '. '}{/each}
                    Default
                    <code>{formatMarsBaseAddress(DEFAULT_PROJECT_DISPLAY.baseAddress)}</code>, which
                    is where <code>.data</code> puts your first label.
                </span>
            </div>
        </Card>
        <MarkdownRenderer
            source={`\`\`\`${fence}\n${bitmapExample}\n\`\`\``}
            {disableLinks}
            simpleCode
        />
        <p class="note">
            Reserve the memory the grid covers, with <code>.space</code> or a label of your own: the
            screen shows whatever those words hold, and a program that writes past what it reserved
            is writing over something else. Undo walks the picture back with the code, because the
            picture <em>is</em> the memory the emulator rolled back.
        </p>
    </section>

    <section class="group">
        <h2 class="group-title" id="keyboard-and-display">Keyboard and display registers</h2>
        <p class="note">
            Four words carry one character each way. Click the screen panel to give the program the
            keyboard; the ring around it says the editor's own shortcuts are off while it has focus.
            What the program transmits is appended to the console transcript, the same one
            <code>print</code> services write to, which is also what testcases assert on.
        </p>
        <Card gap="0.8rem" padding="1rem" background="secondary" style="width: 100%;">
            {#each registers as register (register.address)}
                <div class="row">
                    <span class="tag wide">{hex(register.address)}</span>
                    <span class="sub-description">
                        <strong>{register.name}</strong> —
                        <MarkdownRenderer source={register.description} {disableLinks} simpleCode />
                    </span>
                </div>
            {/each}
        </Card>
        <MarkdownRenderer
            source={`\`\`\`${fence}\n${keyboardExample}\n\`\`\``}
            {disableLinks}
            simpleCode
        />
        <p class="note">
            The receiver never loses a keystroke: what does not fit in the data register waits in a
            queue behind it, and Ready ({MARS_READY_BIT}) stays set until that queue is empty. Bit 1
            of either control register, {simulator}'s interrupt-enable bit ({MARS_INTERRUPT_ENABLE_BIT}),
            stops the program with an error: this editor polls, it does not deliver device
            interrupts.
        </p>
    </section>

    <section class="group">
        <h2 class="group-title" id="program-time">Program time</h2>
        <p class="note">
            Service <code>30</code> (<code>{service}</code> before a <code>{call}</code>) answers
            with the time in milliseconds, low word in
            <code>{argument}</code>
            and high word in <code>{highArgument}</code>, and service <code>32</code> waits for the
            milliseconds in <code>{argument}</code>. Time is counted from the start of the run
            rather than from 1970, so a program differences two reads exactly as it did before, and
            a wait costs no instructions — a program idling on the keyboard never reaches the
            execution limit. In a testcase both run on a virtual clock that starts at zero and only
            advances through the program's own waits, so a five second wait finishes at once and
            elapsed-time output is the same on every machine.
        </p>
    </section>

    <section class="group">
        <h2 class="group-title" id="differences">Differences from {simulator}</h2>
        <ul class="rules">
            <li>
                The display is always there: it is a panel next to the memory view rather than a
                tool you connect to the program before running it.
            </li>
            <li>
                Interrupt-driven I/O is not supported. Setting the interrupt-enable bit of a control
                register stops the program with an error naming the feature; poll the Ready bit
                instead.
            </li>
            <li>
                Time comes from the start of the run, and a testcase runs on a virtual clock.
                {simulator} answers with the host's wall clock.
            </li>
            <li>There is no mouse: neither simulator's tools have one.</li>
            <li>
                Programs live in <code>{examples}</code> in the repository, one per feature, each with
                the display parameters it wants in its header comment.
            </li>
        </ul>
    </section>
</Column>

<style lang="scss">
    .note {
        line-height: 1.5;
    }
    code {
        font-family: FiraCode;
        color: var(--accent);
    }
    .group {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        width: 100%;
    }
    .group-title {
        font-size: 1.5rem;
    }
    .row {
        display: flex;
        gap: 0.5rem;
        align-items: baseline;
        line-height: 1.5;
    }
    .sub-description {
        min-width: 0;
    }
    .tag {
        font-family: FiraCode;
        font-size: 0.8rem;
        padding: 0.1rem 0.4rem;
        border-radius: 0.3rem;
        background-color: var(--tertiary);
        color: var(--tertiary-text);
        flex-shrink: 0;
        min-width: 2.2rem;
        text-align: center;
    }
    .wide {
        min-width: 6.5rem;
    }
    .rules {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        padding-left: 1.2rem;
        line-height: 1.5;
        list-style: disc;
    }
</style>
