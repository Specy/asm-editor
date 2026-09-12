<script lang="ts">
    import Card from '$cmp/shared/layout/Card.svelte'
    import Column from '$cmp/shared/layout/Column.svelte'
    import MarkdownRenderer from '$cmp/shared/markdown/MarkdownRenderer.svelte'
    import {
        X86_CONDITION_CODES,
        X86_FLAGS,
        X86_REGISTERS
    } from '$lib/languages/X86/X86-documentation'

    interface Props {
        disableLinks?: boolean
    }

    let { disableLinks = false }: Props = $props()
</script>

<Column gap="1rem" style="width: 100%;">
    <h2 class="section-title" id="registers">Registers</h2>
    <p class="note">
        Sixteen 64 bit general purpose registers. Each one can be used at four widths: <code
            >rax</code
        >
        is the whole register, <code>eax</code> its low 32 bits, <code>ax</code> its low 16 and
        <code>al</code>
        its low 8. Writing a 32 bit name clears the top half of the 64 bit register; writing a 16 or 8
        bit name leaves the rest alone.
    </p>
    {#each X86_REGISTERS as register (register.name)}
        <Card gap="0.6rem" padding="1rem" background="secondary" style="width: 100%;">
            <h3 class="sub-title">
                {register.name}
                {#each register.parts as part (part)}
                    <span class="part">{part}</span>
                {/each}
            </h3>
            <span class="sub-description">
                <MarkdownRenderer source={register.description} {disableLinks} />
            </span>
        </Card>
    {/each}

    <h2 class="section-title" id="flags">Flags</h2>
    <p class="note">
        The flags live in <code>rflags</code>. Arithmetic and logic instructions write them,
        <code>cmp</code>
        and <code>test</code> exist to write them without keeping a result, and the conditional instructions
        read them.
    </p>
    {#each X86_FLAGS as flag (flag.name)}
        <Card gap="0.6rem" padding="1rem" background="secondary" style="width: 100%;">
            <h3 class="sub-title">
                {flag.name}
                <span class="part">bit {flag.bit}</span>
            </h3>
            <span class="sub-description">
                <MarkdownRenderer source={flag.description} {disableLinks} />
            </span>
        </Card>
    {/each}

    <h2 class="section-title" id="condition-codes">Condition codes</h2>
    <p class="note">
        The same sixteen conditions end <code>jcc</code>, <code>setcc</code> and
        <code>cmovcc</code>: <code>jne</code> jumps, <code>setne</code> writes 1 or 0 to a byte, and
        <code>cmovne</code>
        copies a register, all on the same test. The unsigned conditions read the carry flag and the signed
        ones read the sign and overflow flags, which is why comparing two numbers the wrong way round
        silently gives the wrong answer.
    </p>
    <div class="table-scroll">
        <table>
            <thead>
                <tr>
                    <th>Condition</th>
                    <th>Also written</th>
                    <th>Meaning</th>
                    <th>Test</th>
                </tr>
            </thead>
            <tbody>
                {#each X86_CONDITION_CODES as condition (condition.code)}
                    <tr>
                        <td class="mono">{condition.code}</td>
                        <td class="mono">{condition.aliases.join(', ')}</td>
                        <td>{condition.meaning}</td>
                        <td class="mono">{condition.test}</td>
                    </tr>
                {/each}
            </tbody>
        </table>
    </div>
</Column>

<style lang="scss">
    @use '../m68k/style.scss' as *;
    .note {
        line-height: 1.5;
    }
    code {
        font-family: FiraCode;
        color: var(--accent);
    }
    .part {
        font-size: 0.8rem;
        font-family: FiraCode;
        margin-left: 0.4rem;
        padding: 0 0.35rem;
        border-radius: 0.3rem;
        background-color: var(--tertiary);
        color: var(--tertiary-text);
    }
    .table-scroll {
        width: 100%;
        overflow-x: auto;
    }
    table {
        border-collapse: collapse;
        width: 100%;
        border: solid 0.1rem var(--tertiary);
        border-radius: 0.5rem;
        overflow: hidden;
        font-size: 0.9rem;
    }
    thead {
        background-color: var(--tertiary);
        color: var(--tertiary-text);
        text-align: left;
    }
    th {
        padding: 0.5rem;
    }
    td {
        padding: 0.4rem 0.5rem;
        border-top: 0.1rem solid var(--tertiary);
    }
    tbody {
        background-color: var(--secondary);
        color: var(--secondary-text);
    }
    .mono {
        font-family: FiraCode;
        white-space: nowrap;
    }
</style>
