<script lang="ts">
    import Card from '$cmp/shared/layout/Card.svelte'
    import Column from '$cmp/shared/layout/Column.svelte'
    import MarkdownRenderer from '$cmp/shared/markdown/MarkdownRenderer.svelte'
    import {
        Z80_COLORS,
        Z80_MOUSE_VIEWS,
        Z80_PORT_DOCS,
        Z80_PORT_GROUP_DOCS,
        Z80_SCREEN_COMMAND_DOCS,
        type Z80PortGroup
    } from '$lib/languages/Z80/Z80-documentation'
    import { TRS80_KEY_ROW_DOCS, TRS80_MEMORY_DOCS } from '$lib/languages/Z80/trs80/trs80Display'

    interface Props {
        disableLinks?: boolean
    }

    let { disableLinks = false }: Props = $props()

    function toHex(port: number): string {
        return `0x${port.toString(16).padStart(2, '0').toUpperCase()}`
    }

    function portsOf(group: Z80PortGroup) {
        return Z80_PORT_DOCS.filter((port) => port.group === group)
    }

    // The 3-3-2 byte a program writes is expanded by repeating each field, which is what the
    // emulator does, so the swatch shows the color the program will actually get.
    function swatch(color: number): string {
        const red = (color >> 5) & 0x07
        const green = (color >> 2) & 0x07
        const blue = color & 0x03
        const stretch = (value: number) => ((value << 5) | (value << 2) | (value >> 1)) & 0xff
        return `rgb(${stretch(red)}, ${stretch(green)}, ${blue * 0x55})`
    }

    const colors = Object.entries(Z80_COLORS)
    const views = Object.entries(Z80_MOUSE_VIEWS)
</script>

<Column gap="1rem" style="width: 100%;">
    <p class="note">
        A Z80 has no system calls. Programs reach the outside world with <code>in</code> and
        <code>out</code>, which address one of 256 ports:
        <code>out (n), a</code>
        sends A to port <code>n</code>, <code>in a, (n)</code> reads a byte back. The
        <code>(c)</code>
        forms (<code>out (c), r</code> and <code>in r, (c)</code>) take the port number from C,
        which lets a program compute it, and put B on the high byte of the address bus, which is how
        a read carries a parameter: the key code, the mouse view, the byte of the clock, the length
        of a wait.
    </p>
    <p class="note">
        The emulator connects the ports below to the terminal, the screen, the keyboard, the mouse
        and the clock. Every other port behaves like an empty bus: writes are dropped and reads
        answer <code>0xFF</code>. Reading a connected port with nothing to read pauses the program
        until there is something, so <code>in</code> never fails, it only waits.
    </p>

    {#each Z80_PORT_GROUP_DOCS as group (group.group)}
        <section class="group">
            <h2 class="group-title" id={group.group}>
                {group.title}
                <span class="group-range">{group.range}</span>
            </h2>
            <p class="note">
                <MarkdownRenderer source={group.description} {disableLinks} simpleCode />
            </p>

            {#if group.group === 'screen'}
                <Card gap="0.8rem" padding="1rem" background="secondary" style="width: 100%;">
                    <h3 class="sub-title">Commands</h3>
                    <p class="note">
                        Written to the command port, <code>0x27</code>. One write runs one operation
                        on the coordinates and colors already set.
                    </p>
                    <div class="rows">
                        {#each Z80_SCREEN_COMMAND_DOCS as command (command.name)}
                            <div class="row">
                                <span class="tag">{command.command}</span>
                                <span class="sub-description">
                                    <MarkdownRenderer
                                        source={command.description}
                                        {disableLinks}
                                        simpleCode
                                    />
                                </span>
                            </div>
                        {/each}
                    </div>
                </Card>
                <Card gap="0.8rem" padding="1rem" background="secondary" style="width: 100%;">
                    <h3 class="sub-title">The TRS-80 display</h3>
                    <p class="note">
                        Command <code>14</code> switches the screen to the memory-mapped display of
                        the TRS-80, the machine this Z80 emulator descends from — the one graphics
                        interface here that programs written elsewhere already target. A program can
                        also ask for it before it starts, with a
                        <code>; @screen trs80</code> comment, which is what a program brought in
                        from outside needs. The drawing commands above are not available in this
                        mode, and console output goes only to the terminal: on this machine,
                        printing
                        <em>is</em> storing a byte.
                    </p>
                    <div class="rows">
                        {#each TRS80_MEMORY_DOCS as row (row.range)}
                            <div class="row">
                                <span class="tag">{row.range}</span>
                                <span class="sub-description">
                                    <strong>{row.title}</strong>
                                    <MarkdownRenderer
                                        source={row.description}
                                        {disableLinks}
                                        simpleCode
                                    />
                                </span>
                            </div>
                        {/each}
                    </div>
                    <p class="note">
                        Port <code>0x00</code> is the machine's joystick, and the reason the ports
                        above start at <code>0x10</code>: nothing of this editor's is mapped there,
                        so a program's joystick poll reads an empty bus floating high —
                        <code>0xFF</code>, exactly what the machine answers with none attached.
                        While the character port lived at <code>0x00</code> that poll stopped the
                        program to wait for a line nobody was typing. Everything else the machine
                        decodes is at <code>0x75</code> or above, clear of this map entirely.
                    </p>
                    <p class="note">
                        Characters <code>0x20</code> to <code>0x7F</code> are text. Characters
                        <code>128</code>
                        to <code>191</code> are 2 by 3 blocks of chunky pixels — the low six bits
                        are the blocks, bit 0 top-left then across and down — so the screen is also
                        a 128 by 48 pixel grid. <code>191</code> is solid and <code>128</code> is blank.
                    </p>
                    <div class="rows">
                        {#each TRS80_KEY_ROW_DOCS as keys, row (row)}
                            <div class="row">
                                <span class="tag">row {row}</span>
                                <span class="sub-description">{keys}</span>
                            </div>
                        {/each}
                    </div>
                </Card>
                <Card gap="0.8rem" padding="1rem" background="secondary" style="width: 100%;">
                    <h3 class="sub-title">Colors</h3>
                    <p class="note">
                        A color is one byte: three bits of red in bits 7-5, three of green in bits
                        4-2 and two of blue in bits 1-0. Each field is stretched over the screen's
                        eight bits by repeating it, so <code>0xFF</code> is white and
                        <code>0xE0</code> pure red.
                    </p>
                    <div class="colors">
                        {#each colors as [name, color] (name)}
                            <div class="color">
                                <span class="chip" style:background-color={swatch(color)}></span>
                                <code>{toHex(color)}</code>
                                <span class="color-name"
                                    >{name.toLowerCase().replace('_', ' ')}</span
                                >
                            </div>
                        {/each}
                    </div>
                </Card>
            {/if}

            {#if group.group === 'mouse'}
                <Card gap="0.8rem" padding="1rem" background="secondary" style="width: 100%;">
                    <h3 class="sub-title">Views</h3>
                    <p class="note">Put one of these in B before reading a mouse port.</p>
                    <div class="rows">
                        {#each views as [name, view] (name)}
                            <div class="row">
                                <span class="tag">{view}</span>
                                <span class="sub-description">
                                    {name === 'CURRENT'
                                        ? 'the pointer and the buttons right now'
                                        : name === 'LAST_UP'
                                          ? 'the state at the last button release'
                                          : 'the state at the last button press, with the double-click flag'}
                                </span>
                            </div>
                        {/each}
                    </div>
                </Card>
            {/if}

            {#each portsOf(group.group) as port (port.name)}
                <Card gap="0.8rem" padding="1rem" background="secondary" style="width: 100%;">
                    <h3 class="sub-title" id={port.name.toLowerCase()}>
                        {toHex(port.port)}
                        <span class="port-name">{port.title}</span>
                    </h3>
                    <!-- The descriptions are markdown (they name `out (c),r` and the `0x` prefix in
                         code spans) and are shown as markdown here and in the coding agent's prompt
                         alike. -->
                    <div class="direction">
                        <span class="tag">out</span>
                        <span class="sub-description">
                            <MarkdownRenderer source={port.write} {disableLinks} simpleCode />
                        </span>
                    </div>
                    <div class="direction">
                        <span class="tag">in</span>
                        <span class="sub-description">
                            <MarkdownRenderer source={port.read} {disableLinks} simpleCode />
                        </span>
                    </div>
                    {#if port.example}
                        <!-- Fenced as `asm` because shiki has no Z80 grammar; the tokens are close
                             enough. -->
                        <MarkdownRenderer
                            source={`\`\`\`asm\n${port.example}\n\`\`\``}
                            {disableLinks}
                            simpleCode
                        />
                        {#if port.exampleInput}
                            <div class="direction">
                                <span class="tag">input</span>
                                <span class="output">{port.exampleInput.join('\n')}</span>
                            </div>
                        {/if}
                        {#if port.exampleOutput !== undefined}
                            <div class="direction">
                                <span class="tag">prints</span>
                                <span class="output">{port.exampleOutput}</span>
                            </div>
                        {/if}
                        {#if port.exampleShows}
                            <div class="direction">
                                <span class="tag">shows</span>
                                <span class="sub-description">{port.exampleShows}</span>
                            </div>
                        {/if}
                    {/if}
                </Card>
            {/each}
        </section>
    {/each}
</Column>

<style lang="scss">
    .note {
        line-height: 1.5;
        color: var(--background-text-muted);
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
        display: flex;
        align-items: baseline;
        gap: 0.6rem;
        flex-wrap: wrap;
    }
    .group-range {
        font-family: FiraCode;
        font-size: 0.9rem;
        opacity: 0.7;
    }
    .sub-title {
        font-family: FiraCode;
        font-size: 1.2rem;
        display: flex;
        align-items: center;
        gap: 0.6rem;
        flex-wrap: wrap;
    }
    .port-name {
        font-family: Rubik;
        font-size: 0.9rem;
        opacity: 0.8;
    }
    .direction,
    .row {
        display: flex;
        gap: 0.5rem;
        align-items: baseline;
        line-height: 1.5;
    }
    .rows {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
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
    .output {
        font-family: FiraCode;
        white-space: pre-wrap;
    }
    .colors {
        display: flex;
        flex-wrap: wrap;
        gap: 0.6rem 1.2rem;
    }
    .color {
        display: flex;
        align-items: center;
        gap: 0.4rem;
    }
    .chip {
        width: 1rem;
        height: 1rem;
        border-radius: 0.2rem;
        border: 1px solid var(--tertiary);
    }
    .color-name {
        font-size: 0.9rem;
        opacity: 0.8;
    }
</style>
