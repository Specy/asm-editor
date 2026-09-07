<script lang="ts">
    import Card from '$cmp/shared/layout/Card.svelte'
    import Column from '$cmp/shared/layout/Column.svelte'
    import MarkdownRenderer from '$cmp/shared/markdown/MarkdownRenderer.svelte'
    import {
        Z80_FLAGS,
        z80ConditionCodes,
        z80Operands,
        z80Registers
    } from '$lib/languages/Z80/Z80-documentation'

    interface Props {
        disableLinks?: boolean
    }

    let { disableLinks = false }: Props = $props()
</script>

<Column gap="1rem" style="width: 100%;">
    <h2 class="section-title" id="registers">Registers</h2>
    {#each z80Registers as register (register.name)}
        <Card gap="0.6rem" padding="1rem" background="secondary" style="width: 100%;">
            <h3 class="sub-title">
                {register.name}
                <span class="bits">{register.bits} bit</span>
                {#if register.undocumented}
                    <span
                        class="badge"
                        title="Not in Zilog's manual, but implemented by the hardware and by this emulator"
                    >
                        undocumented
                    </span>
                {/if}
            </h3>
            <span class="sub-description">
                <MarkdownRenderer source={register.description} {disableLinks} />
            </span>
        </Card>
    {/each}

    <h2 class="section-title" id="flags">Flags</h2>
    <p class="note">
        The flags live in the F register, which is only reachable as the high half of <code>af</code
        >. Every arithmetic and logic instruction updates some of them; the instruction pages list
        which.
    </p>
    {#each Z80_FLAGS as flag (flag.name)}
        <Card gap="0.6rem" padding="1rem" background="secondary" style="width: 100%;">
            <h3 class="sub-title">
                {flag.name}
                <span class="bits">bit {flag.bit}</span>
            </h3>
            <span class="sub-description">
                <MarkdownRenderer source={flag.description} {disableLinks} />
            </span>
        </Card>
    {/each}

    <h2 class="section-title" id="condition-codes">Condition codes</h2>
    <p class="note">
        Written after <code>jp</code>, <code>call</code> and <code>ret</code> to run them only when
        the flags say so, as in <code>jp nz, loop</code>. <code>jr</code> understands only the first four.
    </p>
    <Column gap="0.5rem">
        {#each z80ConditionCodes as condition (condition.name)}
            <div class="legend-row">
                <div class="legend-name">{condition.name}</div>
                <div class="legend-content sub-description">
                    <MarkdownRenderer source={condition.description} {disableLinks} />
                </div>
            </div>
        {/each}
    </Column>

    <h2 class="section-title" id="operands">Operand placeholders</h2>
    <p class="note">
        The instruction tables write operands with these placeholders: <code>ld (ix+dd), nn</code>
        is written in a program as <code>ld (ix+2), 42</code>.
    </p>
    <Column gap="0.5rem">
        {#each z80Operands as operand (operand.name)}
            <div class="legend-row">
                <div class="legend-name">{operand.name}</div>
                <div class="legend-content sub-description">
                    <MarkdownRenderer source={operand.description} {disableLinks} />
                </div>
            </div>
        {/each}
    </Column>
</Column>

<style lang="scss">
    .section-title {
        margin-top: 1rem;
    }
    .sub-title {
        font-family: FiraCode;
        font-size: 1.2rem;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex-wrap: wrap;
    }
    .bits {
        font-family: Rubik;
        font-size: 0.8rem;
        opacity: 0.7;
    }
    .note {
        line-height: 1.5;
        color: var(--background-text-muted);
    }
    code {
        font-family: FiraCode;
        color: var(--accent);
    }
    .legend-row {
        display: flex;
        align-items: stretch;
        gap: 0.4rem;
        padding: 0.2rem;
        border-radius: 0.4rem;
        background-color: var(--secondary);
        color: var(--secondary-text);
    }
    .legend-name {
        display: flex;
        align-items: center;
        padding: 0 0.6rem;
        font-family: FiraCode;
        min-width: 5rem;
    }
    .legend-content {
        flex: 1;
        padding: 0.3rem 0.5rem;
        background-color: var(--tertiary);
        color: var(--tertiary-text);
        border-radius: 0.3rem;
    }
    .badge {
        padding: 0 0.35rem;
        border-radius: 0.3rem;
        font-size: 0.7rem;
        font-family: Rubik;
        background-color: var(--accent2);
        color: var(--accent2-text);
    }
</style>
