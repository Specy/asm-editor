<script lang="ts">
    import Card from '$cmp/shared/layout/Card.svelte'
    import Column from '$cmp/shared/layout/Column.svelte'
    import MarkdownRenderer from '$cmp/shared/markdown/MarkdownRenderer.svelte'
    import {
        X86_DIRECTIVE_DOCS,
        X86_DIRECTIVES,
        X86_PREFIX_DOCS,
        X86_PREPROCESSOR_DIRECTIVES,
        X86_PREPROCESSOR_DOCS,
        X86_PSEUDO_OP_DOCS
    } from '$lib/languages/X86/X86-documentation'

    interface Props {
        disableLinks?: boolean
    }

    let { disableLinks = false }: Props = $props()

    const groups = [
        {
            id: 'directives',
            title: 'Directives',
            note: 'Directives tell the assembler what to do. They are not instructions and the processor never sees them.',
            entries: X86_DIRECTIVE_DOCS
        },
        {
            id: 'data',
            title: 'Data and space',
            note: 'These live in the instruction table and behave like directives: they put bytes in the output, or reserve room for them.',
            entries: X86_PSEUDO_OP_DOCS
        },
        {
            id: 'preprocessor',
            title: 'The preprocessor',
            note: 'The preprocessor runs over the text before the assembler reads it, so it can define names, repeat blocks and include files, and knows nothing about registers or instructions.',
            entries: X86_PREPROCESSOR_DOCS
        },
        {
            id: 'prefixes',
            title: 'Prefixes and operand sizes',
            note: 'Words that go in front of an instruction or an operand rather than standing on their own.',
            entries: X86_PREFIX_DOCS
        }
    ]
</script>

<Column gap="1rem" style="width: 100%;">
    {#each groups as group (group.id)}
        <h2 class="section-title" id={group.id}>{group.title}</h2>
        <p class="note">{group.note}</p>
        {#each group.entries as entry (entry.name)}
            <Card gap="0.6rem" padding="1rem" background="secondary" style="width: 100%;">
                <h3 class="sub-title">{entry.name}</h3>
                <span class="sub-description">
                    <MarkdownRenderer source={entry.description} {disableLinks} />
                </span>
            </Card>
        {/each}
    {/each}

    <h2 class="section-title" id="everything-else">Everything else</h2>
    <p class="note">
        The rest of what NASM accepts, from its own tables. These are here so the list is complete;
        the <a href="https://www.nasm.us/docs.php" target="_blank" rel="noreferrer">NASM manual</a> documents
        them.
    </p>
    <div class="word-list">
        {#each X86_DIRECTIVES as directive (directive)}
            <code>{directive}</code>
        {/each}
        {#each X86_PREPROCESSOR_DIRECTIVES as directive (directive)}
            <code>{directive}</code>
        {/each}
    </div>
</Column>

<style lang="scss">
    @use '../m68k/style.scss' as *;
    .note {
        line-height: 1.5;
        max-width: 60rem;
    }
    .word-list {
        display: flex;
        flex-wrap: wrap;
        gap: 0.3rem;
    }
    code {
        font-family: FiraCode;
        font-size: 0.85rem;
        padding: 0.15rem 0.4rem;
        border-radius: 0.3rem;
        background-color: var(--secondary);
        color: var(--secondary-text);
    }
    a {
        color: var(--accent);
        text-decoration: underline;
    }
</style>
