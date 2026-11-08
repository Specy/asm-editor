<script lang="ts">
    /**
     * The exam builder's outline: the parts of the **Exam** being written, its Details, its general
     * instructions and its sections in order, the one shown beside it marked as the current item
     * (design-system.md, D4), as the documentation sidebar marks its page. A section moves up or
     * down from its row, Add section offers the section types, and what the page puts in `footer`
     * (Create exam link) stays at the outline's foot, in view while the page scrolls. On a phone the
     * list gives way to a Select over the part shown, and Add section and the footer sit under it.
     */
    import { tick, type Snippet } from 'svelte'
    import Button from '#cmp/shared/button/Button.svelte'
    import IconButton from '#cmp/shared/button/IconButton.svelte'
    import Select from '#cmp/shared/input/Select.svelte'
    import Card from '#cmp/shared/layout/Card.svelte'
    import Icon from '#cmp/shared/layout/Icon.svelte'
    import ContextMenu from '#cmp/shared/menu/ContextMenu.svelte'
    import { tooltip } from '#cmp/shared/floating/tooltip.svelte.ts'
    import FaArrowUp from '~icons/fa-solid/arrow-up'
    import FaArrowDown from '~icons/fa-solid/arrow-down'
    import FaPlus from '~icons/fa-solid/plus'
    import type { ExamSection, ExamSectionType } from '#lib/exam.ts'
    import { DETAILS, INSTRUCTIONS, SECTION_TYPES, sectionTypeLabel } from './examBuilder.ts'

    interface Props {
        sections: ExamSection[]
        /** The part shown: `DETAILS`, `INSTRUCTIONS` or a section's id. */
        current: string
        onPick: (part: string) => void
        onMove: (sectionId: string, direction: -1 | 1) => void
        onAdd: (type: ExamSectionType) => void
        footer: Snippet
    }

    let { sections, current, onPick, onMove, onAdd, footer }: Props = $props()

    const PARTS = [
        { id: DETAILS, label: 'Details' },
        { id: INSTRUCTIONS, label: 'General instructions' }
    ]

    /** The phone's list of the same parts, a section named by its number and type. */
    const pickerOptions = $derived([
        ...PARTS.map((part) => ({ key: part.label, value: part.id })),
        ...sections.map((section, index) => ({
            key: `Section ${index + 1} · ${sectionTypeLabel(section.type)}`,
            value: section.id
        }))
    ])

    let nav = $state<HTMLElement>()

    /** Up and Down walk the rows, Home and End go to the first and the last; Enter shows one. */
    function onKeydown(event: KeyboardEvent) {
        if (!nav) return
        const rows = [...nav.querySelectorAll<HTMLButtonElement>('button.pick')]
        const index = rows.indexOf(document.activeElement as HTMLButtonElement)
        if (index < 0) return
        let next: HTMLButtonElement | undefined
        if (event.key === 'ArrowDown') next = rows[Math.min(index + 1, rows.length - 1)]
        else if (event.key === 'ArrowUp') next = rows[Math.max(index - 1, 0)]
        else if (event.key === 'Home') next = rows[0]
        else if (event.key === 'End') next = rows[rows.length - 1]
        else return
        event.preventDefault()
        next.focus()
    }

    /**
     * Moves a section and keeps the focus on the arrow pressed, which the row took with it, or on
     * the other arrow once the section reaches an end and that one is disabled.
     */
    async function move(sectionId: string, direction: -1 | 1) {
        onMove(sectionId, direction)
        await tick()
        const row = nav?.querySelector(`[data-section="${CSS.escape(sectionId)}"]`)
        const arrows = [...(row?.querySelectorAll<HTMLButtonElement>('button[data-move]') ?? [])]
        const pressed = arrows.find((arrow) => arrow.dataset.move === String(direction))
        const target = pressed && !pressed.disabled ? pressed : arrows.find((a) => !a.disabled)
        target?.focus()
    }

    /** Where the section types' menu opens, under Add section; null while it is closed. */
    let menuAt = $state<{ x: number; y: number } | null>(null)
    let addArea = $state<HTMLElement>()
    /**
     * Whether the last press on Add section came while its menu was open. The menu closes on any
     * press outside it before the button sees the click, which must then leave it closed rather
     * than open it again. Listening on the window while capturing, from before the menu ever
     * opens, puts this ahead of the menu's own listener.
     */
    let pressedWhileOpen = false
    $effect(() => {
        const onPointerDown = (event: PointerEvent) => {
            pressedWhileOpen = menuAt !== null && !!addArea?.contains(event.target as Node)
        }
        window.addEventListener('pointerdown', onPointerDown, true)
        return () => window.removeEventListener('pointerdown', onPointerDown, true)
    })

    function openMenu(event: MouseEvent) {
        if (pressedWhileOpen) {
            pressedWhileOpen = false
            return
        }
        if (menuAt) {
            menuAt = null
            return
        }
        const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect()
        menuAt = { x: bounds.left + 16, y: bounds.bottom + 4 }
    }

    const menuItems = SECTION_TYPES.map((type) => ({
        label: sectionTypeLabel(type),
        onSelect: () => onAdd(type)
    }))
</script>

<div class="exam-outline">
    <Card style="min-height: 0;">
        <nav class="parts" aria-label="Exam outline" bind:this={nav}>
            <h2 class="group-title">Exam</h2>
            <ul class="rows">
                {#each PARTS as part (part.id)}
                    <li class="row" class:current={current === part.id}>
                        <button
                            type="button"
                            class="pick"
                            aria-current={current === part.id ? 'true' : undefined}
                            onclick={() => onPick(part.id)}
                            onkeydown={onKeydown}
                        >
                            {part.label}
                        </button>
                    </li>
                {/each}
            </ul>
            <h2 class="group-title">Sections</h2>
            <ol class="rows">
                {#each sections as section, index (section.id)}
                    <li
                        class="row"
                        class:current={current === section.id}
                        data-section={section.id}
                    >
                        <button
                            type="button"
                            class="pick"
                            aria-current={current === section.id ? 'true' : undefined}
                            onclick={() => onPick(section.id)}
                            onkeydown={onKeydown}
                        >
                            <span class="number">{index + 1}</span>
                            <span class="names">
                                <span class="ellipsis">{sectionTypeLabel(section.type)}</span>
                                {#if section.title.trim()}
                                    <span class="section-title ellipsis">{section.title}</span>
                                {/if}
                            </span>
                        </button>
                        <IconButton
                            size="sm"
                            quiet
                            label={`Move section ${index + 1} up`}
                            data-move="-1"
                            disabled={index === 0}
                            {@attach tooltip('Move section up')}
                            onClick={() => move(section.id, -1)}
                        >
                            <FaArrowUp />
                        </IconButton>
                        <IconButton
                            size="sm"
                            quiet
                            label={`Move section ${index + 1} down`}
                            data-move="1"
                            disabled={index === sections.length - 1}
                            {@attach tooltip('Move section down')}
                            onClick={() => move(section.id, 1)}
                        >
                            <FaArrowDown />
                        </IconButton>
                    </li>
                {/each}
            </ol>
        </nav>

        <div class="picker">
            <Select
                ariaLabel="Part of the exam"
                value={current}
                options={pickerOptions}
                onChange={(part) => onPick(part)}
            />
        </div>

        <div class="actions">
            <div class="add" bind:this={addArea}>
                <Button
                    kind="ghost"
                    size="sm"
                    aria-haspopup="menu"
                    aria-expanded={menuAt !== null}
                    onClick={openMenu}
                >
                    <span class="add-icon"><Icon size="small"><FaPlus /></Icon></span>
                    Add section
                </Button>
            </div>
            <div class="foot">
                {@render footer()}
            </div>
        </div>
    </Card>
</div>

{#if menuAt}
    <ContextMenu
        x={menuAt.x}
        y={menuAt.y}
        arrow
        label="Section type"
        items={menuItems}
        onClose={() => (menuAt = null)}
    />
{/if}

<style lang="scss">
    @use '../../../styles/outline.scss';

    /* beside the part it shows, held in view under the navbar (3.2rem) while the page scrolls, its
       list scrolling when it is taller than the screen and its foot staying put */
    .exam-outline {
        position: sticky;
        top: calc(3.2rem + 1rem);
        display: flex;
        flex-direction: column;
        max-height: calc(100dvh - 3.2rem - 2rem);
    }

    /* the rows as the shared outline draws them (styles/outline.scss): flush to the card's left
       edge, so the picked row's accent edge is its side, edge to edge with no gap between them,
       the row under the pointer in the hover tint and the part shown in the current item's look,
       as the documentation sidebar marks its page */
    .parts {
        @include outline.list-box;
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
    }
    .group-title {
        @include outline.group-title;
    }
    .rows {
        @include outline.rows;
    }
    .row {
        @include outline.row;
        gap: 0.1rem;
        padding-right: 0.25rem;
    }
    .pick {
        @include outline.row-control;
    }

    .number {
        flex: none;
        min-width: 0.9rem;
        color: var(--text-muted);
        font-variant-numeric: tabular-nums;
    }

    .names {
        display: flex;
        flex-direction: column;
        min-width: 0;
    }
    .section-title {
        font-size: var(--fs-small);
        color: var(--text-muted);
    }

    .picker {
        display: none;
    }

    /* Add section under the rows, its plus where their numbers are; the footer under a rule */
    .add {
        padding: 0 0.5rem 0.4rem 0;
    }
    .add :global(.btn) {
        justify-content: flex-start;
        gap: 0.6rem;
        width: 100%;
        padding-inline: outline.$row-padding-inline;
        border-radius: 0 var(--r-chip) var(--r-chip) 0;
    }
    .add-icon {
        display: flex;
        justify-content: center;
        min-width: 0.9rem;
    }

    .foot {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        padding: 0.75rem;
        border-top: 1px solid var(--line);
    }
    .foot :global(.btn) {
        width: 100%;
    }

    /* a phone: the parts as a Select over the part shown, Add section and the footer's button on
       one line under it */
    @media (max-width: 720px) {
        .exam-outline {
            position: static;
            max-height: none;
        }
        .parts {
            display: none;
        }
        .picker {
            display: block;
            padding: 0.75rem 0.75rem 0;
        }
        .actions {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 0.5rem;
            padding: 0.75rem;
        }
        .add {
            padding: 0;
        }
        .add :global(.btn) {
            width: auto;
            border-radius: var(--r-control);
        }
        .foot {
            display: contents;
        }
        .foot :global(.btn) {
            width: auto;
            margin-left: auto;
        }
        .foot > :global(:not(.btn)) {
            flex-basis: 100%;
        }
    }
</style>
