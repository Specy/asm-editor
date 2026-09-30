import type { MemoryTab } from '$lib/languages/commonLanguageFeatures.svelte'

/**
 * The **Debug tools** ([CONTEXT.md](../../../../CONTEXT.md)): the Stack pointer, the History and
 * the Call stack, in the brief's order. The Stack pointer is one memory tab of the Emulator's (there
 * is one today, following the stack pointer), so there is one tool per tab.
 */
export type DebugTool =
    | { id: string; title: string; kind: 'memory'; tab: MemoryTab }
    | { id: 'history'; title: string; kind: 'history' }
    | { id: 'callstack'; title: string; kind: 'callstack' }

/**
 * How a Debug tool's section shares the debug column's row with the others: the three split it
 * evenly, the Stack pointer never narrower than its memory grid and the History and Call stack
 * down to 10rem, so that all three fit in one row at the width the column takes for the registers
 * and memory, and only wrap when the column is dragged narrower.
 */
export function toolSectionStyle(tool: DebugTool): string {
    return tool.kind === 'memory'
        ? 'flex: 1 1 0; min-width: min-content;'
        : 'flex: 1 1 0; min-width: 10rem;'
}

export function debugTools(memoryTabs: readonly MemoryTab[]): DebugTool[] {
    return [
        ...memoryTabs.map((tab) => ({
            id: `memory-${tab.id}`,
            title: 'Stack pointer',
            kind: 'memory' as const,
            tab
        })),
        { id: 'history', title: 'History', kind: 'history' },
        { id: 'callstack', title: 'Call stack', kind: 'callstack' }
    ]
}
