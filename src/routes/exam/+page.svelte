<script lang="ts">
    import InteractiveInstructionEditor from '$cmp/shared/InteractiveInstructionEditor.svelte'
    import Page from '$cmp/shared/layout/Page.svelte'
    import DefaultNavbar from '$cmp/shared/layout/DefaultNavbar.svelte'
    import Select from '$cmp/shared/input/Select.svelte'
    import { BASE_CODE } from '$lib/Config'
    import Header from '$cmp/shared/layout/Header.svelte'
    import EmulatorLoader from '$cmp/shared/providers/EmulatorLoader.svelte'
    import Row from '$cmp/shared/layout/Row.svelte'
    import MarkdownEditor from '$cmp/shared/markdown/MarkdownEditor.svelte'
    import Button from '$cmp/shared/button/Button.svelte'
    import Input from '$cmp/shared/input/Input.svelte'
    import { encryptData, makeHash } from '$lib/utils'
    import { toast } from '$stores/toastStore'
    import FaDumbbell from 'svelte-icons/fa/FaDumbbell.svelte'
    import FaPlus from 'svelte-icons/fa/FaPlus.svelte'
    import FaTrash from 'svelte-icons/fa/FaTrash.svelte'
    import FaArrowUp from 'svelte-icons/fa/FaArrowUp.svelte'
    import FaArrowDown from 'svelte-icons/fa/FaArrowDown.svelte'
    import Icon from '$cmp/shared/layout/Icon.svelte'
    import type { AvailableLanguages } from '$lib/Project.svelte'
    import {
        createDefaultExamSection,
        createExamSessionLink,
        createExamEntityId,
        ExamSectionType,
        type CCodingSection,
        type ExamPayload,
        type ExamSection,
        type MultipleChoiceSection,
        type AssemblyCodingSection
    } from '$lib/exam'
    import { serializer } from '$lib/json'
    import Editor from '$cmp/specific/project/Editor.svelte'

    type Settings = {
        title: string
        instructions: string
        unlockPassword: string
        examAccessPassword: string
        timeLimitMinutes: string
    }

    let settings: Settings = $state({
        title: 'Untitled exam',
        instructions: '',
        unlockPassword: '',
        examAccessPassword: '',
        timeLimitMinutes: ''
    })
    const sectionTypeOptions = Object.values(ExamSectionType) as ExamSectionType[]

    let sections = $state([
        createDefaultExamSection(ExamSectionType.AssemblyCoding)
    ] as ExamSection[])
    let newSectionType = $state(ExamSectionType.AssemblyCoding)

    function addSection() {
        const section = createDefaultExamSection(newSectionType)
        sections = [...sections, section]
    }

    function removeSection(sectionId: string) {
        if (sections.length <= 1) {
            toast.error('An exam must have at least one section.')
            return
        }
        sections = sections.filter((section) => section.id !== sectionId)
    }

    function changeSectionType(sectionId: string, nextType: ExamSectionType) {
        sections = sections.map((section) => {
            if (section.id !== sectionId || section.type === nextType) return section

            const replacement = createDefaultExamSection(nextType)
            replacement.id = section.id
            replacement.title = section.title
            replacement.prompt = section.prompt
            return replacement
        })
    }

    function sectionTypeLabel(sectionType: ExamSectionType) {
        if (sectionType === ExamSectionType.OpenQuestion) return 'Open question'
        if (sectionType === ExamSectionType.MultipleChoice) return 'Multiple choice'
        if (sectionType === ExamSectionType.AssemblyCoding) return 'Assembly coding'
        return 'C coding'
    }

    function isSectionFirst(index: number) {
        return index === 0
    }

    function isSectionLast(index: number) {
        return index === sections.length - 1
    }

    function sectionIndex(sectionId: string) {
        return sections.findIndex((section) => section.id === sectionId)
    }

    function moveSectionByIndex(index: number, direction: -1 | 1) {
        const nextIndex = index + direction
        if (index < 0 || nextIndex < 0 || nextIndex >= sections.length) return
        const updated = [...sections]
        const [section] = updated.splice(index, 1)
        updated.splice(nextIndex, 0, section)
        sections = updated
    }

    function moveSection(sectionId: string, direction: -1 | 1) {
        const index = sectionIndex(sectionId)
        if (index < 0) {
            return
        }
        moveSectionByIndex(index, direction)
    }

    function createOption(section: MultipleChoiceSection) {
        section.options = [
            ...section.options,
            {
                id: createExamEntityId(),
                text: `Option ${section.options.length + 1}`
            }
        ]
    }

    function removeOption(section: MultipleChoiceSection, optionId: string) {
        if (section.options.length <= 2) {
            toast.error('Multiple choice sections need at least two options.')
            return
        }
        section.options = section.options.filter((option) => option.id !== optionId)
    }

    function onAssemblyLanguageChange(
        section: AssemblyCodingSection,
        language: AvailableLanguages
    ) {
        if (section.starterCode === BASE_CODE[section.language]) {
            section.starterCode = BASE_CODE[language]
        }
        section.language = language
    }

    async function createExamUrl() {
        if (!settings.unlockPassword.trim()) {
            toast.error('Please provide an unlock password before creating the exam.')
            return
        }

        if (sections.length === 0) {
            toast.error('Please add at least one section before creating the exam.')
            return
        }

        const unlockPasswordHash = (await makeHash(settings.unlockPassword)).slice(0, 6)
        const accessPasswordHash = settings.examAccessPassword
            ? (await makeHash(settings.examAccessPassword)).slice(0, 6)
            : undefined
        const parsedTimeLimit = Number(settings.timeLimitMinutes)
        const timeLimitMs =
            Number.isFinite(parsedTimeLimit) && parsedTimeLimit > 0
                ? Math.floor(parsedTimeLimit * 60_000)
                : -1

        const payload: ExamPayload = {
            version: 2,
            title: settings.title.trim() || 'Untitled exam',
            instructions: settings.instructions,
            unlockPasswordHash,
            accessPasswordHash,
            timeLimit: timeLimitMs,
            sections: $state.snapshot(sections)
        }

        if (settings.examAccessPassword) {
            payload.encryptedSections = await encryptData(
                serializer.stringify(payload.sections),
                settings.examAccessPassword
            )
            payload.sections = []
        }

        const url = createExamSessionLink(payload)
        await navigator.clipboard.writeText(url)
        toast.logPill('Exam link copied to clipboard')
    }
</script>

<svelte:head>
    <title>Exam Builder - Asm Editor</title>
    <meta name="description" content="Create multi-section exams for Asm Editor" />
    <meta property="og:title" content="Exam Builder - Asm Editor" />
    <meta property="og:description" content="Create multi-section exams for Asm Editor" />
</svelte:head>

<DefaultNavbar />
<Page contentStyle={'padding-top: 3.5rem;'}>
    <div class="exam-builder">
        <section class="settings-card">
            <Header type="h2">Overall settings</Header>

            <div class="settings-grid">
                <Input type="text" title="Exam title" bind:value={settings.title} />
                <Input
                    type="password"
                    title="Unlock password"
                    placeholder="Required"
                    bind:value={settings.unlockPassword}
                />
                <Input
                    type="number"
                    title="Time limit (minutes)"
                    placeholder="Leave empty for unlimited"
                    bind:value={settings.timeLimitMinutes}
                />
                <Input
                    type="password"
                    title="Exam access password"
                    placeholder="Optional"
                    bind:value={settings.examAccessPassword}
                />
            </div>

            <Header type="h3">General instructions</Header>
            <div class="markdown-editor-wrapper intro-editor">
                <MarkdownEditor bind:value={settings.instructions} />
            </div>

            <Button
                onClick={createExamUrl}
                hasIcon
                style="margin-left: auto; margin-top: 0.5rem; align-self: flex-start; gap: 0.5rem; padding: 0.5rem;"
            >
                <Icon>
                    <FaDumbbell />
                </Icon>
                Create exam link
            </Button>
        </section>

        <div class="sections-stack">
            {#each sections as section, i (section.id)}
                <section class="section-card">
                    <div class="section-header">
                        <div class="section-heading">
                            <Header type="h2">Section {i + 1}</Header>
                            <p>{sectionTypeLabel(section.type)}</p>
                        </div>

                        <div class="section-controls">
                            <div style="min-width: 12rem;">
                                <Select
                                    value={section.type}
                                    onChange={(e) => {
                                        changeSectionType(
                                            section.id,
                                            (e.target as HTMLSelectElement).value as ExamSectionType
                                        )
                                    }}
                                    options={sectionTypeOptions}
                                />
                            </div>

                            <Button
                                title="Move section up"
                                cssVar="secondary"
                                hasIcon
                                style="padding: 0.6rem;"
                                disabled={isSectionFirst(i)}
                                onClick={() => moveSection(section.id, -1)}
                            >
                                <Icon>
                                    <FaArrowUp />
                                </Icon>
                            </Button>
                            <Button
                                title="Move section down"
                                cssVar="secondary"
                                hasIcon
                                style="padding: 0.6rem;"
                                disabled={isSectionLast(i)}
                                onClick={() => moveSection(section.id, 1)}
                            >
                                <Icon>
                                    <FaArrowDown />
                                </Icon>
                            </Button>
                            <Button
                                title="Delete section"
                                cssVar="secondary"
                                hasIcon
                                style="padding: 0.6rem;"
                                disabled={sections.length <= 1}
                                onClick={() => removeSection(section.id)}
                            >
                                <Icon>
                                    <FaTrash />
                                </Icon>
                            </Button>
                        </div>
                    </div>

                    <div class="section-body">
                        <div class="section-left">
                            <Input type="text" title="Section title" bind:value={section.title} />
                            <Header type="h3">Prompt</Header>
                            <div class="markdown-editor-wrapper prompt-editor">
                                <MarkdownEditor bind:value={section.prompt} />
                            </div>
                        </div>

                        <div class="section-right">
                            {#if section.type === ExamSectionType.OpenQuestion}
                                {@const openSection = section}
                                <Input
                                    type="text"
                                    title="Answer placeholder"
                                    bind:value={openSection.placeholder}
                                />
                            {/if}

                            {#if section.type === ExamSectionType.MultipleChoice}
                                {@const multipleChoiceSection = section as MultipleChoiceSection}
                                <Row align="center" gap="0.6rem">
                                    <input
                                        id={`allow-multiple-${multipleChoiceSection.id}`}
                                        type="checkbox"
                                        checked={multipleChoiceSection.allowMultiple}
                                        onchange={(e) => {
                                            multipleChoiceSection.allowMultiple = (
                                                e.target as HTMLInputElement
                                            ).checked
                                        }}
                                    />
                                    <label for={`allow-multiple-${multipleChoiceSection.id}`}>
                                        Allow multiple selections
                                    </label>
                                </Row>

                                <div class="options-list">
                                    {#each multipleChoiceSection.options as option, optionIndex (option.id)}
                                        <Row gap="0.4rem" align="center">
                                            <Input
                                                wrapperStyle="flex: 1;"
                                                type="text"
                                                title={`Option ${optionIndex + 1}`}
                                                bind:value={option.text}
                                            />
                                            <Button
                                                style="gap: 0.5rem; padding: 0.7rem; margin-top: 1.5rem"
                                                hasIcon
                                                cssVar="secondary"
                                                onClick={() =>
                                                    removeOption(multipleChoiceSection, option.id)}
                                            >
                                                <Icon>
                                                    <FaTrash />
                                                </Icon>
                                            </Button>
                                        </Row>
                                    {/each}
                                </div>

                                <Button
                                    cssVar="secondary"
                                    onClick={() => createOption(multipleChoiceSection)}
                                    hasIcon
                                    style="gap: 0.5rem; padding: 0.5rem; width: 100%"
                                >
                                    <Icon>
                                        <FaPlus />
                                    </Icon>
                                    Add option
                                </Button>
                            {/if}

                            {#if section.type === ExamSectionType.AssemblyCoding}
                                {@const assemblySection = section as AssemblyCodingSection}
                                <Select
                                    title="Assembly language"
                                    wrapperStyle="max-width: 14rem; gap: 0.3rem;"
                                    style="padding: 0.8rem"
                                    value={assemblySection.language}
                                    onChange={(e) => {
                                        onAssemblyLanguageChange(
                                            assemblySection,
                                            (e.target as HTMLSelectElement)
                                                .value as AvailableLanguages
                                        )
                                    }}
                                    options={Object.keys(BASE_CODE) as AvailableLanguages[]}
                                />

                                {#key `${assemblySection.id}-${assemblySection.language}`}
                                    <EmulatorLoader
                                        bind:code={assemblySection.starterCode}
                                        language={assemblySection.language}
                                        settings={{
                                            globalPageElementsPerRow: 4,
                                            globalPageSize: 4 * 8
                                        }}
                                    >
                                        {#snippet children(emulator)}
                                            <InteractiveInstructionEditor
                                                {emulator}
                                                bind:code={assemblySection.starterCode}
                                                bind:testcases={assemblySection.testcases}
                                                embedded={false}
                                                showConsole={false}
                                                showMemory={false}
                                                showTestcases={true}
                                                showPc={false}
                                                showRegisters={false}
                                                showFlags={false}
                                                language={assemblySection.language}
                                            />
                                        {/snippet}
                                        {#snippet loading()}
                                            <Header>Loading emulator...</Header>
                                        {/snippet}
                                    </EmulatorLoader>
                                {/key}
                            {/if}

                            {#if section.type === ExamSectionType.CCoding}
                                {@const cSection = section as CCodingSection}
                                <Input
                                    type="text"
                                    title="Answer placeholder"
                                    bind:value={cSection.placeholder}
                                />

                                <div style="position: relative; display: flex; flex: 1;">
                                    <Editor language="c" bind:code={cSection.starterCode} />
                                </div>
                            {/if}
                        </div>
                    </div>
                </section>
            {/each}
        </div>

        <section class="add-section-card">
            <Header type="h2">Add a new section</Header>
            <Row gap="0.8rem" align="center" wrap>
                <Select
                    wrapperStyle="max-width: 16rem"
                    value={newSectionType}
                    onChange={(e) => {
                        newSectionType = (e.target as HTMLSelectElement).value as ExamSectionType
                    }}
                    options={sectionTypeOptions}
                />
                <Button 
                    onClick={addSection} 
                    hasIcon 
                    style="gap: 0.5rem; padding: 0.5rem;"
                >
                    <Icon>
                        <FaPlus />
                    </Icon>
                    Add section
                </Button>
            </Row>
        </section>
    </div>
</Page>

<style>
    .exam-builder {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        width: min(100%, 62rem);
        margin: 0 auto;
        padding: 0 0.6rem 1.4rem;
    }

    .settings-card,
    .section-card,
    .add-section-card {
        display: flex;
        flex-direction: column;
        border: solid 0.1rem var(--secondary);
        border-radius: 0.6rem;
        color: var(--secondary-text);
        padding: 0.9rem;
        gap: 0.5rem;
    }
    .add-section-card{
        background-color: var(--tertiary);
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
    }

    .settings-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.7rem;
        margin-bottom: 0.8rem;
    }

    .markdown-editor-wrapper {
        display: flex;
        flex-direction: column;
        min-height: 15rem;
        overflow: hidden;
        max-width: calc(100vw - 2rem);
    }
    .intro-editor {
        max-height: 13rem;
        overflow: hidden;
        margin-bottom: 0.8rem;
    }

    .sections-stack {
        display: flex;
        flex-direction: column;
        gap: 0.9rem;
    }

    .section-header {
        display: flex;
        align-items: center;
        border-bottom: solid 0.1rem var(--secondary);
        padding-bottom: 0.8rem;
        justify-content: space-between;
        gap: 0.9rem;
        margin-bottom: 0.8rem;
    }

    .section-heading {
        display: flex;
        gap: 1rem;
        align-items: center;
    }
    .section-heading p {
        font-size: 0.9rem;
        opacity: 0.85;
    }

    .section-controls {
        display: flex;
        align-items: center;
        gap: 0.35rem;
        flex-wrap: wrap;
        justify-content: flex-end;
    }

    .section-body {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        grid-template-rows: auto;
        gap: 0.9rem;
        align-items: start;
    }

    .section-left,
    .section-right {
        display: flex;
        height: 100%;
        flex-direction: column;
        gap: 0.8rem;
    }

    .prompt-editor {
        min-height: 16rem;
        max-height: 24rem;
        overflow: hidden;
    }

    .options-list {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    textarea {
        min-height: 14rem;
        width: 100%;
        background-color: var(--tertiary);
        color: var(--tertiary-text);
        border: solid 0.1rem var(--border-color-dark);
        border-radius: 0.5rem;
        font-family: 'Fira Mono', monospace;
        font-size: 0.95rem;
        padding: 0.8rem;
        resize: vertical;
    }

    :global(.carta-editor) {
        height: 100%;
        flex: 1;
    }

    :global(.carta-theme__default) {
        --border-color: var(--border-color-dark);
        --selection-color: var(--selection-color-dark);
        --focus-outline: var(--focus-outline-dark);
        --hover-color: var(--hover-color-dark);
        --caret-color: var(--caret-color-dark);
        --text-color: var(--text-color-dark);
    }

    @media (max-width: 980px) {
        .settings-grid,
        .section-body {
            grid-template-columns: minmax(0, 1fr);
        }
    }
</style>
