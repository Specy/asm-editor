<script lang="ts">
    import FaChevronDown from 'svelte-icons/fa/FaChevronDown.svelte'
    import Icon from '$cmp/shared/layout/Icon.svelte'

    interface Props {
        expanded?: boolean
        style?: string
        title?: import('svelte').Snippet
        children?: import('svelte').Snippet
    }

    let { expanded = $bindable(false), style = '', title, children }: Props = $props()
</script>

<div class="expandable-container" class:expandable-container-open={expanded} {style}>
    <button onclick={() => (expanded = !expanded)} class="expandable-container-expand">
        <div class="chevron-icon" class:chevron-icon-expanded={expanded}>
            <Icon>
                <FaChevronDown />
            </Icon>
        </div>
        {@render title?.()}
    </button>
    <div class="expandable-container-content">
        {@render children?.()}
    </div>
</div>

<style>
    .expandable-container-expand {
        display: flex;
        align-items: center;
        gap: 1rem;
        background-color: transparent;
        padding: 0.8rem;
        cursor: pointer;
        color: var(--primary-text);
    }

    .expandable-container {
        display: flex;
        flex-direction: column;
        background-color: var(--primary);
        color: var(--primary-text);
        border-radius: 0.4rem;
        border: solid 0.2rem transparent;
    }

    .chevron-icon {
        transition: all 0.2s;
        transform: rotate(-90deg);
    }

    .chevron-icon-expanded {
        transform: rotate(0deg);
    }

    .expandable-container-open {
        border: solid 0.2rem var(--secondary-5);
    }

    .expandable-container-content {
        display: none;
        flex-direction: column;
        border-top: solid 0.2rem var(--secondary-5);
        margin-top: 0.5rem;
        padding-top: 0.5rem;
    }

    .expandable-container-open .expandable-container-content {
        display: flex;
        animation: appear 0.2s;
    }

    @keyframes appear {
        from {
            opacity: 0;
        }
        to {
            opacity: 1;
        }
    }
</style>
