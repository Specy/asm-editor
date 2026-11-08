<script lang="ts">
    import { languageLabel } from '#lib/languages/languageLabel.ts'
    import InteractiveInstructionEditor from '#cmp/shared/InteractiveInstructionEditor.svelte'
    import Page from '#cmp/shared/layout/Page.svelte'
    import DefaultNavbar from '#cmp/shared/layout/DefaultNavbar.svelte'
    import Select from '#cmp/shared/input/Select.svelte'
    import { BASE_CODE } from '#lib/Config.ts'
    import Header from '#cmp/shared/layout/Header.svelte'
    import Card from '#cmp/shared/layout/Card.svelte'
    import Spinner from '#cmp/shared/misc/Spinner.svelte'
    import EmulatorLoader from '#cmp/shared/providers/EmulatorLoader.svelte'
    import Row from '#cmp/shared/layout/Row.svelte'
    import MarkdownEditor from '#cmp/shared/markdown/MarkdownEditor.svelte'
    import Button from '#cmp/shared/button/Button.svelte'
    import IconButton from '#cmp/shared/button/IconButton.svelte'
    import Switch from '#cmp/shared/input/Switch.svelte'
    import TextField from '#cmp/shared/input/TextField.svelte'
    import { copyText, encryptData, makeHash } from '#lib/utils.ts'
    import { toast } from '#stores/toastStore.ts'
    import FaDumbbell from '~icons/fa-solid/dumbbell'
    import FaPlus from '~icons/fa-solid/plus'
    import FaTrash from '~icons/fa-solid/trash'
    import FaArrowUp from '~icons/fa-solid/arrow-up'
    import FaArrowDown from '~icons/fa-solid/arrow-down'
    import Icon from '#cmp/shared/layout/Icon.svelte'
    import { tooltip } from '#cmp/shared/floating/tooltip.svelte.ts'
    import type { AvailableLanguages } from '#lib/Project.svelte.ts'
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
    } from '#lib/exam.ts'
    import { serializer } from '#lib/json.ts'
    import Editor from '#cmp/specific/project/Editor.svelte'

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
    const sectionTypeOptions: Array<{ key: ExamSectionType; value: ExamSectionType }> =
        Object.values(ExamSectionType).map((value) => ({ key: value, value }))
    const assemblyLanguageOptions: Array<{
        key: string
        value: AvailableLanguages
    }> = (Object.keys(BASE_CODE) as AvailableLanguages[]).map((value) => ({
        key: languageLabel(value),
        value
    }))

    let sections = $state([
        createDefaultExamSection(ExamSectionType.AssemblyCoding)
    ] as ExamSection[])
    let newSectionType = $state(ExamSectionType.AssemblyCoding)
    /** The exam link just made, while the browser would not copy it: it is nowhere else to copy. */
    let uncopiedExamUrl = $state('')

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
        uncopiedExamUrl = (await copyText(url, 'Exam link')) ? '' : url
    }
</script>

<svelte:head>
    <title>Exam builder - ASM Editor</title>
    <meta name="description" content="Create multi-section exams for ASM Editor" />
    <meta property="og:title" content="Exam builder - ASM Editor" />
    <meta property="og:description" content="Create multi-section exams for ASM Editor" />
</svelte:head>

<DefaultNavbar />
<!-- the column of the index pages, its title at their left edge and height (design-system.md, D8) -->
<Page hasNavbar cropped="70rem" contentStyle="padding: 1rem;">
    <div class="title-room">
        <Header>Exam builder</Header>
    </div>
    <div class="exam-builder">
        <Card element="section" class="settings-card" padding="0.9rem" gap="0.5rem">
            <div class="settings-grid">
                <TextField type="text" label="Exam title" bind:value={settings.title} />
                <TextField
                    type="password"
                    label="Unlock password"
                    placeholder="Required"
                    bind:value={settings.unlockPassword}
                />
                <TextField
                    type="number"
                    label="Time limit (minutes)"
                    placeholder="Leave empty for unlimited"
                    bind:value={settings.timeLimitMinutes}
                />
                <TextField
                    type="password"
                    label="Exam access password"
                    placeholder="Optional"
                    bind:value={settings.examAccessPassword}
                />
            </div>

            <Header type="h2" style="font-size: var(--fs-lead)">General instructions</Header>
            <div class="markdown-editor-wrapper intro-editor">
                <MarkdownEditor bind:value={settings.instructions} />
            </div>
            <div class="exam-notes">
                <p>
                    When people open the exam, they enter their name and the exam access password.
                    The page then gives each of them a random code that identifies them, which you
                    can save. Reloading the page or resetting the website gives a new code.
                </p>
                <p>
                    Once they are ready to start, the page goes full screen. Leaving full screen or
                    changing tab blocks the editor until the unlock password is entered, so you know
                    that they left the exam, by accident or on purpose.
                </p>
            </div>

            <Button
                onClick={createExamUrl}
                style="margin-left: auto; margin-top: 0.5rem; align-self: flex-start; gap: 0.5rem;"
            >
                <Icon>
                    <FaDumbbell />
                </Icon>
                Create exam link
            </Button>
            {#if uncopiedExamUrl}
                <p>The browser did not let the page copy the exam link. Copy it from here:</p>
                <textarea class="exam-link" aria-label="Exam link" readonly value={uncopiedExamUrl}
                ></textarea>
            {/if}
        </Card>

        <div class="sections-stack">
            {#each sections as section, i (section.id)}
                <Card element="section" class="section-card" padding="0.9rem" gap="0.5rem">
                    <div class="section-header">
                        <div class="section-heading">
                            <Header type="h2" style="font-size: var(--fs-h3)">
                                Section {i + 1}
                            </Header>
                            <p>{sectionTypeLabel(section.type)}</p>
                        </div>

                        <div class="section-controls">
                            <div class="type-select">
                                <Select
                                    value={section.type}
                                    onChange={(type) => changeSectionType(section.id, type)}
                                    options={sectionTypeOptions}
                                />
                            </div>

                            <IconButton
                                {@attach tooltip('Move section up')}
                                size="lg"
                                label="Move section up"
                                disabled={isSectionFirst(i)}
                                onClick={() => moveSection(section.id, -1)}
                            >
                                <Icon>
                                    <FaArrowUp />
                                </Icon>
                            </IconButton>
                            <IconButton
                                {@attach tooltip('Move section down')}
                                size="lg"
                                label="Move section down"
                                disabled={isSectionLast(i)}
                                onClick={() => moveSection(section.id, 1)}
                            >
                                <Icon>
                                    <FaArrowDown />
                                </Icon>
                            </IconButton>
                            <IconButton
                                {@attach tooltip('Delete section')}
                                size="lg"
                                label="Delete section"
                                disabled={sections.length <= 1}
                                onClick={() => removeSection(section.id)}
                            >
                                <Icon>
                                    <FaTrash />
                                </Icon>
                            </IconButton>
                        </div>
                    </div>

                    <div class="section-body">
                        <div class="section-left">
                            <TextField
                                type="text"
                                label="Section title"
                                bind:value={section.title}
                            />
                            <Header type="h3" style="font-size: var(--fs-lead)">Prompt</Header>
                            <div class="markdown-editor-wrapper prompt-editor">
                                <MarkdownEditor bind:value={section.prompt} />
                            </div>
                        </div>

                        <div class="section-right">
                            {#if section.type === ExamSectionType.OpenQuestion}
                                {@const openSection = section}
                                <TextField
                                    type="text"
                                    label="Answer placeholder"
                                    bind:value={openSection.placeholder}
                                />
                            {/if}

                            {#if section.type === ExamSectionType.MultipleChoice}
                                {@const multipleChoiceSection = section as MultipleChoiceSection}
                                <Row align="center" gap="0.6rem">
                                    <Switch
                                        id={`allow-multiple-${multipleChoiceSection.id}`}
                                        bind:checked={multipleChoiceSection.allowMultiple}
                                    />
                                    <label for={`allow-multiple-${multipleChoiceSection.id}`}>
                                        Allow multiple selections
                                    </label>
                                </Row>

                                <div class="options-list">
                                    {#each multipleChoiceSection.options as option, optionIndex (option.id)}
                                        <Row gap="0.4rem" align="center">
                                            <TextField
                                                wrapperStyle="flex: 1;"
                                                type="text"
                                                label={`Option ${optionIndex + 1}`}
                                                bind:value={option.text}
                                            />
                                            <IconButton
                                                size="lg"
                                                label={`Delete option ${optionIndex + 1}`}
                                                style="margin-top: 1.5rem"
                                                onClick={() =>
                                                    removeOption(multipleChoiceSection, option.id)}
                                            >
                                                <Icon>
                                                    <FaTrash />
                                                </Icon>
                                            </IconButton>
                                        </Row>
                                    {/each}
                                </div>

                                <Button
                                    kind="secondary"
                                    onClick={() => createOption(multipleChoiceSection)}
                                    style="gap: 0.5rem; width: 100%"
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
                                    title="Instruction Set"
                                    wrapperStyle="max-width: 14rem; gap: 0.3rem;"
                                    style="padding: 0.8rem"
                                    value={assemblySection.language}
                                    onChange={(language) =>
                                        onAssemblyLanguageChange(assemblySection, language)}
                                    options={assemblyLanguageOptions}
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
                                            <Spinner size="lg" label="Loading emulator…" />
                                        {/snippet}
                                    </EmulatorLoader>
                                {/key}
                            {/if}

                            {#if section.type === ExamSectionType.CCoding}
                                {@const cSection = section as CCodingSection}
                                <TextField
                                    type="text"
                                    label="Answer placeholder"
                                    bind:value={cSection.placeholder}
                                />

                                <div class="c-starter">
                                    <Editor language="c" bind:code={cSection.starterCode} />
                                </div>
                            {/if}
                        </div>
                    </div>
                </Card>
            {/each}
        </div>

        <Card element="section" class="add-section-card" padding="0.9rem" gap="0.5rem">
            <Header type="h2" style="font-size: var(--fs-h3)">Add a new section</Header>
            <Row gap="0.8rem" align="center" wrap>
                <Select
                    wrapperStyle="max-width: 16rem"
                    value={newSectionType}
                    onChange={(type) => (newSectionType = type)}
                    options={sectionTypeOptions}
                />
                <Button onClick={addSection} style="gap: 0.5rem;">
                    <Icon>
                        <FaPlus />
                    </Icon>
                    Add section
                </Button>
            </Row>
        </Card>
    </div>
</Page>

<style>
    /* the title starts where the other index pages' titles do, as /changelog's (S4-06) */
    .title-room {
        padding-top: 1.5rem;
    }
    @media (max-width: 600px) {
        .title-room {
            padding-top: 0.75rem;
        }
    }

    .exam-builder {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        padding-bottom: 1.4rem;
    }

    /* Cards (shared/layout/Card.svelte), which draw their surface, edge and corners */
    .exam-builder :global(.add-section-card) {
        flex-direction: row;
        flex-wrap: wrap;
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

    .exam-notes {
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
        max-width: 65ch;
    }

    .exam-link {
        width: 100%;
        min-height: 5rem;
        resize: vertical;
        background-color: var(--tertiary);
        color: var(--tertiary-text);
        border: none;
        border-radius: var(--r-control);
        padding: 0.5rem;
        font: var(--fs-small) / 1.45 var(--font-mono);
        overflow-wrap: anywhere;
    }

    .sections-stack {
        display: flex;
        flex-direction: column;
        gap: 0.9rem;
    }

    /* the controls go under the title when the two do not fit on one line, as on a phone */
    .section-header {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        border-bottom: 1px solid var(--line);
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
        font-size: var(--fs-small);
        color: var(--text-muted);
    }

    /* the whole line when they have one of their own, the type list giving way to the buttons */
    .section-controls {
        display: flex;
        flex: 1 1 auto;
        align-items: center;
        gap: 0.35rem;
        justify-content: flex-end;
    }

    .type-select {
        flex: 0 1 12rem;
        min-width: 0;
    }

    /* the C starter code in the card's edge, as the editors in the Workbench are */
    .c-starter {
        position: relative;
        display: flex;
        flex: 1;
        min-height: 15rem;
        border: var(--wb-card-edge);
        border-radius: var(--wb-radius);
        overflow: hidden;
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

    @media (max-width: 980px) {
        .settings-grid,
        .section-body {
            grid-template-columns: minmax(0, 1fr);
        }
    }
</style>
