import type monaco from 'monaco-editor'
import type { MonacoType } from '$lib/monaco/Monaco'
import { resolveSourceHelpContext } from './context'
import { sourceHelpEntries } from './catalog'
import { callAt, identifierAt, includeAt, scanSource, type ScannedSource } from './scan'
import { languageEntries } from './languageEntries'
import { entryDocumentation, entryHover, escapeMarkdown } from './documentation'
import { includeSuggestions } from './includes'
import type { HelpEntry } from './types'
/** Measured lexical passes at 128 Ki characters stay small; decline later positions rather than
 * scan multi-megabyte files on the UI thread. Monaco's generic word suggestions remain available. */
export const SOURCE_HELP_SCAN_LIMIT = 128 * 1024

export function registerSourceLanguageHelp(currentMonaco: MonacoType): monaco.IDisposable[] {
    let cache = new WeakMap<monaco.editor.ITextModel, { version: number; source: ScannedSource }>()
    let disposed = false
    const modelWatches = new Set<monaco.IDisposable>()
    function scan(model: monaco.editor.ITextModel, offset: number): ScannedSource | undefined {
        const version = model.getVersionId()
        const found = cache.get(model)
        if (offset >= SOURCE_HELP_SCAN_LIMIT) return undefined
        if (found?.version === version) return found.source
        const end = model.getPositionAt(SOURCE_HELP_SCAN_LIMIT)
        const source = scanSource(
            model.getValueInRange({
                startLineNumber: 1,
                startColumn: 1,
                endLineNumber: end.lineNumber,
                endColumn: end.column
            })
        )
        if (!found) {
            const watch = model.onWillDispose(() => {
                cache.delete(model)
                modelWatches.delete(watch)
            })
            modelWatches.add(watch)
        }
        cache.set(model, { version, source })
        return source
    }
    function range(model: monaco.editor.ITextModel, start: number, end: number): monaco.IRange {
        const from = model.getPositionAt(start),
            to = model.getPositionAt(end)
        return {
            startLineNumber: from.lineNumber,
            startColumn: from.column,
            endLineNumber: to.lineNumber,
            endColumn: to.column
        }
    }
    const kind = (entry: HelpEntry) =>
        entry.kind === 'function'
            ? currentMonaco.languages.CompletionItemKind.Function
            : entry.kind === 'type'
              ? currentMonaco.languages.CompletionItemKind.TypeParameter
              : entry.kind === 'macro'
                ? currentMonaco.languages.CompletionItemKind.Constant
                : currentMonaco.languages.CompletionItemKind.Variable
    const completion: monaco.languages.CompletionItemProvider = {
        triggerCharacters: ['_', ':', '"', '<', '/'],
        async provideCompletionItems(model, position, _request, token) {
            const context = resolveSourceHelpContext(model)
            if (!context || disposed || token.isCancellationRequested) return undefined
            const offset = model.getOffsetAt(position),
                source = scan(model, offset)
            if (!source) return undefined
            const include = includeAt(source, offset)
            if (include) {
                if (include.end >= SOURCE_HELP_SCAN_LIMIT) return undefined
                return {
                    suggestions: includeSuggestions(context, include).map((item) => ({
                        label: item.name,
                        insertText: item.name,
                        kind: currentMonaco.languages.CompletionItemKind.File,
                        detail: item.summary,
                        range: range(model, include.start, include.end)
                    }))
                }
            }
            const identifier = identifierAt(source, offset, context.language === 'cpp', true)
            if (!identifier || identifier.end >= SOURCE_HELP_SCAN_LIMIT) return undefined
            const entries = await sourceHelpEntries(context.capabilities, context.language)
            if (disposed || token.isCancellationRequested || !context.current()) return undefined
            const replacement = range(model, identifier.start, identifier.end)
            const prefix = identifier.prefix.toLowerCase()
            const suggestions: monaco.languages.CompletionItem[] = entries
                .filter((entry) => {
                    const name = identifier.qualified
                        ? entry.name.startsWith('std::')
                            ? entry.name.slice(5)
                            : undefined
                        : entry.name
                    return name !== undefined && name.toLowerCase().startsWith(prefix)
                })
                .map((entry) => ({
                    label: entry.name,
                    insertText: identifier.qualified ? entry.name.slice(5) : entry.name,
                    kind: kind(entry),
                    detail: `${entry.declaration} — <${entry.headers[0]}>`,
                    documentation: {
                        value: entryDocumentation(entry),
                        isTrusted: false,
                        supportHtml: false
                    },
                    range: replacement
                }))
            if (!identifier.qualified) {
                for (const entry of languageEntries(
                    context.language,
                    context.capabilities?.target
                )) {
                    if (!entry.name.toLowerCase().startsWith(prefix)) continue
                    suggestions.push({
                        label: entry.name,
                        insertText: entry.insertText ?? entry.name,
                        kind:
                            entry.kind === 'snippet'
                                ? currentMonaco.languages.CompletionItemKind.Snippet
                                : currentMonaco.languages.CompletionItemKind.Keyword,
                        detail: entry.summary,
                        documentation: {
                            value: escapeMarkdown(entry.summary),
                            isTrusted: false,
                            supportHtml: false
                        },
                        ...(entry.kind === 'snippet'
                            ? {
                                  insertTextRules:
                                      currentMonaco.languages.CompletionItemInsertTextRule
                                          .InsertAsSnippet
                              }
                            : {}),
                        range: replacement
                    })
                }
            }
            return { suggestions }
        }
    }
    const hover: monaco.languages.HoverProvider = {
        async provideHover(model, position, token) {
            const context = resolveSourceHelpContext(model)
            if (!context || disposed || token.isCancellationRequested) return undefined
            const offset = model.getOffsetAt(position),
                source = scan(model, offset)
            if (!source) return undefined
            const identifier = identifierAt(source, offset, context.language === 'cpp')
            if (!identifier || identifier.end >= SOURCE_HELP_SCAN_LIMIT) return undefined
            const entries = await sourceHelpEntries(context.capabilities, context.language)
            if (disposed || token.isCancellationRequested || !context.current()) return undefined
            const entry = entries.find((entry) => entry.name === identifier.name)
            const keyword = languageEntries(context.language, context.capabilities?.target).find(
                (entry) => entry.kind === 'keyword' && entry.name === identifier.name
            )
            if (!entry && !keyword) return undefined
            return {
                range: range(model, identifier.start, identifier.end),
                contents: [
                    {
                        value: entry ? entryHover(entry) : escapeMarkdown(keyword!.summary),
                        isTrusted: false,
                        supportHtml: false
                    }
                ]
            }
        }
    }
    const signature: monaco.languages.SignatureHelpProvider = {
        signatureHelpTriggerCharacters: ['(', ','],
        signatureHelpRetriggerCharacters: [')'],
        async provideSignatureHelp(model, position, token) {
            const context = resolveSourceHelpContext(model)
            if (!context || disposed || token.isCancellationRequested) return undefined
            const offset = model.getOffsetAt(position),
                source = scan(model, offset)
            if (!source) return undefined
            const call = callAt(source, offset, context.language === 'cpp')
            if (!call) return undefined
            const entries = await sourceHelpEntries(context.capabilities, context.language)
            if (disposed || token.isCancellationRequested || !context.current()) return undefined
            const entry = entries.find((entry) => entry.name === call.name && entry.parameters)
            if (!entry) return undefined
            const parameters = entry.parameters!
            const variadic = parameters[parameters.length - 1]?.label === '...'
            if (parameters.length && call.argument >= parameters.length && !variadic)
                return undefined
            if (!parameters.length && call.argument) return undefined
            const activeParameter = parameters.length
                ? Math.min(call.argument, parameters.length - 1)
                : 0
            return {
                value: {
                    signatures: [
                        {
                            label: entry.declaration,
                            documentation: {
                                value: entryDocumentation(entry),
                                isTrusted: false,
                                supportHtml: false
                            },
                            parameters: parameters.map((parameter) => ({
                                label: parameter.range,
                                documentation: parameter.description
                            }))
                        }
                    ],
                    activeSignature: 0,
                    activeParameter
                },
                dispose() {}
            }
        }
    }
    const registrations: monaco.IDisposable[] = []
    try {
        // C currently uses cpp's tokenizer, but direct C models are supported too.
        for (const language of ['c', 'cpp']) {
            registrations.push(
                currentMonaco.languages.registerCompletionItemProvider(language, completion)
            )
            registrations.push(currentMonaco.languages.registerHoverProvider(language, hover))
            registrations.push(
                currentMonaco.languages.registerSignatureHelpProvider(language, signature)
            )
        }
    } catch (error) {
        for (const registration of registrations.reverse()) registration.dispose()
        throw error
    }
    return [
        ...registrations,
        {
            dispose() {
                disposed = true
                for (const watch of modelWatches) watch.dispose()
                modelWatches.clear()
                cache = new WeakMap()
            }
        }
    ]
}
