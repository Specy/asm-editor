/**
 * How the debug tools name a symbol of an Executable or a library it loads
 * ([cpp-demangling.md](../../../../../../docs/design/cpp-demangling.md), decisions 11 and 12): a
 * C++ name by its short form, its signature and the raw name kept for the tooltip; any other name,
 * every name when the demangler did not load, and one whose reading fails, raw as before. They run
 * on the main thread during a Build and at each debug step, neither of which a name may fail.
 */
import { demangledName, type DemangledName, type Describe } from './demangledNames'

/** A symbol's demangled forms, or undefined when it has none or reading it fails. */
function formsOf(raw: string, describe: Describe | undefined): DemangledName | undefined {
    if (!describe) return undefined
    try {
        return demangledName(raw, describe)
    } catch {
        return undefined
    }
}

/** A name as the Call stack or the History shows it. */
export type DebugName = {
    /** The short name, `std::ostream::operator<<@plt`, else the raw name. */
    name: string
    /**
     * For a demangled name, its tooltip: the signature, then the raw name the program calls it by,
     * which the Listing's text and Ctrl+F find.
     */
    detail?: string
}

/**
 * A symbol's name for the Call stack and the History, with `offset` (`+0x1c`, where a frame is
 * inside the function) after the short name and the raw one.
 */
export function debugName(raw: string, describe: Describe | undefined, offset = ''): DebugName {
    const demangled = formsOf(raw, describe)
    if (!demangled) return { name: raw + offset }
    return {
        name: demangled.short + offset,
        detail: `${demangled.signature}\n${raw}${offset}`
    }
}

/**
 * A data label's name in the memory view, its data form (`std::cout@GLIBCXX_3.4`, `typeinfo for
 * std::runtime_error`), or undefined for a name that is not demangled, which shows raw.
 */
export function memoryLabelName(raw: string, describe: Describe | undefined): string | undefined {
    return formsOf(raw, describe)?.short
}
