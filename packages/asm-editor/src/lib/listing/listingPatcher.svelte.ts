import { partitionPoint } from '#lib/sorted.ts'
import type { ListingDecoder } from './decoder'
import { LINE_KIND, lineOfAddress, type Listing } from './listing'
import type { ListingDocument } from './listingDocuments.svelte'
import {
    describeLine,
    fitPatch,
    instructionText,
    mergeNames,
    namesOf,
    NO_NAMES,
    patchTitle,
    withLines,
    type DescribedLine,
    type NameHints
} from './patchFormat'
import { resolveListingNames } from './patchResolver'

/**
 * Patching the running Executable from its Listing
 * ([binary-import.md](../../../../../docs/design/binary-import.md), decision 13, and the plan's
 * M11): a person retypes the instruction of a Listing line, which is assembled at the line's
 * run-time address and written into memory as one Poke, padded with `nop` when shorter and refused
 * when longer. The Executable File never changes, and the Listing model stays read-only: the lines
 * it shows patched are read from memory, so an Undo of the Poke shows the line as it was and the
 * next Build shows the Executable's own Listing.
 */

/** A Listing line a patch may replace: one instruction of the running Executable. */
export type PatchSite = {
    /** Where the Executable's Listing is shown: its own path. */
    path: string
    document: ListingDocument
    listing: Listing
    /** The 0-based line. */
    line: number
    /** The run-time address of the line's instruction. */
    address: bigint
    /** How many bytes the line's instruction has in the Executable, which a patch fills exactly. */
    length: number
    /** The instruction as the line shows it now, without its comment. */
    text: string
}

export type PatchPreview =
    | {
          ok: true
          site: PatchSite
          /** As typed. */
          text: string
          /** What the Poke writes: the encoding and the `nop`s that pad it. */
          bytes: Uint8Array
          /** How many of `bytes` are the instruction's own. */
          encodedLength: number
          /** The line as the Listing will show it, decoded from `bytes`. */
          line: DescribedLine
          /** What memory holds there now. */
          was: Uint8Array
          /** Whether memory already holds `bytes`, so there is nothing to write. */
          unchanged: boolean
          /** The names the text used, by the address each stands for. */
          names: NameHints
      }
    | { ok: false; site: PatchSite; text: string; error: string }

/** A line of the running Executable's Listing whose bytes in memory are not the Executable's. */
export type PatchedLine = {
    /** The whole line as shown: `    je .LAB_2 ; + 1 nop`. */
    text: string
    /** Its first instruction, named, without comments: what the prompt starts with. */
    instruction: string
    /** What memory holds. */
    bytes: Uint8Array
    /** What the Executable holds. */
    original: Uint8Array
    /** The line's instruction in the Executable, as its Listing shows it. */
    originalText: string
}

/** The running Executable's patched lines, and its Listing with them in place. */
export type PatchedListing = {
    path: string
    document: ListingDocument
    lines: ReadonlyMap<number, PatchedLine>
    /** The Listing with the patched lines' text; its line table, labels and functions unchanged. */
    listing: Listing
}

/** What the patcher needs of the Emulator running the Executable. */
export type PatchHost = {
    /** The running Executable and its Listing; undefined unless the Debug session runs one. */
    executable(): { path: string; document: ListingDocument } | undefined
    /** Memory as the program sees it, or undefined where it cannot be read. */
    readMemory(address: bigint, length: number): Uint8Array | undefined
    /** One Poke of a run of bytes; false when it was refused or not recorded. */
    poke(address: bigint, bytes: Uint8Array): boolean
    /** Zydis, once loaded; patched lines are decoded with it as memory changes. */
    decoder(): ListingDecoder | undefined
    loadDecoder(): Promise<ListingDecoder>
    /** NASM at a run-time address, numbers only (`assembleInstruction`). */
    assemble(text: string, address: bigint): Promise<{ bytes: Uint8Array } | { error: string }>
}

const sameBytes = (a: Uint8Array, b: Uint8Array) =>
    a.length === b.length && a.every((byte, k) => byte === b[k])

export class ListingPatcher {
    /**
     * The running Executable's lines whose bytes in memory differ from the Executable's, read
     * again whenever the Emulator refreshes: after a patch, an Undo, a Step or a Run.
     */
    patched = $state.raw<PatchedListing | undefined>()
    /**
     * The instructions of this Debug session whose bytes a Poke wrote, a patch or the memory view,
     * by their link-time address, with the names the last patch of each was typed with. Only these
     * are read again, each on the line of its address in the Listing shown then: a Listing made
     * again during the session, with a person's comment lines or names
     * ([annotations-and-search.md](../../../../../docs/design/annotations-and-search.md),
     * decision 22), or at the address the program was loaded at, has its lines elsewhere.
     */
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- read by `refresh`, which sets the reactive `patched`.
    private readonly written = new Map<number, NameHints>()
    /** The names each line of a Listing is written with, read when first needed. */
    private readonly originalNames = new WeakMap<Listing, Map<number, NameHints>>()

    constructor(private readonly host: PatchHost) {}

    /** The line, when it is an instruction of the running Executable's Listing. */
    site(line: number): PatchSite | undefined {
        const executable = this.host.executable()
        const listing = executable?.document.listing
        if (!executable || !listing || listing.lines.kinds[line] !== LINE_KIND.instruction)
            return undefined
        const patched =
            this.patched?.document === executable.document
                ? this.patched.lines.get(line)
                : undefined
        return {
            path: executable.path,
            document: executable.document,
            listing,
            line,
            address: BigInt(listing.lines.addresses[line] + listing.base),
            length: listing.lines.sizes[line],
            text: patched?.instruction ?? instructionText(listing, line)
        }
    }

    /**
     * What the text would write at the site: its names resolved, assembled at the line's address,
     * padded with `nop`, and decoded again, which is what the person sees before anything is
     * written (the decoder, not the assembler, has the last word on what the bytes mean).
     */
    async preview(site: PatchSite, text: string): Promise<PatchPreview> {
        try {
            return await this.makePreview(site, text)
        } catch (error) {
            //the assembler or the decoder could not be loaded, or threw
            return {
                ok: false,
                site,
                text,
                error: error instanceof Error ? error.message : String(error)
            }
        }
    }

    private async makePreview(site: PatchSite, text: string): Promise<PatchPreview> {
        const fail = (error: string): PatchPreview => ({ ok: false, site, text, error })
        if (this.host.executable()?.document !== site.document)
            return fail('The Debug session this line belongs to has ended')
        const resolved = resolveListingNames(text, site.listing, site.line)
        if ('error' in resolved) return fail(resolved.error)
        if (!resolved.text) return fail('Enter one instruction')
        const assembled = await this.host.assemble(resolved.text, site.address)
        if ('error' in assembled) return fail(assembled.error)
        const fitted = fitPatch(assembled.bytes, site.length)
        if ('error' in fitted) return fail(fitted.error)
        const decoder = await this.host.loadDecoder()
        const decoded = decoder.disassemble(fitted.bytes, site.address)
        const first = decoded[0]
        if (!first || first.isInvalid || first.length !== assembled.bytes.length)
            return fail(
                `The assembler's ${assembled.bytes.length} bytes do not decode as one instruction`
            )
        const names = namesOf(resolved.names)
        const line = describeLine(
            decoded,
            site.listing,
            site.document.bytes,
            site.line,
            this.hints(site.listing, site.line, names)
        )
        const was = this.host.readMemory(site.address, site.length) ?? new Uint8Array()
        return {
            ok: true,
            site,
            text,
            bytes: fitted.bytes,
            encodedLength: assembled.bytes.length,
            line,
            was,
            unchanged: sameBytes(was, fitted.bytes),
            names
        }
    }

    /** Writes a preview's bytes as one Poke; whether memory now holds them. */
    apply(preview: PatchPreview): boolean {
        if (!preview.ok || preview.unchanged) return false
        const { site } = preview
        if (this.host.executable()?.document !== site.document) return false
        //before the Poke, so the refresh it ends with reads the line
        this.written.set(site.listing.lines.addresses[site.line], preview.names)
        this.host.poke(site.address, preview.bytes)
        this.refresh()
        const now = this.host.readMemory(site.address, site.length)
        return !!now && sameBytes(now, preview.bytes)
    }

    /**
     * Notes the instruction lines a write into memory covers, which the patched lines are read
     * from at every refresh: a patch, and bytes poked by hand in the memory view.
     */
    touched(address: bigint, length: number): void {
        const listing = this.host.executable()?.document.listing
        if (!listing || length <= 0) return
        const { byAddress, addresses, sizes, kinds } = listing.lines
        const start = Number(address) - listing.base
        const end = start + length
        //the first line ending after the start, then each line starting before the end
        const first = partitionPoint(
            byAddress.length,
            (k) => addresses[byAddress[k]] + sizes[byAddress[k]] <= start
        )
        for (let k = first; k < byAddress.length && addresses[byAddress[k]] < end; k++) {
            const line = byAddress[k]
            if (kinds[line] === LINE_KIND.instruction && !this.written.has(addresses[line]))
                this.written.set(addresses[line], NO_NAMES)
        }
    }

    /** Reads the written lines again, after anything that may have changed memory. */
    refresh(): void {
        const executable = this.host.executable()
        const listing = executable?.document.listing
        const decoder = this.host.decoder()
        if (!this.written.size || !executable || !listing || !decoder) {
            if (this.patched) this.patched = undefined
            return
        }
        const { addresses, sizes, offsets, kinds } = listing.lines
        // eslint-disable-next-line svelte/prefer-svelte-reactivity -- built here, then set whole as `patched`.
        const lines = new Map<number, PatchedLine>()
        for (const [start, names] of [...this.written].sort((a, b) => a[0] - b[0])) {
            //an instruction's line, unless the Listing shown now decodes no instruction there
            const line = lineOfAddress(listing, start)
            if (line < 0 || addresses[line] !== start || kinds[line] !== LINE_KIND.instruction)
                continue
            const address = BigInt(addresses[line] + listing.base)
            const original = executable.document.bytes.subarray(
                offsets[line],
                offsets[line] + sizes[line]
            )
            const bytes = this.host.readMemory(address, sizes[line])
            if (!bytes || sameBytes(bytes, original)) continue
            const described = describeLine(
                decoder.disassemble(bytes, address),
                listing,
                executable.document.bytes,
                line,
                this.hints(listing, line, names)
            )
            lines.set(line, {
                text: described.text,
                instruction: described.instruction,
                bytes: bytes.slice(),
                original,
                originalText: instructionText(listing, line)
            })
        }
        const current = this.patched
        if (
            current?.document === executable.document &&
            current.lines.size === lines.size &&
            [...lines].every(([line, patched]) => {
                const shown = current.lines.get(line)
                return shown?.text === patched.text && sameBytes(shown.bytes, patched.bytes)
            })
        )
            return
        this.patched = lines.size
            ? {
                  path: executable.path,
                  document: executable.document,
                  lines,
                  listing: withLines(
                      listing,
                      [...lines].map(([line, patched]) => [line, patched.text] as const)
                  )
              }
            : undefined
    }

    /**
     * How the History names a Poke that rewrote exactly one instruction of the running
     * Executable: `Patched jne → je at 0x5555555551f8`. Undefined for any other Poke.
     */
    title(write: { address: bigint; old: readonly number[]; new: readonly number[] }) {
        const executable = this.host.executable()
        const listing = executable?.document.listing
        const decoder = this.host.decoder()
        if (!executable || !listing || !decoder) return undefined
        const start = Number(write.address) - listing.base
        const line = lineOfAddress(listing, start)
        const { kinds, addresses, sizes } = listing.lines
        if (
            line < 0 ||
            kinds[line] !== LINE_KIND.instruction ||
            addresses[line] !== start ||
            sizes[line] !== write.new.length ||
            write.old.length !== write.new.length
        )
            return undefined
        const hints = this.hints(listing, line, this.written.get(start))
        const describe = (bytes: readonly number[]) =>
            describeLine(
                decoder.disassemble(Uint8Array.from(bytes), write.address),
                listing,
                executable.document.bytes,
                line,
                hints
            )
        return patchTitle(describe(write.old), describe(write.new), write.address)
    }

    /** Forgets the session's patches: the next Build loads the Executable as it is. */
    clear(): void {
        this.written.clear()
        if (this.patched) this.patched = undefined
    }

    /** The names a line was written with: the Listing's own, then the ones a patch typed. */
    private hints(listing: Listing, line: number, typed?: NameHints): NameHints {
        let lines = this.originalNames.get(listing)
        // eslint-disable-next-line svelte/prefer-svelte-reactivity -- a cache; nothing renders from it.
        if (!lines) this.originalNames.set(listing, (lines = new Map()))
        let original = lines.get(line)
        if (!original) {
            const resolved = resolveListingNames(instructionText(listing, line), listing, line)
            original = 'error' in resolved ? NO_NAMES : namesOf(resolved.names)
            lines.set(line, original)
        }
        return mergeNames(original, typed)
    }
}
