/**
 * What a rename or a comment prompt asks for and how it saves
 * ([annotations-and-search.md](../../../../../docs/design/annotations-and-search.md), decision
 * 18): a name, in one line, or a comment, in several, each checked as typed.
 */
export type AnnotationPromptSpec = {
    kind: 'name' | 'comment' | 'function comment'
    /** The Executable's File it annotates. */
    path: string
    /** The link-time address of the label, line or function. */
    address: number
    /** What it changes, as its title says: "Rename main", "Comment on the function main". */
    title: string
    /** A note under the title, such as the name a label was renamed from. */
    note?: string
    /** The text it opens with: the name the label has, or the comment there is. */
    text: string
    /** Written before the field, as part of the name: a jump target's dot. */
    prefix?: string
    /**
     * The function whose Pseudocode it was opened over, by its link-time address: it shows over
     * that Pseudocode, as one opened without it shows over the File's Listing.
     */
    pseudocodeFunction?: number
    /** Why the text cannot be saved, as the prompt says under the field; undefined when it can. */
    problem: (text: string) => string | undefined
    /** Saves the text, giving why it could not be when it was not. */
    save: (text: string) => string | undefined
}

/**
 * Rename…, Comment… and Function comment…'s prompt, opened over a Listing or Pseudocode line, or in
 * the Symbols panel, as the Patch prompt opens: the text as typed, the reason it cannot be saved as
 * it stands, and why saving it failed when it did. Saving a comment empty deletes it, and saving a
 * label's or a variable's own name resets it.
 */
export class AnnotationPrompt {
    text = $state('')
    /** Why the last save failed: a limit of the Project's, or what the Workbench is doing. */
    failure = $state<string | undefined>()

    constructor(readonly spec: AnnotationPromptSpec) {
        this.text = spec.text
    }

    /** Whether it asks for a comment, in several lines, rather than a name. */
    get multiline(): boolean {
        return this.spec.kind !== 'name'
    }

    /** Why the text as it stands cannot be saved; undefined when it can. */
    get problem(): string | undefined {
        return this.spec.problem(this.text)
    }

    input(text: string): void {
        this.text = text
        this.failure = undefined
    }

    /** Saves the text, when it can be; whether it was saved. */
    save(): boolean {
        if (this.problem !== undefined) return false
        const failure = this.spec.save(this.text)
        this.failure = failure
        return failure === undefined
    }
}
