<script lang="ts" module>
    import type { InstructionTag } from '#lib/documentation/instructions/categories.ts'

    /** What each tag means, on hover; neutral enough for every language that has it. */
    const TAG_TITLES: Record<InstructionTag, string> = {
        pseudo: "Not the processor's own syntax: the assembler translates it into real instructions",
        'rv64-only': 'Only on the RV64 target',
        undocumented: "Left out of the processor's manual",
        privileged: 'The processor reserves it for supervisor or kernel mode'
    }
</script>

<script lang="ts">
    /**
     * One **Instruction tag** as a badge: beside a mnemonic's name when every form has it, or on
     * the forms that have it ([the design record](../../../../../../docs/design/instruction-categories.md)).
     */
    import { tagLabel } from '#lib/documentation/instructions/categories.ts'

    interface Props {
        tag: InstructionTag
        /** What a language knows better than the shared meaning, such as Zilog's manual. */
        title?: string
    }

    let { tag, title }: Props = $props()
</script>

<span class="instruction-tag" data-tag={tag} title={title ?? TAG_TITLES[tag]}>{tagLabel(tag)}</span>

<style>
    .instruction-tag {
        display: inline-block;
        padding: 0 0.35rem;
        border-radius: 0.3rem;
        font-size: 0.7rem;
        font-family: Rubik, sans-serif;
        font-weight: normal;
        line-height: 1.5;
        background-color: var(--accent2);
        color: var(--accent2-text);
        white-space: nowrap;
        vertical-align: middle;
    }
</style>
