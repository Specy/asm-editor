<script lang="ts">
    /**
     * One assembly section of an exam session, in the Workbench. An exam section is not a stored
     * Project ([ADR 0024](../../../../docs/adr/0024-workbench-is-a-host-agnostic-shell.md)): its
     * answer is one string, so a temporary one-file Project is made from it when the section opens,
     * and its Entry file's text is copied back into the answer as it changes.
     *
     * The exam keeps the access it had in the old editor
     * ([the design record](../../../../docs/design/workbench.md), Layout and behaviour): no
     * Explorer, AI or Settings, the Testcases read only, the documentation without its links. The
     * prompt is a panel of the exam's own, open when the section opens, and in review mode the
     * teacher's review agent is another.
     */
    import Workbench from '$cmp/specific/workbench/Workbench.svelte'
    import Header from '$cmp/shared/layout/Header.svelte'
    import SparklesIcon from '$cmp/shared/agent/SparklesIcon.svelte'
    import FaFileAlt from '~icons/fa-solid/file-alt'
    import type { AssemblyCodingSection } from '$lib/exam'
    import { makeProject } from '$lib/Project.svelte'
    import type { Emulator } from '$lib/languages/Emulator'
    import type { WorkbenchHostPanel, WorkbenchPanelContext } from '$lib/workbench/hostApi'
    import { untrack, type Snippet } from 'svelte'

    interface Props {
        section: AssemblyCodingSection
        /** The section's answer: read once when it opens, then written as the Entry file changes. */
        code: string
        readonly?: boolean
        prompt: Snippet
        /** The teacher's review agent, in review mode, drawn with the section's Emulator. */
        review?: Snippet<[Emulator]>
        /** The Workbench's open panel, so the exam's header can open the review agent. */
        activePanel?: string | null
    }

    let {
        section,
        code = $bindable(),
        readonly = false,
        prompt,
        review,
        activePanel = $bindable(null)
    }: Props = $props()

    const project = makeProject(
        untrack(() => ({
            name: section.title || 'Assembly section',
            language: section.language,
            code,
            testcases: $state.snapshot(section.testcases)
        }))
    )

    $effect(() => {
        const next = project.code
        untrack(() => {
            if (next !== code) code = next
        })
    })

    const hostPanels = $derived<WorkbenchHostPanel[]>([
        {
            id: 'prompt',
            title: 'Exercise',
            icon: FaFileAlt,
            group: 'top',
            content: promptPanel,
            defaultOpen: true
        },
        ...(review
            ? [
                  {
                      id: 'review',
                      title: 'Review assistant',
                      icon: SparklesIcon,
                      group: 'bottom' as const,
                      content: reviewPanel
                  }
              ]
            : [])
    ])
</script>

{#snippet promptPanel(_context: WorkbenchPanelContext)}
    <div class="prompt">
        {@render prompt()}
    </div>
{/snippet}

{#snippet reviewPanel(context: WorkbenchPanelContext)}
    <div class="review">
        {@render review?.(context.emulator)}
    </div>
{/snippet}

<div class="exam-workbench">
    <Workbench
        {project}
        {readonly}
        access={{ explorer: 'off', agent: 'off', settings: 'off', testcases: 'readonly' }}
        documentationLinks={false}
        searchLectures={false}
        {hostPanels}
        bind:activePanel
    >
        {#snippet loading()}
            <Header>Loading emulator...</Header>
        {/snippet}
    </Workbench>
</div>

<style>
    .exam-workbench {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
        min-width: 0;
    }

    .prompt {
        padding: 0.8rem 1rem;
        overflow-y: auto;
        flex: 1;
    }

    .review {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
    }
</style>
