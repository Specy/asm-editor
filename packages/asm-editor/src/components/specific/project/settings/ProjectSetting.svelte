<script lang="ts">
    import type {
        AnyProjectSettingDeclaration,
        ProjectSettingDeclaration,
        ProjectSettingId,
        ProjectSettingValues
    } from '#lib/projectSettings.ts'
    import FaUndo from '~icons/fa-solid/undo'
    import Icon from '#cmp/shared/layout/Icon.svelte'
    import Switch from '#cmp/shared/input/Switch.svelte'
    import Select from '#cmp/shared/input/Select.svelte'

    /**
     * One Setting of the open Project: a switch, a number, a choice or a line of text, the value the
     * Project runs with, and once something was decided for it a way back to the language's default.
     * Decisions are all a Project stores
     * ([ADR 0014](../../../../../../../docs/adr/0014-settings-split-by-effect.md)).
     */
    interface Props {
        declaration: AnyProjectSettingDeclaration
        /** The value the Project runs with: the decision, or the default. */
        value: ProjectSettingValues[ProjectSettingId]
        decided: boolean
        onDecide: (value: ProjectSettingValues[ProjectSettingId]) => void
        onReset: () => void
    }

    let { declaration, value, decided, onDecide, onReset }: Props = $props()
    let draft = $derived(typeof value === 'number' ? value : 0)
    let textDraft = $derived(typeof value === 'string' ? value : '')
    //what is wrong with the text being typed, for a Setting that can tell
    const problem = $derived(
        declaration.type === 'text'
            ? (declaration as ProjectSettingDeclaration<string>).problem?.(textDraft)
            : undefined
    )
    const id = $props.id()
    const options = $derived.by(() => {
        const available = (declaration.options ?? []).map((option) => ({
            key: option.label,
            value: String(option.value)
        }))
        return available.some((option) => option.value === String(value))
            ? available
            : [
                  ...available,
                  { key: `${value} (unavailable)`, value: String(value), disabled: true }
              ]
    })
</script>

<div class="row settings-value" class:wide={declaration.type === 'text'}>
    {#if declaration.type === 'text' || declaration.type === 'number'}
        <label class="name" for="{id}-field">{declaration.name}</label>
    {:else}
        <div class="name">{declaration.name}</div>
    {/if}
    <div class="row value" style="gap: 0.4rem; align-items: center">
        {#if decided}
            <button class="reset" title="Back to the default" onclick={onReset}>
                <Icon size={0.9}>
                    <FaUndo />
                </Icon>
            </button>
        {/if}
        {#if declaration.type === 'boolean'}
            <Switch
                checked={value === true}
                title={declaration.name}
                onChange={(checked) => onDecide(checked)}
            />
        {:else if declaration.type === 'enum'}
            <Select
                {options}
                value={String(value)}
                ariaLabel={declaration.name}
                style="padding: 0.4rem 0.6rem; background: var(--tertiary); color: var(--tertiary-text)"
                wrapperStyle="min-width: 9rem; max-width: 12rem"
                onChange={(value) => {
                    if (declaration.accepts(value)) onDecide(value)
                }}
            />
        {:else if declaration.type === 'text'}
            <input
                id="{id}-field"
                class="text"
                class:invalid={problem}
                type="text"
                bind:value={textDraft}
                placeholder={declaration.placeholder}
                spellcheck="false"
                autocomplete="off"
                autocapitalize="off"
                aria-invalid={problem ? 'true' : undefined}
                aria-describedby={problem ? `${id}-problem` : undefined}
                onchange={() => {
                    if (declaration.accepts(textDraft)) onDecide(textDraft)
                    else textDraft = typeof value === 'string' ? value : ''
                }}
            />
        {:else}
            <input
                id="{id}-field"
                class="number"
                type="number"
                min="0"
                bind:value={draft}
                onchange={() => {
                    if (Number.isFinite(draft) && draft >= 0) onDecide(draft)
                    else draft = typeof value === 'number' ? value : 0
                }}
            />
        {/if}
    </div>
    {#if problem}
        <p class="problem" id="{id}-problem">{problem}</p>
    {/if}
</div>

<style lang="scss">
    /* at least as tall as the reset button and the padding, so the button turning up beside a
       switch the moment it is changed moves nothing */
    .settings-value {
        justify-content: space-between;
        align-items: center;
        gap: 0.4rem;
        min-height: calc(2rem + 0.4rem);
        padding: 0.2rem 0.4rem;
        font-size: 0.9rem;
    }
    .name {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }
    .reset {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 2rem;
        height: 2rem;
        border-radius: 0.4rem;
        background-color: var(--secondary);
        color: var(--secondary-text);
        cursor: pointer;
    }
    /* a line of text takes the width the row has, and its problem goes on a line of its own */
    .wide {
        flex-wrap: wrap;

        .value {
            flex: 1;
            justify-content: flex-end;
            min-width: 10rem;
        }
    }
    .text {
        flex: 1;
        min-width: 0;
        max-width: 16rem;
        padding: 0.6rem 0.8rem;
        border-radius: 0.4rem;
        background-color: var(--secondary);
        color: var(--secondary-text);
        font-family: 'Fira Code', monospace;
        font-size: 0.85rem;

        &.invalid {
            outline: 1px solid var(--red);
        }
    }
    .problem {
        flex-basis: 100%;
        margin: 0;
        font-size: 0.75rem;
        color: var(--red);
        text-align: right;
    }
    .number {
        padding: 0.6rem 1rem;
        border-radius: 0.4rem;
        width: 7rem;
        background-color: var(--secondary);
        color: var(--secondary-text);
    }
</style>
