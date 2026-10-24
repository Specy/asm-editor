/**
 * Where in a Core's execution a change to the Terminal was made, named the way the Core's own Undo
 * history names an instruction: M68K's step id, the Z80's t-state count, the instruction serial of
 * MARS, RARS and Blink. Positions increase as a program runs, so the changes an Undo takes back are
 * the ones after the position the Core rolled back to.
 */
export type TerminalPosition = number | bigint

/**
 * The Terminal's Undo journal ([ADR 0057](../../../../../../docs/adr/0057-restore-the-terminal-on-undo.md)):
 * the state each instruction found the Terminal in, kept the first time that instruction changes
 * it, so that an Undo of the instruction puts it back. An instruction that leaves the Terminal alone
 * costs nothing.
 *
 * It keeps a record for as many instructions as the Core's history holds, the newest ones, so it
 * never stops an Undo the Core could make: each record is a few numbers, and a transcript only where
 * a clear threw one away. The records are the Terminal's own, so it is generic over them.
 *
 * Plain TypeScript with no Svelte runes, like the Screen's journal: it is driven from inside a
 * Core's synchronous execution.
 */
export class TerminalHistory<Entry extends { readonly position: TerminalPosition }> {
    private records: Entry[] = []
    private position: (() => TerminalPosition | null) | null = null
    private capacity = 0

    /**
     * Journals the Build about to run: `position` names the instruction running, or null between
     * instructions, and `capacity` is how many entries the Core's history keeps. A Build that keeps
     * no history journals nothing.
     */
    track(position: () => TerminalPosition | null, capacity: number): void {
        this.records = []
        this.capacity = Number.isFinite(capacity) ? Math.max(0, Math.floor(capacity)) : 0
        this.position = this.capacity > 0 ? position : null
    }

    /**
     * The record of the instruction about to change the Terminal, made by `capture` on its first
     * change, or null when nothing is journaled: no Build is, or no instruction is running.
     */
    current(capture: (position: TerminalPosition) => Entry): Entry | null {
        const position = this.position?.() ?? null
        if (position === null) return null
        const newest = this.records[this.records.length - 1]
        if (newest !== undefined && newest.position === position) return newest
        const record = capture(position)
        this.records.push(record)
        if (this.records.length > this.capacity) this.records.shift()
        return record
    }

    /**
     * Hands `restore` each record made after `position`, newest first, and forgets them: once the
     * Core has rolled back to `position`, those instructions have not happened.
     */
    undoAfter(position: TerminalPosition, restore: (record: Entry) => void): void {
        while (
            this.records.length > 0 &&
            this.records[this.records.length - 1].position > position
        ) {
            restore(this.records.pop()!)
        }
    }

    /** Stops journaling: the program is over, and the next Build starts its own journal. */
    clear(): void {
        this.records = []
        this.position = null
        this.capacity = 0
    }
}
