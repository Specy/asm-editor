import type monaco from 'monaco-editor'
import type { DiagnosticFix } from '#lib/languages/commonLanguageFeatures.svelte.ts'
import type { MonacoType } from './Monaco'

/**
 * The fixes a Core suggests for its diagnostics, offered as Monaco's quick fixes (code actions) on
 * the markers they belong to. The markers are set where the diagnostics are drawn, which is where
 * their fixes are kept beside them (`setModelQuickFixes`); one provider per language reads them back
 * for the markers under the cursor (`createQuickFixProvider`). Monaco keeps a marker's data and
 * nothing else, so the fixes cannot travel on the marker itself.
 */

/** A fix as Monaco applies it: the File it edits, the range it replaces and the text. */
export type QuickFixEdit = {
    title: string
    resource: monaco.Uri
    range: monaco.IRange
    text: string
}

/** A marker as it was set, and the fixes of the diagnostic it draws. */
export type MarkerQuickFixes = {
    marker: monaco.editor.IMarkerData
    fixes: QuickFixEdit[]
}

type ModelQuickFixes = {
    /** The model's version when the markers were set: their fixes describe that text. */
    versionId: number
    /** The version of each other model a fix edits, when it had one then. */
    versions: Map<string, number>
    entries: MarkerQuickFixes[]
}

const quickFixes = new WeakMap<monaco.editor.ITextModel, Map<string, ModelQuickFixes>>()

/** The Monaco range of a fix: lines from zero-based to one-based, columns already one-based. */
export function quickFixRange(fix: DiagnosticFix): monaco.IRange {
    return {
        startLineNumber: fix.lineIndex + 1,
        startColumn: fix.column,
        endLineNumber: fix.endLineIndex + 1,
        endColumn: fix.endColumn
    }
}

/**
 * Keeps the fixes of the markers `owner` just set on a model, replacing what it kept before, the
 * way `setModelMarkers` replaces that owner's markers.
 */
export function setModelQuickFixes(
    currentMonaco: MonacoType,
    model: monaco.editor.ITextModel,
    owner: string,
    entries: MarkerQuickFixes[]
): void {
    let owners = quickFixes.get(model)
    if (entries.length === 0) {
        owners?.delete(owner)
        return
    }
    if (!owners) {
        owners = new Map()
        quickFixes.set(model, owners)
    }
    const versions = new Map<string, number>()
    for (const { fixes } of entries) {
        for (const fix of fixes) {
            const key = fix.resource.toString()
            if (key === model.uri.toString() || versions.has(key)) continue
            const target = currentMonaco.editor.getModel(fix.resource)
            if (target) versions.set(key, target.getVersionId())
        }
    }
    owners.set(owner, { versionId: model.getVersionId(), versions, entries })
}

function sameMarker(a: monaco.editor.IMarkerData, b: monaco.editor.IMarkerData): boolean {
    return (
        a.startLineNumber === b.startLineNumber &&
        a.startColumn === b.startColumn &&
        a.endLineNumber === b.endLineNumber &&
        a.endColumn === b.endColumn &&
        a.message === b.message &&
        codeOf(a) === codeOf(b)
    )
}

function codeOf(marker: monaco.editor.IMarkerData): string | undefined {
    return typeof marker.code === 'object' ? marker.code.value : marker.code
}

/** Whether a request for `only` actions takes quick fixes: `quickfix` and the kinds above it. */
function wantsQuickFixes(only: string | undefined): boolean {
    return only === undefined || only === 'quickfix' || only === ''
}

/**
 * The quick fixes of the markers a code action request is for. A fix is offered only while the
 * text it was made for is still there: once the model, or a model the fix edits, has changed since
 * the markers were set, its range may point at other text, and the check that follows the edit
 * sets new markers with new fixes. A fix into a File no model holds is left out, since Monaco can
 * only edit a model.
 */
export function quickFixActions(
    currentMonaco: MonacoType,
    model: monaco.editor.ITextModel,
    markers: readonly monaco.editor.IMarkerData[]
): monaco.languages.CodeAction[] {
    const owners = quickFixes.get(model)
    if (!owners) return []
    const actions: monaco.languages.CodeAction[] = []
    for (const marker of markers) {
        const owner = (marker as Partial<monaco.editor.IMarker>).owner
        for (const [key, kept] of owners) {
            if (owner !== undefined && owner !== key) continue
            if (kept.versionId !== model.getVersionId()) continue
            const entry = kept.entries.find((candidate) => sameMarker(candidate.marker, marker))
            if (!entry) continue
            entry.fixes.forEach((fix, index) => {
                const target =
                    fix.resource.toString() === model.uri.toString()
                        ? model
                        : currentMonaco.editor.getModel(fix.resource)
                if (!target) return
                const version = kept.versions.get(fix.resource.toString())
                if (target !== model && version !== undefined && version !== target.getVersionId())
                    return
                actions.push({
                    title: fix.title,
                    kind: 'quickfix',
                    diagnostics: [marker],
                    //the Core lists the fix it prefers first
                    isPreferred: index === 0,
                    edit: {
                        edits: [
                            {
                                resource: fix.resource,
                                textEdit: { range: fix.range, text: fix.text },
                                versionId: undefined
                            }
                        ]
                    }
                })
            })
        }
    }
    return actions
}

/** The code action provider of a language whose diagnostics carry fixes. */
export function createQuickFixProvider(
    currentMonaco: MonacoType
): monaco.languages.CodeActionProvider {
    return {
        provideCodeActions(model, _range, context) {
            if (!wantsQuickFixes(context.only)) return { actions: [], dispose() {} }
            return {
                actions: quickFixActions(currentMonaco, model, context.markers),
                dispose() {}
            }
        }
    }
}

/** What the provider declares, so Monaco asks it only for quick fixes. */
export const QUICK_FIX_METADATA: monaco.languages.CodeActionProviderMetadata = {
    providedCodeActionKinds: ['quickfix']
}
