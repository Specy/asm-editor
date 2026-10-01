<script lang="ts">
    /**
     * The registers of a Testcase as one table: a row per register with the value it starts with,
     * the value expected at the end and, once a test run has checked it, the value it ended with.
     * A row can be added before it holds either value, and keeps its place when both are cleared,
     * until its × removes it. A register the Core cannot set before the run (MIPS's `pc`, `hi` and
     * `lo`) can only be expected.
     */
    import type { AvailableLanguages, Testcase, TestcaseResult } from '$lib/Project.svelte'
    import { canonicalRegister, formatHex, hexPrefix, sortRegisters } from '$lib/testcases'
    import NumberCell from './NumberCell.svelte'
    import WhenLabel from './WhenLabel.svelte'
    import FaTimes from '~icons/fa-solid/times'
    import FaCaretDown from '~icons/fa-solid/caret-down'

    type Side = 'startingRegisters' | 'expectedRegisters'

    interface Props {
        testcase: Testcase
        result: TestcaseResult | undefined
        editable: boolean
        registerNames: string[]
        startingRegisterNames: string[]
        hiddenRegistersNames: string[]
        registerSizes: Record<string, number> | undefined
        systemSize: number
        language: AvailableLanguages
    }

    let {
        testcase = $bindable(),
        result,
        editable,
        registerNames,
        startingRegisterNames,
        hiddenRegistersNames,
        registerSizes,
        systemSize,
        language
    }: Props = $props()

    const prefix = $derived(hexPrefix(language))
    //the register, its two values, what the last run found once there is one, and its ×
    const columns = $derived(3 + (result ? 1 : 0) + (editable ? 1 : 0))
    /** Rows added or emptied here, which hold no value, kept until they are removed. */
    let pending = $state<string[]>([])

    function same(a: string, b: string) {
        return a.toUpperCase() === b.toUpperCase()
    }

    /** The key a register has in a record, spelled however the Testcase spelled it. */
    function keyIn(record: Record<string, bigint>, name: string) {
        return Object.keys(record).find((key) => same(key, name))
    }

    function valueIn(record: Record<string, bigint>, name: string) {
        const key = keyIn(record, name)
        return key === undefined ? undefined : record[key]
    }

    const rows = $derived.by(() => {
        const names: string[] = []
        for (const name of [
            ...Object.keys(testcase.startingRegisters),
            ...Object.keys(testcase.expectedRegisters),
            ...pending
        ]) {
            const canonical = canonicalRegister(name, registerNames)
            if (!names.some((known) => same(known, canonical))) names.push(canonical)
        }
        return sortRegisters(names, registerNames).map((name) => ({
            name,
            start: valueIn(testcase.startingRegisters, name),
            expected: valueIn(testcase.expectedRegisters, name)
        }))
    })

    const offered = $derived(registerNames.filter((name) => !hiddenRegistersNames.includes(name)))
    const free = $derived(offered.filter((name) => !rows.some((row) => same(row.name, name))))

    function widthOf(name: string) {
        return registerSizes?.[name] ?? systemSize
    }

    function seedable(name: string) {
        return startingRegisterNames.some((candidate) => same(candidate, name))
    }

    function setValue(side: Side, name: string, value: bigint | undefined) {
        const record = testcase[side]
        const key = keyIn(record, name)
        if (key !== undefined) delete record[key]
        if (value !== undefined) record[name] = value
        else if (!pending.some((row) => same(row, name))) pending.push(name)
    }

    function rename(from: string, to: string) {
        for (const side of ['startingRegisters', 'expectedRegisters'] as const) {
            const record = testcase[side]
            const key = keyIn(record, from)
            if (key === undefined) continue
            const value = record[key]
            delete record[key]
            //a register the Core cannot set before the run keeps only its expectation
            if (side === 'expectedRegisters' || seedable(to)) record[to] = value
        }
        //kept as a row of its own, in case the values it had did not come along
        pending = [...pending.filter((name) => !same(name, from)), to]
    }

    function remove(name: string) {
        for (const side of ['startingRegisters', 'expectedRegisters'] as const) {
            const record = testcase[side]
            const key = keyIn(record, name)
            if (key !== undefined) delete record[key]
        }
        pending = pending.filter((row) => !same(row, name))
    }

    /** What the register ended with, known only for an expected one once a run has checked it. */
    function actualOf(name: string, expected: bigint | undefined) {
        if (!result || expected === undefined) return undefined
        const error = result.errors.find(
            (candidate) => candidate.type === 'wrong-register' && same(candidate.register, name)
        )
        if (error?.type === 'wrong-register') return { value: error.got, matches: false }
        return { value: expected, matches: true }
    }

    function show(value: bigint | undefined, name: string) {
        return value === undefined
            ? '—'
            : formatHex(value, { prefix, bytes: widthOf(name), minDigits: 4 })
    }
</script>

<div class="frame">
    <table class="registers">
        <colgroup>
            <col class="name-column" />
            <col />
            <col />
            {#if result}
                <col />
            {/if}
            {#if editable}
                <col class="remove-column" />
            {/if}
        </colgroup>
        <thead>
            <tr>
                <th>Name</th>
                <th><WhenLabel when="start" /></th>
                <th><WhenLabel when="expect" label="Expected" /></th>
                {#if result}
                    <th>Actual</th>
                {/if}
                {#if editable}
                    <th><span class="visually-hidden">Remove</span></th>
                {/if}
            </tr>
        </thead>
        <tbody>
            {#each rows as row (row.name)}
                {@const actual = actualOf(row.name, row.expected)}
                <tr>
                    <th scope="row" class="name">
                        {#if editable}
                            <select
                                value={row.name}
                                aria-label="Register"
                                title="Pick another register"
                                onchange={(e) => rename(row.name, e.currentTarget.value)}
                            >
                                {#each [row.name, ...free] as option (option)}
                                    <option value={option}>{option}</option>
                                {/each}
                            </select>
                            <span class="caret" aria-hidden="true"><FaCaretDown /></span>
                        {:else}
                            {row.name}
                        {/if}
                    </th>
                    <td>
                        {#if editable}
                            <NumberCell
                                value={row.start}
                                bytes={widthOf(row.name)}
                                {prefix}
                                label="{row.name} at the start"
                                disabled={!seedable(row.name)}
                                disabledTitle="{row.name} cannot be set before the run, only expected"
                                onCommit={(value) => setValue('startingRegisters', row.name, value)}
                            />
                        {:else}
                            <span class="value" class:empty={row.start === undefined}>
                                {show(row.start, row.name)}
                            </span>
                        {/if}
                    </td>
                    <td>
                        {#if editable}
                            <NumberCell
                                value={row.expected}
                                bytes={widthOf(row.name)}
                                {prefix}
                                label="{row.name} expected at the end"
                                onCommit={(value) => setValue('expectedRegisters', row.name, value)}
                            />
                        {:else}
                            <span class="value" class:empty={row.expected === undefined}>
                                {show(row.expected, row.name)}
                            </span>
                        {/if}
                    </td>
                    {#if result}
                        <td
                            class="actual"
                            class:mismatch={actual && !actual.matches}
                            class:match={actual?.matches}
                            title={actual === undefined
                                ? 'Not checked: no value is expected'
                                : actual.matches
                                  ? 'As expected'
                                  : 'Not the expected value'}
                        >
                            <span class="value" class:empty={actual === undefined}>
                                {show(actual?.value, row.name)}
                            </span>
                        </td>
                    {/if}
                    {#if editable}
                        <td class="remove">
                            <button
                                aria-label="Remove {row.name}"
                                title="Remove {row.name}"
                                onclick={() => remove(row.name)}
                            >
                                <FaTimes />
                            </button>
                        </td>
                    {/if}
                </tr>
            {/each}
            {#if editable && free.length > 0}
                <tr>
                    <td colspan={columns} class="add-cell">
                        <button class="add-row" onclick={() => (pending = [...pending, free[0]])}>
                            + Add register
                        </button>
                    </td>
                </tr>
            {/if}
        </tbody>
    </table>
</div>

<style lang="scss">
    @use './testcases.scss' as *;

    .frame {
        @include frame;
    }

    .registers {
        width: 100%;
        table-layout: fixed;
        border-collapse: separate;
        border-spacing: 0;
        font-size: 0.85rem;
    }

    .name-column {
        width: 3.9rem;
    }

    .remove-column {
        width: 1.8rem;
    }

    th,
    td {
        padding: 0;
        border-top: 1px solid var(--tc-line);
        vertical-align: middle;
        overflow: hidden;
    }

    thead th {
        @include head;
        border-top: none;
        padding: 0.4rem 0.55rem;
        white-space: nowrap;

        &:not(:first-child) {
            border-left: 1px solid var(--tc-line);
        }
    }

    tbody td {
        border-left: 1px solid var(--tc-line);
    }

    .name {
        @include mono;
        position: relative;
        padding: 0 0.7rem;
        font-weight: 600;
        text-align: left;
        white-space: nowrap;
        text-overflow: ellipsis;

        select {
            @include mono;
            width: 100%;
            padding: 0.45rem 0.8rem 0.45rem 0;
            appearance: none;
            font-weight: 600;
            font-size: 0.85rem;
            background-color: transparent;
            color: var(--secondary-text);
            cursor: pointer;

            option {
                background-color: var(--secondary);
                font-weight: 400;
            }
        }
    }

    .caret {
        position: absolute;
        top: 50%;
        right: 0.45rem;
        display: flex;
        width: 0.45rem;
        transform: translateY(-50%);
        color: var(--hint);
        opacity: 0.5;
        pointer-events: none;
    }

    .name:hover .caret {
        opacity: 1;
    }

    .value {
        @include mono;
        display: block;
        padding: 0.45rem 0.7rem;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;

        &.empty {
            color: var(--hint);
            opacity: 0.6;
        }
    }

    .actual {
        &.match .value {
            color: var(--tc-pass);
        }

        &.mismatch {
            background-color: var(--tc-fail-bg);

            .value {
                color: var(--tc-fail);
            }
        }
    }

    .remove button {
        display: grid;
        place-items: center;
        width: 100%;
        height: 2.1rem;
        padding: 0 0.6rem;
        color: var(--hint);
        background-color: transparent;
        cursor: pointer;
        opacity: 0.6;
        transition:
            color 0.15s,
            opacity 0.15s;

        :global(svg) {
            width: 0.55rem;
        }

        &:hover,
        &:focus-visible {
            color: var(--tc-fail);
            opacity: 1;
        }
    }

    .add-cell {
        border-left: none;
    }

    .add-row {
        @include add-row;
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
