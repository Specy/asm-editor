<script lang="ts">
    import {
        X86_FLAG_MEANINGS,
        formatX86Cpu,
        type X86Instruction
    } from '$lib/languages/X86/X86-documentation'

    interface Props {
        instruction: X86Instruction
        /** The panel shows the first few forms; the instruction page shows all of them. */
        limit?: number
    }

    let { instruction, limit }: Props = $props()

    let forms = $derived(limit ? instruction.forms.slice(0, limit) : instruction.forms)
    let hidden = $derived(instruction.forms.length - forms.length)
</script>

<div class="table-scroll">
    <table>
        <thead>
            <tr>
                <th>Form</th>
                <th>Since</th>
                <th>Notes</th>
            </tr>
        </thead>
        <tbody>
            {#each forms as form, index (`${form.operands.join(',')}-${index}`)}
                <tr>
                    <td class="mono">
                        {instruction.name}
                        {form.operands.join(', ')}
                    </td>
                    <td class="mono since">{formatX86Cpu(form.cpu)}</td>
                    <td>
                        {#each [...form.features, ...form.notes] as flag (flag)}
                            <span class="badge" title={X86_FLAG_MEANINGS[flag] ?? flag}>
                                {flag.toLowerCase()}
                            </span>
                        {/each}
                    </td>
                </tr>
            {/each}
        </tbody>
    </table>
</div>
{#if hidden > 0}
    <p class="more">and {hidden} more {hidden === 1 ? 'form' : 'forms'}</p>
{/if}

<style lang="scss">
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
        vertical-align: top;
    }
    tbody {
        background-color: var(--secondary);
        color: var(--secondary-text);
    }
    tbody tr:nth-child(odd) {
        background-color: color-mix(in srgb, var(--secondary), var(--tertiary) 20%);
    }
    .mono {
        font-family: FiraCode;
        white-space: nowrap;
    }
    .since {
        color: var(--background-text-muted);
    }
    .badge {
        display: inline-block;
        margin-right: 0.3rem;
        padding: 0 0.35rem;
        border-radius: 0.3rem;
        font-size: 0.7rem;
        font-family: Rubik;
        background-color: var(--accent2);
        color: var(--accent2-text);
        white-space: nowrap;
    }
    .more {
        font-size: 0.9rem;
        color: var(--background-text-muted);
    }
</style>
