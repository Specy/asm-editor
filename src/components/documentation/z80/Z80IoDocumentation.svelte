<script lang="ts">
    import Card from '$cmp/shared/layout/Card.svelte'
    import Column from '$cmp/shared/layout/Column.svelte'
    import MarkdownRenderer from '$cmp/shared/markdown/MarkdownRenderer.svelte'
    import { Z80_PORT_DOCS } from '$lib/languages/Z80/Z80-documentation'

    interface Props {
        disableLinks?: boolean
    }

    let { disableLinks = false }: Props = $props()

    function toHex(port: number): string {
        return `0x${port.toString(16).padStart(2, '0')}`
    }
</script>

<Column gap="1rem" style="width: 100%;">
    <p class="note">
        A Z80 has no system calls. Programs reach the outside world with <code>in</code> and
        <code>out</code>, which address one of 256 ports:
        <code>out (n), a</code>
        sends A to port <code>n</code>, <code>in a, (n)</code> reads a byte back. The
        <code>(c)</code>
        forms (<code>out (c), r</code> and <code>in r, (c)</code>) take the port number from C,
        which lets a program compute it.
    </p>
    <p class="note">
        The emulator connects the five ports below to the console. Every other port behaves like an
        empty bus: writes are dropped and reads answer <code>0xFF</code>. Reading a connected port
        with nothing to read pauses the program until a line has been typed, so
        <code>in</code> never fails, it only waits.
    </p>
    {#each Z80_PORT_DOCS as port (port.name)}
        <Card gap="0.8rem" padding="1rem" background="secondary" style="width: 100%;">
            <h3 class="sub-title" id={port.name.toLowerCase()}>
                {toHex(port.port)}
                <span class="port-name">{port.title}</span>
            </h3>
            <!-- The descriptions are markdown (they name `out (c),r` and the `0x` prefix in code
                 spans) and are shown as markdown here and in the coding agent's prompt alike. -->
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
            <!-- Fenced as `asm` because shiki has no Z80 grammar; the tokens are close enough. -->
            <MarkdownRenderer
                source={`\`\`\`asm\n${port.example}\n\`\`\``}
                {disableLinks}
                simpleCode
            />
            <div class="direction">
                <span class="tag">prints</span>
                <span class="output">{port.exampleOutput}</span>
            </div>
        </Card>
    {/each}
</Column>

<style lang="scss">
    .note {
        line-height: 1.5;
    }
    code {
        font-family: FiraCode;
        color: var(--accent);
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
    .direction {
        display: flex;
        gap: 0.5rem;
        align-items: baseline;
        line-height: 1.5;
    }
    .tag {
        font-family: FiraCode;
        font-size: 0.8rem;
        padding: 0.1rem 0.4rem;
        border-radius: 0.3rem;
        background-color: var(--tertiary);
        color: var(--tertiary-text);
        flex-shrink: 0;
    }
    .output {
        font-family: FiraCode;
        white-space: pre-wrap;
    }
</style>
