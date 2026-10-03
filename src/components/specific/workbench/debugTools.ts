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
 * evenly, with minimum widths of 15rem for the Stack pointer, 12rem for History and 10rem for the
 * Call stack. They wrap when the column is dragged too narrow to fit all three.
 */
export function toolSectionStyle(tool: DebugTool): string {
    const minWidth = tool.kind === 'memory' ? '15rem' : tool.kind === 'history' ? '12rem' : '10rem'
    return `flex: 1 1 0; min-width: ${minWidth};`
}

/**
 * A Debug tool's section body, at most `maxHeight` tall and scrolling inside: the Stack pointer pads
 * its own controls and page, which are ruled apart from edge to edge of the section, and the others
 * are inset by 0.4rem.
 */
export function toolBodyStyle(tool: DebugTool, maxHeight: string): string {
    const padding = tool.kind === 'memory' ? '0' : '0.4rem'
    return `padding: ${padding}; max-height: ${maxHeight}; overflow: auto;`
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
