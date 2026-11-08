<script lang="ts">
    import { tick } from 'svelte'
    import { languageLabel } from '#lib/languages/languageLabel.ts'
    import { languageAccent } from '#lib/languages/languageColors.ts'
    import InteractiveInstructionEditor from '#cmp/shared/InteractiveInstructionEditor.svelte'
    import Page from '#cmp/shared/layout/Page.svelte'
    import DefaultNavbar from '#cmp/shared/layout/DefaultNavbar.svelte'
    import Select from '#cmp/shared/input/Select.svelte'
    import SegmentedControl from '#cmp/shared/input/SegmentedControl.svelte'
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
    import ExamOutline from '#cmp/specific/exam/ExamOutline.svelte'
    import {
        DETAILS,
        INSTRUCTIONS,
        SECTION_TYPES,
        sectionTypeLabel
    } from '#cmp/specific/exam/examBuilder.ts'
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
    const sectionTypeOptions = SECTION_TYPES.map((value) => ({
        key: sectionTypeLabel(value),
        value
    }))
    /** The instruction sets a section can be written in, in the create page's order, each marked
     *  with the colour of its own theme as the create page marks them. */
    const LANGUAGES = (
        ['M68K', 'MIPS', 'RISC-V', 'RISC-V-64', 'X86', 'Z80'] as AvailableLanguages[]
    ).filter((language) => language in BASE_CODE)
    const languageOptions = LANGUAGES.map((value) => ({
        id: value,
        label: languageLabel(value),
        iconColor: languageAccent(value)
    }))

    let sections = $state([
        createDefaultExamSection(ExamSectionType.AssemblyCoding)
    ] as ExamSection[])
    /** The part the card beside the outline shows: the Details, the general instructions, or a
     *  section by its id. */
    let current = $state<string>(DETAILS)
    /** The exam link just made, while the browser would not copy it: it is nowhere else to copy. */
    let uncopiedExamUrl = $state('')
    let unlockPasswordField = $state<HTMLInputElement>()

    function addSection(type: ExamSectionType) {
        const section = createDefaultExamSection(type)
        sections = [...sections, section]
        current = section.id
    }

    /** Removes a section and shows the one that took its place, or the new last one. */
    function removeSection(sectionId: string) {
        if (sections.length <= 1) {
            toast.error('An exam must have at least one section.')
            return
        }
        const index = sectionIndex(sectionId)
        sections = sections.filter((section) => section.id !== sectionId)
        if (current === sectionId) current = sections[Math.min(index, sections.length - 1)].id
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

    function onAssemblyLanguageChange(section: AssemblyCodingSection, id: string) {
        const language = LANGUAGES.find((value) => value === id)
        if (!language) return
        if (section.starterCode === BASE_CODE[section.language]) {
            section.starterCode = BASE_CODE[language]
        }
        section.language = language
    }

    async function createExamUrl() {
        if (!settings.unlockPassword.trim()) {
            toast.error('Please provide an unlock password before creating the exam.')
            //the field may be in a part not shown: show it, and put the cursor in it
            current = DETAILS
            await tick()
            unlockPasswordField?.focus()
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
<Page hasNavbar contentStyle="padding: 1rem;">
    <!-- the picked part's Card in the middle of the page, as a documentation page's column is, the
         title over it and the outline of the exam in the room at its left -->
    <div class="exam-builder">
        <div class="title-room">
            <Header>Exam builder</Header>
        </div>
        <ExamOutline
            {sections}
            {current}
            onPick={(part) => (current = part)}
            onMove={moveSection}
            onAdd={addSection}
        >
            {#snippet footer()}
                <Button onClick={createExamUrl} style="gap: 0.5rem;">
                    <Icon>
                        <FaDumbbell />
                    </Icon>
                    Create exam link
                </Button>
                {#if uncopiedExamUrl}
                    <p class="link-note">
                        The browser did not let the page copy the exam link. Copy it from here:
                    </p>
                    <textarea
                        class="exam-link"
                        aria-label="Exam link"
                        readonly
                        value={uncopiedExamUrl}></textarea>
                {/if}
            {/snippet}
        </ExamOutline>

        <Card element="section" class="part-card" padding="0" aria-labelledby="exam-part-title">
            {#if current === DETAILS}
                <header class="part-head">
                    <h2 id="exam-part-title" class="part-title">Details</h2>
                </header>
                <div class="part-body">
                    <TextField type="text" label="Exam title" bind:value={settings.title} />
                    <div class="pair">
                        <TextField
                            type="password"
                            label="Unlock password"
                            placeholder="Required"
                            bind:el={unlockPasswordField}
                            bind:value={settings.unlockPassword}
                        />
                        <TextField
                            type="password"
                            label="Exam access password"
                            placeholder="Optional"
                            bind:value={settings.examAccessPassword}
                        />
                        <TextField
                            type="number"
                            label="Time limit (minutes)"
                            placeholder="Leave empty for unlimited"
                            bind:value={settings.timeLimitMinutes}
                        />
                    </div>
                    <div class="exam-notes">
                        <p>
                            When people open the exam, they enter their name and the exam access
                            password. The page then gives each of them a random code that identifies
                            them, which you can save. Reloading the page or resetting the website
                            gives a new code.
                        </p>
                        <p>
                            Once they are ready to start, the page goes full screen. Leaving full
                            screen or changing tab blocks the editor until the unlock password is
                            entered, so you know that they left the exam, by accident or on purpose.
                        </p>
                    </div>
                </div>
            {:else if current === INSTRUCTIONS}
                <header class="part-head">
                    <h2 id="exam-part-title" class="part-title">General instructions</h2>
                </header>
                <div class="part-body">
                    <p class="part-hint">
                        Shown before the first section. Left empty, the exam opens on the first
                        section.
                    </p>
                    <div class="markdown-field instructions">
                        <MarkdownEditor layout="switch" bind:value={settings.instructions} />
                    </div>
                </div>
            {:else}
                {#each sections as section, i (section.id)}
                    {#if section.id === current}
                        <!-- the same heading as the other parts', with the section's title and
                             type beside its number -->
                        <header class="part-head">
                            <h2 id="exam-part-title" class="part-title">Section {i + 1}</h2>
                            <div class="head-fields">
                                <div class="head-title">
                                    <TextField
                                        type="text"
                                        aria-label="Section title"
                                        placeholder="Untitled"
                                        bind:value={section.title}
                                    />
                                </div>
                                <div class="head-type">
                                    <Select
                                        ariaLabel="Section type"
                                        value={section.type}
                                        onChange={(type) => changeSectionType(section.id, type)}
                                        options={sectionTypeOptions}
                                    />
                                </div>
                            </div>
                            <!-- on a phone the outline's arrows are in its Select's place -->
                            <div class="phone-moves">
                                <IconButton
                                    {@attach tooltip('Move section up')}
                                    label="Move section up"
                                    disabled={i === 0}
                                    onClick={() => moveSection(section.id, -1)}
                                >
                                    <FaArrowUp />
                                </IconButton>
                                <IconButton
                                    {@attach tooltip('Move section down')}
                                    label="Move section down"
                                    disabled={i === sections.length - 1}
                                    onClick={() => moveSection(section.id, 1)}
                                >
                                    <FaArrowDown />
                                </IconButton>
                            </div>
                        </header>

                        <div class="part-body">
                            {#if section.type === ExamSectionType.AssemblyCoding}
                                {@const assemblySection = section as AssemblyCodingSection}
                                <div class="field language-field">
                                    <span aria-hidden="true">Instruction set</span>
                                    <SegmentedControl
                                        wrap
                                        size="md"
                                        ariaLabel="Instruction set"
                                        options={languageOptions}
                                        selected={assemblySection.language}
                                        onSelect={(id) =>
                                            onAssemblyLanguageChange(assemblySection, id)}
                                    >
                                        {#snippet face(option)}
                                            <span
                                                class="language-square"
                                                style:background-color={option.iconColor}
                                                aria-hidden="true"
                                            ></span>
                                            {option.label}
                                        {/snippet}
                                    </SegmentedControl>
                                </div>
                            {/if}

                            <div class="field">
                                <h3 class="field-label">Prompt</h3>
                                <div class="markdown-field prompt">
                                    <MarkdownEditor layout="switch" bind:value={section.prompt} />
                                </div>
                            </div>

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
                                <div class="field">
                                    <h3 class="field-label">Options</h3>
                                    <Row align="center" gap="0.6rem">
                                        <Switch
                                            id={`allow-multiple-${multipleChoiceSection.id}`}
                                            bind:checked={multipleChoiceSection.allowMultiple}
                                        />
                                        <label for={`allow-multiple-${multipleChoiceSection.id}`}>
                                            Allow multiple selections
                                        </label>
                                    </Row>
                                </div>
                                <div class="options-list">
                                    {#each multipleChoiceSection.options as option, optionIndex (option.id)}
                                        <div class="option">
                                            <TextField
                                                wrapperStyle="flex: 1;"
                                                type="text"
                                                label={`Option ${optionIndex + 1}`}
                                                bind:value={option.text}
                                            />
                                            <IconButton
                                                size="lg"
                                                label={`Delete option ${optionIndex + 1}`}
                                                {@attach tooltip('Delete option')}
                                                onClick={() =>
                                                    removeOption(multipleChoiceSection, option.id)}
                                            >
                                                <Icon>
                                                    <FaTrash />
                                                </Icon>
                                            </IconButton>
                                        </div>
                                    {/each}
                                    <Button
                                        kind="secondary"
                                        onClick={() => createOption(multipleChoiceSection)}
                                        style="gap: 0.5rem;"
                                    >
                                        <Icon size="small">
                                            <FaPlus />
                                        </Icon>
                                        Add option
                                    </Button>
                                </div>
                            {/if}

                            {#if section.type === ExamSectionType.AssemblyCoding}
                                {@const assemblySection = section as AssemblyCodingSection}
                                <div class="field">
                                    <h3 class="field-label">Starting code</h3>
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
                                </div>
                            {/if}

                            {#if section.type === ExamSectionType.CCoding}
                                {@const cSection = section as CCodingSection}
                                <TextField
                                    type="text"
                                    label="Answer placeholder"
                                    bind:value={cSection.placeholder}
                                />
                                <div class="field">
                                    <h3 class="field-label">Starting code</h3>
                                    <div class="c-starter">
                                        <Editor language="c" bind:code={cSection.starterCode} />
                                    </div>
                                </div>
                            {/if}
                        </div>

                        <footer class="part-foot">
                            <Button
                                kind="secondary"
                                disabled={sections.length <= 1}
                                onClick={() => removeSection(section.id)}
                                style="gap: 0.5rem;"
                            >
                                <Icon size="small">
                                    <FaTrash />
                                </Icon>
                                Delete section
                            </Button>
                        </footer>
                    {/if}
                {/each}
            {/if}
        </Card>
    </div>
</Page>

<style lang="scss">
    /* the picked part's Card in the middle of the page and the title over it, the outline in the
       room at its left, 1rem from it. The first column never gets narrower than the outline, so
       where the room at the Card's left is too small the Card moves right of the middle, until it
       sits beside the outline and gets narrower with the window (the third column is then empty) */
    .exam-builder {
        --outline-width: 16rem;
        --outline-gap: 1rem;
        display: grid;
        grid-template-columns:
            minmax(calc(var(--outline-width) + var(--outline-gap)), 1fr)
            minmax(0, 52rem)
            minmax(0, 1fr);
        grid-template-areas:
            '. title .'
            'outline card .';
        align-items: start;
        padding-bottom: 1.4rem;
    }
    /* the title over the Card, at the height of the other index pages' titles, as /changelog's
       (S4-06) */
    .title-room {
        grid-area: title;
        min-width: 0;
        padding-top: 1.5rem;
    }
    @media (max-width: 600px) {
        .title-room {
            padding-top: 0.75rem;
        }
    }
    .exam-builder > :global(.exam-outline) {
        grid-area: outline;
        justify-self: end;
        width: var(--outline-width);
        margin-right: var(--outline-gap);
    }
    .exam-builder > :global(.part-card) {
        grid-area: card;
    }

    /* the Card's heading over a rule, its fields, and a rule over its actions, as the create
       page's Card draws its form: the part's name, and a section's title and type beside it. The
       band is as tall for every part; a section's fields fill it but for a little room above, below
       and at their right, the same all three ways, which makes them a form's fields' height */
    .part-head {
        --head-height: 3.25rem;
        --head-room: 0.4375rem;
        display: flex;
        align-items: center;
        gap: 0.75rem;
        min-height: var(--head-height);
        padding: var(--head-room) var(--head-room) var(--head-room) 1rem;
        border-bottom: 1px solid var(--line);
    }
    .part-title {
        flex: none;
        margin: 0;
        font: 600 var(--fs-lead) / 1.3 var(--font-ui);
    }
    .head-fields {
        display: flex;
        flex: 1;
        flex-wrap: wrap;
        gap: 0.5rem;
        min-width: 0;
    }
    .head-title {
        display: flex;
        flex: 1 1 8rem;
        min-width: 0;
    }
    .head-title > :global(.text-field) {
        flex: 1;
    }
    .head-title > :global(.text-field),
    .head-type :global(.control) {
        height: calc(var(--head-height) - 2 * var(--head-room) - 1px);
    }
    /* as wide for every type, so the title field keeps its width when the type changes */
    .head-type {
        flex: none;
        width: 12rem;
    }
    .part-body {
        container-type: inline-size;
        display: flex;
        flex-direction: column;
        gap: 1rem;
        padding: 1rem;
    }
    .part-foot {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
        padding: 0.75rem 1rem;
        border-top: 1px solid var(--line);
    }
    .part-hint {
        margin: 0;
        color: var(--text-muted);
    }

    /* two fields side by side, one under the other where the Card is narrow */
    .pair {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 1rem;
    }
    @container (max-width: 34rem) {
        .pair {
            grid-template-columns: minmax(0, 1fr);
        }
    }

    /* a label over its control, as the shared fields draw theirs */
    .field {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        min-width: 0;
    }
    .field-label {
        margin: 0;
        font: inherit;
    }

    /* the instruction sets on one row while they fit, then in rows of three, then of two, so that
       no name is cut, as on the create page */
    @container (max-width: 34rem) {
        .language-field {
            --segmented-columns: 3;
        }
    }
    @container (max-width: 19rem) {
        .language-field {
            --segmented-columns: 2;
        }
    }
    /* drawn as the create page and the home page's bar draw their squares */
    .language-square {
        flex: none;
        width: 0.5rem;
        height: 0.5rem;
        margin-right: 0.5rem;
        border-radius: 2px;
    }

    .markdown-field {
        display: flex;
        flex-direction: column;
        min-width: 0;
    }
    .markdown-field.instructions {
        height: 26rem;
    }
    .markdown-field.prompt {
        height: 18rem;
    }

    .exam-notes {
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
        max-width: 65ch;
        color: var(--text-muted);
    }
    .exam-notes p {
        margin: 0;
    }

    .link-note {
        margin: 0;
        font-size: var(--fs-small);
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

    .options-list {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 0.5rem;
    }
    .option {
        display: flex;
        align-items: flex-end;
        gap: 0.4rem;
        width: 100%;
    }

    .phone-moves {
        display: none;
        gap: 0.2rem;
    }

    /* a phone: the title, the outline (ExamOutline.svelte) and the part one under the other, the
       arrows in the part's heading beside its name, and a section's title and type on a line of
       their own under them */
    @media (max-width: 720px) {
        .exam-builder {
            grid-template-columns: minmax(0, 1fr);
            grid-template-areas:
                'title'
                'outline'
                'card';
        }
        .exam-builder > :global(.exam-outline) {
            justify-self: stretch;
            width: auto;
            margin: 0 0 1rem;
        }
        .part-head {
            flex-wrap: wrap;
            row-gap: 0.5rem;
        }
        .phone-moves {
            display: flex;
            margin-left: auto;
        }
        .head-fields {
            order: 1;
            flex-basis: 100%;
        }
        .part-head {
            padding-left: 0.75rem;
        }
        .part-foot {
            padding-inline: 0.75rem;
        }
        .part-body {
            padding: 0.75rem;
        }
        .markdown-field.instructions {
            height: 20rem;
        }
        .markdown-field.prompt {
            height: 16rem;
        }
    }
</style>
