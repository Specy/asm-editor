<script lang="ts">
    import type {
        AnyProjectSettingDeclaration,
        ProjectSettingDeclaration,
        ProjectSettingId,
        ProjectSettingValues
    } from '#lib/projectSettings.ts'
    import FaUndo from '~icons/fa-solid/undo'
    import IconButton from '#cmp/shared/button/IconButton.svelte'
    import Switch from '#cmp/shared/input/Switch.svelte'
    import Select from '#cmp/shared/input/Select.svelte'
    import TextField from '#cmp/shared/input/TextField.svelte'
    import NumberStepper from '#cmp/shared/input/NumberStepper.svelte'
    import { tooltip } from '#cmp/shared/floating/tooltip.svelte.ts'

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
            <IconButton
                class="reset"
                label="Reset"
                {@attach tooltip('Back to the default')}
                onClick={onReset}
            >
                <FaUndo />
            </IconButton>
        {/if}
        {#if declaration.type === 'boolean'}
            <Switch
                checked={value === true}
                title={declaration.name}
                onChange={(checked) => onDecide(checked)}
            />
        {:else if declaration.type === 'enum'}
            <Select
                compact
                {options}
                value={String(value)}
                ariaLabel={declaration.name}
                wrapperStyle="min-width: 9rem; max-width: 12rem"
                onChange={(value) => {
                    if (declaration.accepts(value)) onDecide(value)
                }}
            />
        {:else if declaration.type === 'text'}
            <TextField
                id="{id}-field"
                class="text"
                mono
                invalid={!!problem}
                bind:value={textDraft}
                placeholder={declaration.placeholder}
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
            <!-- any number from 0, a fraction too, as the field took before; one that is not
                 puts the field back, and only a value that changes is a decision -->
            <NumberStepper
                id="{id}-field"
                min={0}
                snap={(next) => (next >= 0 ? next : Number.NaN)}
                value={draft}
                ariaLabel={declaration.name}
                onchange={(next) => {
                    if (next !== value) onDecide(next)
                }}
            />
        {/if}
    </div>
    {#if problem}
        <p class="problem" id="{id}-problem">{problem}</p>
    {/if}
</div>

<style lang="scss">
    /* at least as tall as a 2rem control and the padding, so the reset button turning up beside a
       switch the moment it is changed moves nothing */
    .settings-value {
        justify-content: space-between;
        align-items: center;
        gap: 0.4rem;
        min-height: calc(2rem + 0.4rem);
        padding: 0.2rem 0.4rem;
        font-size: var(--fs-small);
    }
    .name {
        display: flex;
        align-items: center;
        gap: 0.5rem;
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
    .value :global(.text) {
        flex: 1;
        max-width: 16rem;
        font-size: var(--fs-small);
    }
    .problem {
        flex-basis: 100%;
        margin: 0;
        font-size: var(--fs-caption);
        color: var(--danger);
        text-align: right;
    }
    /* the stepper in the fields' colour */
    .value {
        --stepper-background: var(--tertiary);
        --stepper-text: var(--tertiary-text);
    }
</style>
