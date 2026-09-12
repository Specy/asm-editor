<script lang="ts">
    import Page from '$cmp/shared/layout/Page.svelte'
    import FaArrowRight from '~icons/fa-solid/arrow-right'
    import { x86DocumentedNames } from '$lib/languages/X86/X86-documentation'
    import { resolve } from '$app/paths'

    type Group = {
        letter: string
        instructions: string[]
    }
    const instructions = Array.from(x86DocumentedNames)
    const groups = new Array(26).fill(0).map((_, i) => {
        const letter = String.fromCharCode(65 + i)
        return {
            letter,
            instructions: instructions.filter((e) => e[0].toUpperCase() === letter)
        } satisfies Group
    })
</script>

<svelte:head>
    <title>x86-64 Instructions</title>
    <meta
        name="description"
        content="Read the x86-64 instruction documentation: every integer instruction with the operand forms NASM accepts, the processor that introduced each one, and a program to run it in"
    />
    <meta
        property="og:description"
        content="Read the x86-64 instruction documentation: every integer instruction with the operand forms NASM accepts, the processor that introduced each one, and a program to run it in"
    />
</svelte:head>

<Page contentStyle="padding-top: 4rem; gap: 1rem; padding: 1rem">
    <h1>x86-64 Instructions</h1>
    <p class="note">
        The integer instruction set, under NASM's own headings. The vector and system extensions are
        listed with their forms on the
        <a href={resolve('/documentation/x86/all', {})}>complete documentation</a>
        page: no source we can publish describes them, and no program here runs one.
    </p>
    {#each groups as group (group.letter)}
        {#if group.instructions.length}
            <a href="#{group.letter}" style="width: min-content; margin-top: 2rem;">
                <h2 class="letter-group" id={group.letter}>
                    <div>
                        {group.letter}
                    </div>
                </h2>
            </a>
            <div class="instructions">
                {#each group.instructions as ins (ins)}
                    <a
                        class="instruction"
                        href={resolve('/documentation/x86/instruction/[instructionName]', {
                            instructionName: ins
                        })}
                    >
                        <div>
                            {ins}
                        </div>
                        <div class="arrow">
                            <FaArrowRight />
                        </div>
                    </a>
                {/each}
            </div>
        {/if}
    {/each}
</Page>

<style lang="scss">
    .note {
        line-height: 1.5;
        max-width: 60rem;
        color: var(--background-text-muted);

        a {
            color: var(--accent);
            text-decoration: underline;
        }
    }
    .instructions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
    }

    .letter-group {
        background-color: var(--accent);
        color: var(--accent-text);
        width: 2.5rem;
        height: 2.5rem;
        border-radius: 10rem;
        display: flex;
        justify-content: center;
        align-items: center;
    }

    .instruction {
        padding: 1rem 1rem 1rem 2rem;
        align-items: center;
        border-radius: 0.5rem;
        display: flex;
        width: 15rem;
        gap: 1rem;
        text-align: center;
        font-size: 1.2rem;
        font-family: FiraCode;
        justify-content: space-between;
        background-color: var(--secondary);
        color: var(--secondary-text);
        transition: all 0.2s;

        &:hover {
            background-color: var(--tertiary);
            color: var(--tertiary-text);
        }
    }

    @media (max-width: 600px) {
        .instructions {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
        }
        .instruction {
            width: 100%;
            justify-content: center;
            padding-right: 2rem;
        }
        .arrow {
            display: none;
        }
    }

    .arrow {
        opacity: 0;
        height: 1.5rem;
        transition: all 0.2s;
        transform: translateX(-1rem);
    }

    .instruction:hover .arrow {
        opacity: 1;
        transform: translateX(0);
    }
</style>
