<script lang="ts">
    import AgentSidebarFrame from '$cmp/shared/agent/AgentSidebarFrame.svelte'
    import ExamReviewAgent from './ExamReviewAgent.svelte'
    import type { Emulator } from '$lib/languages/Emulator'
    import type { ExamPayload, ExamSection, ExamSectionAnswer, ExamSubmission } from '$lib/exam'

    interface Props {
        open: boolean
        openSize?: string
        verticalOffset?: string
        exam: ExamPayload
        sections: ExamSection[]
        submission: ExamSubmission
        activeSectionId: string
        visibleAnswer?: ExamSectionAnswer | null
        emulatorInstance?: Emulator | null
    }

    let {
        open = $bindable(false),
        openSize = '30rem',
        verticalOffset = '4.2rem',
        ...agent
    }: Props = $props()
</script>

<AgentSidebarFrame bind:open {openSize} {verticalOffset}>
    <ExamReviewAgent
        {...agent}
        style="border-radius: 0; border: none; box-shadow: none; opacity: 0.82;"
    />
</AgentSidebarFrame>
