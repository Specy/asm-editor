import type { BuiltinPanelId, PanelAccess } from '#lib/workbench/hostApi.ts'

/**
 * The Workbench's built-in panels in an Exam's assembly section, as the old editor had them
 * ([the design record](../../../../../../docs/design/workbench.md), Layout and behaviour): no
 * Explorer, AI or Settings, the Testcases read only; and no Search panel, which goes with the
 * Explorer ([annotations-and-search.md](../../../../../../docs/design/annotations-and-search.md),
 * decision 23), nor Symbols, which the old editor never had either.
 */
export const EXAM_PANEL_ACCESS: Readonly<Partial<Record<BuiltinPanelId, PanelAccess>>> = {
    explorer: 'off',
    search: 'off',
    symbols: 'off',
    agent: 'off',
    settings: 'off',
    testcases: 'readonly'
}
