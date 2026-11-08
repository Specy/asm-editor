<script lang="ts" module>
    import type { InstructionTag } from '#lib/documentation/instructions/categories.ts'

    /** What each tag means, on hover; neutral enough for every language that has it. */
    const TAG_TITLES: Record<InstructionTag, string> = {
        pseudo: "Not the processor's own syntax: the assembler translates it into real instructions",
        'rv64-only': 'Only on the RV64 target',
        undocumented: "Left out of the processor's manual",
        privileged: 'The processor reserves it for supervisor or kernel mode',
        '68010':
            'Requires a 68010 or 68020. Select the processor with opt p=68010 or opt p=68020 before any code or data.',
        '68020': 'Requires a 68020. Write opt p=68020 before any code or data.',
        'opt-bit':
            'Also available on the 68000 and 68010 with opt bit, EASy68K’s option for enabling bit-field instructions.'
    }
</script>

<script lang="ts">
    /**
     * One **Instruction tag** as a badge: beside a mnemonic's name when every form has it, or on
     * the forms that have it ([the design record](../../../../../../docs/design/instruction-categories.md)).
     */
    import { tagLabel } from '#lib/documentation/instructions/categories.ts'
    import Badge from '#cmp/shared/misc/Badge.svelte'

    interface Props {
        tag: InstructionTag
        /** What a language knows better than the shared meaning, such as Zilog's manual. */
        title?: string
    }

    let { tag, title }: Props = $props()
</script>

<Badge class="instruction-tag" tone="info" solid data-tag={tag} title={title ?? TAG_TITLES[tag]}
    >{tagLabel(tag)}</Badge
>
