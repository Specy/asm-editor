<script lang="ts">
    import { run } from 'svelte/legacy'

    import { ThemeStore, type ThemeProp } from '$stores/themeStore'
    import { TinyColor } from '@ctrl/tinycolor'
    import FaUndo from 'svelte-icons/fa/FaUndo.svelte'
    import Button from '$cmp/shared/button/Button.svelte'
    import Icon from '$cmp/shared/layout/Icon.svelte'
    interface Props {
        color: ThemeProp
    }

    let { color = $bindable() }: Props = $props()
    let parsed = $derived(new TinyColor(color.color))
</script>

<div
    class="color-prop"
    style={`
        background-color: #${parsed.toHex()};
        border-color: ${parsed.isDark() ? '#dbdbdb' : '#181818'};
        color: ${parsed.isDark() ? '#dbdbdb' : '#181818'};
    `}
>
    <div class="name">
        {color.name}
    </div>
    <div class="row" style="gap: 1rem">
        {#if !ThemeStore.isDefault(color.prop, color.color)}
            <Button
                onClick={() => {
                    ThemeStore.reset(color.prop)
                }}
            >
                <Icon>
                    <FaUndo />
                </Icon>
            </Button>
        {/if}
        <input
            type="color"
            bind:value={color.color}
            class="color"
            style={`outline: solid 0.1rem ${parsed.isDark() ? '#dbdbdb' : '#181818'};`}
            onblur={() => ThemeStore.set(color.prop, color.color)}
        />
    </div>
</div>

<style lang="scss">
    .color-prop {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        border-radius: 0.5rem;
        padding: 0.4rem;
        border: solid 0.2rem;
    }
    .name {
        padding: 1rem;
    }
    .color {
        height: 2.6rem;
        margin-right: 0.4rem;
        border-radius: 0.3rem;
        padding: 0;
        outline: solid 0.1rem #dbdbdb;
    }
    .color::-moz-color-swatch {
        border: none;
    }
    .color::-webkit-color-swatch-wrapper {
        padding: 0;
        border-radius: 0;
    }
    .color::-webkit-color-swatch {
        border: none;
    }
</style>
