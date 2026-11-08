<script lang="ts">
    import { tick } from 'svelte'
    import { LANGUAGE_ORDER } from '#lib/languages/languageCapabilities.ts'
    import InteractiveInstructionEditor from '#cmp/shared/InteractiveInstructionEditor.svelte'
    import Page from '#cmp/shared/layout/Page.svelte'
    import DefaultNavbar from '#cmp/shared/layout/DefaultNavbar.svelte'
    import Select from '#cmp/shared/input/Select.svelte'
    import InstructionSetPicker from '#cmp/shared/input/InstructionSetPicker.svelte'
    import { BASE_CODE } from '#lib/Config.ts'
    import Header from '#cmp/shared/layout/Header.svelte'
    import Card from '#cmp/shared/layout/Card.svelte'
    import Spinner from '#cmp/shared/misc/Spinner.svelte'
    import EmulatorLoader from '#cmp/shared/providers/EmulatorLoader.svelte'
    import Row from '#cmp/shared/layout/Row.svelte'
    import MarkdownEditor from '#cmp/shared/markdown/MarkdownEditor.svelte'
    import Button from '#cmp/shared/button/Button.svelte'
    import CopyButton from '#cmp/shared/button/CopyButton.svelte'
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
    import FaPlus from '~icons/fa-solid/plus'
    import FaTrash from '~icons/fa-solid/trash'
    import FaArrowUp from '~icons/fa-solid/arrow-up'
    import FaArrowDown from '~icons/fa-solid/arrow-down'
    import FaArrowRight from '~icons/fa-solid/arrow-right'
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

    //the title starts empty, its placeholder saying what an exam left untitled is called
    let settings: Settings = $state({
        title: '',
        instructions: '',
        unlockPassword: '',
        examAccessPassword: '',
        timeLimitMinutes: ''
    })
    const sectionTypeOptions = SECTION_TYPES.map((value) => ({
        key: sectionTypeLabel(value),
        value
    }))
    /** The instruction sets a section can be written in, as the create page offers them. */
    const LANGUAGES = LANGUAGE_ORDER.filter((language) => language in BASE_CODE)

    let sections = $state([
        createDefaultExamSection(ExamSectionType.AssemblyCoding)
    ] as ExamSection[])
    /** The part the card beside the outline shows: the Details, the general instructions, or a
     *  section by its id. */
    let current = $state<string>(DETAILS)
    /** The section shown, when the part shown is one. */
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

    function onAssemblyLanguageChange(
        section: AssemblyCodingSection,
        language: AvailableLanguages
    ) {
        if (section.language === language) return
        if (section.starterCode === BASE_CODE[section.language]) {
            section.starterCode = BASE_CODE[language]
        }
        section.language = language
    }

    /** Copies the exam's link, answering whether it reached the clipboard. */
    async function createExamUrl(): Promise<boolean> {
        if (!settings.unlockPassword.trim()) {
            toast.error('Please provide an unlock password before creating the exam.')
            //the field may be in a part not shown: show it, and put the cursor in it
            current = DETAILS
            await tick()
            unlockPasswordField?.focus()
            return false
        }

        if (sections.length === 0) {
            toast.error('Please add at least one section before creating the exam.')
            return false
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
        const copied = await copyText(url, 'Exam link')
        uncopiedExamUrl = copied ? '' : url
        return copied
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
        <!-- Create exam link at the outline's foot, under Add section (owner, 2026-11-08: the part
             Card has no footer), with the link to copy by hand over it when the browser would not
             copy it -->
        <ExamOutline
            {sections}
            {current}
            onPick={(part) => (current = part)}
            onMove={moveSection}
            onAdd={addSection}
        >
            {#snippet footer()}
                {#if uncopiedExamUrl}
                    <div class="link-fallback">
                        <p class="link-note">
                            The browser did not let the page copy the exam link. Copy it from here:
                        </p>
                        <textarea
                            class="exam-link"
                            aria-label="Exam link"
                            readonly
                            value={uncopiedExamUrl}></textarea>
                    </div>
                {/if}
                <CopyButton copy={createExamUrl}>
                    Create exam link
                    <Icon size="caption"><FaArrowRight /></Icon>
                </CopyButton>
            {/snippet}
        </ExamOutline>

        <!-- the create page's Card: its sections under header bands, the first band the part's
             name (a section's with Delete section at its right) -->
        <Card element="section" class="part-card" aria-labelledby="exam-part-title">
            {#if current === DETAILS}
                <header class="band first">
                    <h2 id="exam-part-title">Details</h2>
                </header>
                <div class="section">
                    <div class="pair-room">
                        <div class="pair narrow-second">
                            <TextField
                                type="text"
                                label="Exam title"
                                hint="Optional"
                                placeholder="Untitled exam"
                                bind:value={settings.title}
                            />
                            <TextField
                                type="number"
                                label="Time limit (minutes)"
                                hint="Optional"
                                placeholder="No limit"
                                bind:value={settings.timeLimitMinutes}
                            />
                        </div>
                    </div>
                </div>
                <h3 class="band">Passwords</h3>
                <div class="section">
                    <div class="pair-room">
                        <div class="pair">
                            <TextField
                                concealed
                                label="Unlock password"
                                hint="Required"
                                aria-required="true"
                                placeholder="Known only to you"
                                bind:el={unlockPasswordField}
                                bind:value={settings.unlockPassword}
                            />
                            <TextField
                                concealed
                                label="Exam access password"
                                hint="Optional"
                                placeholder="Given to everyone taking it"
                                bind:value={settings.examAccessPassword}
                            />
                        </div>
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
                <header class="band first">
                    <h2 id="exam-part-title">General instructions</h2>
                </header>
                <div class="section">
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
                        <header class="band first">
                            <h2 id="exam-part-title">Section {i + 1}</h2>
                            <Button
                                kind="ghost"
                                size="sm"
                                class="delete-section"
                                disabled={sections.length <= 1}
                                onClick={() => removeSection(section.id)}
                            >
                                Delete section
                            </Button>
                            <!-- on a phone the outline's arrows are in its Select's place -->
                            <div class="phone-moves">
                                <IconButton
                                    size="sm"
                                    {@attach tooltip('Move section up')}
                                    label="Move section up"
                                    disabled={i === 0}
                                    onClick={() => moveSection(section.id, -1)}
                                >
                                    <FaArrowUp />
                                </IconButton>
                                <IconButton
                                    size="sm"
                                    {@attach tooltip('Move section down')}
                                    label="Move section down"
                                    disabled={i === sections.length - 1}
                                    onClick={() => moveSection(section.id, 1)}
                                >
                                    <FaArrowDown />
                                </IconButton>
                            </div>
                        </header>
                        <div class="section">
                            <div class="pair-room">
                                <div class="pair narrow-second">
                                    <TextField
                                        type="text"
                                        label="Title"
                                        hint="Optional"
                                        placeholder="Untitled"
                                        bind:value={section.title}
                                    />
                                    <Select
                                        title="Type"
                                        value={section.type}
                                        onChange={(type) => changeSectionType(section.id, type)}
                                        options={sectionTypeOptions}
                                    />
                                </div>
                            </div>
                        </div>

                        {#if section.type === ExamSectionType.AssemblyCoding}
                            {@const assemblySection = section as AssemblyCodingSection}
                            <h3 class="band">Instruction set</h3>
                            <div class="section">
                                <!-- the tiles alone, without the create page's line on the
                                     set picked (owner, 2026-11-08) -->
                                <InstructionSetPicker
                                    selected={assemblySection.language}
                                    languages={LANGUAGES}
                                    description={false}
                                    onSelect={(language) =>
                                        onAssemblyLanguageChange(assemblySection, language)}
                                />
                            </div>
                        {/if}

                        <h3 class="band">Prompt</h3>
                        <div class="section">
                            <div class="markdown-field prompt">
                                <MarkdownEditor layout="switch" bind:value={section.prompt} />
                            </div>
                        </div>

                        {#if section.type === ExamSectionType.OpenQuestion}
                            {@const openSection = section}
                            <h3 class="band">Answer</h3>
                            <div class="section">
                                <TextField
                                    type="text"
                                    label="Placeholder"
                                    hint="Optional"
                                    placeholder="Shown in the empty answer box"
                                    bind:value={openSection.placeholder}
                                />
                            </div>
                        {/if}

                        {#if section.type === ExamSectionType.MultipleChoice}
                            {@const multipleChoiceSection = section as MultipleChoiceSection}
                            <h3 class="band">Options</h3>
                            <div class="section">
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
                                        <!-- the option's name over its field and its delete
                                             button, joined as one control -->
                                        <div class="option">
                                            <label for={`option-${option.id}`}>
                                                Option {optionIndex + 1}
                                            </label>
                                            <div class="option-group">
                                                <TextField
                                                    id={`option-${option.id}`}
                                                    class="option-text"
                                                    type="text"
                                                    placeholder="What this option says"
                                                    bind:value={option.text}
                                                />
                                                <IconButton
                                                    class="option-delete"
                                                    label={`Delete option ${optionIndex + 1}`}
                                                    {@attach tooltip('Delete option')}
                                                    onClick={() =>
                                                        removeOption(
                                                            multipleChoiceSection,
                                                            option.id
                                                        )}
                                                >
                                                    <Icon>
                                                        <FaTrash />
                                                    </Icon>
                                                </IconButton>
                                            </div>
                                        </div>
                                    {/each}
                                    <Button
                                        kind="secondary"
                                        onClick={() => createOption(multipleChoiceSection)}
                                    >
                                        <Icon size="small">
                                            <FaPlus />
                                        </Icon>
                                        Add option
                                    </Button>
                                </div>
                            </div>
                        {/if}

                        {#if section.type === ExamSectionType.AssemblyCoding}
                            {@const assemblySection = section as AssemblyCodingSection}
                            <h3 class="band">Starting code</h3>
                            <div class="section">
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
                            <h3 class="band">Answer</h3>
                            <div class="section">
                                <TextField
                                    type="text"
                                    label="Placeholder"
                                    hint="Optional"
                                    placeholder="Shown in the empty answer box"
                                    bind:value={cSection.placeholder}
                                />
                            </div>
                            <h3 class="band">Starting code</h3>
                            <div class="section">
                                <div class="c-starter">
                                    <Editor language="c" bind:code={cSection.starterCode} />
                                </div>
                            </div>
                        {/if}
                    {/if}
                {/each}
            {/if}
        </Card>
    </div>
</Page>

<style lang="scss">
    @use '../../styles/field.scss';
    @use '../../styles/radius.scss' as *;

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
    /* the title over the Card. Smaller than the other pages' titles, a step of the scale down
       (`--fs-h2`, where theirs is `--fs-h1`), with less room above and below it, so that the
       outline and the Card start higher and the part has more of the window (the owner's
       exception for this page) */
    .title-room {
        grid-area: title;
        min-width: 0;
        padding-top: 0.5rem;
    }
    .title-room :global(h1) {
        margin: 0 0 0.75rem;
        font-size: var(--fs-h2);
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

    /* a section's header, a band a shade lighter than the Card over a rule, as the create page
       draws its "Instruction set" and "Details" (CollapsibleSection's look); the ones after the
       first are ruled off above too. The words start 1rem in, as the part's fields do (X-13) */
    .band {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        margin: 0;
        padding: 0.6rem 1rem;
        background-color: var(--wb-section-header);
        border-block: 1px solid var(--line);
        font: 700 var(--fs-small) / 1.4 var(--font-ui);
        color: var(--secondary-text);

        h2 {
            margin: 0;
            font: inherit;
        }
    }
    /* the first band is the Card's top, its corners inside the Card's 1px edge */
    .band.first {
        border-top: none;
        border-radius: nested-radius(var(--wb-radius), $border: 1px)
            nested-radius(var(--wb-radius), $border: 1px) 0 0;
    }

    .section {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        padding: 0.85rem 1rem 1rem;
    }
    .part-hint {
        margin: 0;
        color: var(--text-muted);
    }

    /* two fields side by side, one under the other where the Card is narrow; the box they are
       measured against is their own, so the sections with editors (whose Testcases window is
       placed against the screen) are not containers */
    .pair-room {
        container-type: inline-size;
    }
    .pair {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        align-items: start;
        gap: 1rem;
    }
    /* a wide field and a short one: a title and a number, or a title and its type, the Select as
       wide for every type so the title keeps its width when the type changes */
    .pair.narrow-second {
        grid-template-columns: minmax(0, 1fr) 13rem;
    }
    @container (max-width: 34rem) {
        .pair,
        .pair.narrow-second {
            grid-template-columns: minmax(0, 1fr);
        }
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

    /* the options one under the other, a hairline between one and the next with the same room
       either side of it, and Add option under the last */
    .options-list {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 0.75rem;
    }
    /* a label over its control, as the shared fields draw theirs */
    .option {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        width: 100%;
    }
    .option + .option {
        padding-top: 0.75rem;
        border-top: 1px solid var(--line);
    }
    /* the field and its delete button as one control: the button in the field's fill and edge,
       as tall as the field, the two meeting on one hairline with only the group's outer corners
       rounded */
    .option-group {
        display: flex;
        align-items: stretch;
    }
    .option-group > :global(.option-text) {
        flex: 1;
        border-top-right-radius: 0;
        border-bottom-right-radius: 0;
    }
    .option-group > :global(.option-delete) {
        @include field.surface;
        width: 2.6rem;
        height: auto;
        margin-left: -1px;
        border-top-left-radius: 0;
        border-bottom-left-radius: 0;
    }
    .option-group > :global(.option-delete:hover:not(:disabled)) {
        background-color: color-mix(in srgb, currentColor 8%, field.$fill);
    }

    .phone-moves {
        display: none;
        gap: 0.2rem;
        /* in the band's line, not making it taller */
        margin-block: -0.2rem;
    }

    /* Delete section at the right of a section's band, in its line */
    .band :global(.delete-section) {
        margin-left: auto;
    }

    /* the link to copy by hand, over Create exam link in the outline's foot */
    .link-fallback {
        display: flex;
        flex-basis: 100%;
        flex-direction: column;
        gap: 0.4rem;
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

    /* a phone: the title, the outline (ExamOutline.svelte) and the part one under the other, a
       section's arrows in its band beside its number */
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
        .phone-moves {
            display: flex;
            margin-left: 0.25rem;
        }
        .band {
            padding: 0.55rem 0.75rem;
        }
        .section {
            padding: 0.8rem 0.75rem 0.75rem;
        }
        .markdown-field.instructions {
            height: 20rem;
        }
        .markdown-field.prompt {
            height: 16rem;
        }
    }
</style>
