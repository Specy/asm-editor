<script lang="ts">
    import MutationStep from './MutationStep.svelte'
    import type { ExecutionStep } from '#lib/languages/commonLanguageFeatures.svelte.ts'
    import type { AvailableLanguages } from '#lib/Project.svelte.ts'
    interface Props {
        steps: ExecutionStep[]
        statusRegisterNames: string[]
        /** The Target, which names the widths a written mutation reports. */
        language: AvailableLanguages
        /** The processor the program is written for, which says why its cycles are an estimate. */
        processor?: string
        /**
         * Fill a section on its surface, with contrasting entries and height left to the section.
         */
        docked?: boolean
        /** "Undo to here" was pressed on row `index`: the `index` Undos of the rows above it. */
        onUndo?: (index: number) => void
        /** "Go to line" was pressed on a row. */
        onHighlight?: (step: ExecutionStep) => void
    }

    let {
        steps,
        statusRegisterNames,
        language,
        processor,
        docked = false,
        onUndo,
        onHighlight
    }: Props = $props()

    /**
     * "Undo to here" takes the program back to just after a row ran: on row i, the i Undos of the
     * rows above it. Why it cannot on a row, or undefined when it can: the newest row is where the
     * program already is, and Undo stops at a row above whose effects are not recorded.
     */
    function undoBlocked(i: number): string | undefined {
        if (i === 0) return 'The program is already here'
        if (steps.slice(0, i).some((row) => row.undoable === false))
            return 'Undo stops before effects that are not recorded'
    }
</script>

<div class="column tab" class:docked>
    {#if steps.length === 0}
        <div class="row" style="justify-content: center; padding: {docked ? '0.3rem' : '0.4rem'}">
            No mutations
        </div>
    {/if}
    {#each steps as step, i (i)}
        <MutationStep
            {docked}
            {language}
            {processor}
            flags={statusRegisterNames}
            {step}
            undoBlocked={undoBlocked(i)}
            onUndo={() => onUndo?.(i)}
            {onHighlight}
        />
    {/each}
</div>

<style lang="scss">
    .tab {
        background-color: var(--primary);
        color: var(--primary-text);
        padding: 0.4rem;
        border-radius: 0.7rem;
        box-shadow: 0 3px 10px rgb(0 0 0 / 0.2);
        border-top-left-radius: 0;
        border-top-right-radius: 0;
        gap: 0.4rem;
        max-height: 30rem;
        width: 12rem;
        overflow-y: auto;
    }
    .tab.docked {
        padding: 0.3rem;
        gap: 0.3rem;
        width: auto;
        max-height: none;
        border-radius: 0;
        background-color: var(--wb-surface, var(--secondary));
        color: var(--secondary-text);
        box-shadow: none;
    }
</style>
