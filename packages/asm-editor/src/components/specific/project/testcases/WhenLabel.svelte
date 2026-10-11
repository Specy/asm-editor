<script lang="ts" module>
    import FaFlag from '~icons/fa-solid/flag'
    import FaBullseye from '~icons/fa-solid/bullseye'

    /** Whether a value is set before the run or checked after it. */
    export type When = 'start' | 'expect'

    /**
     * The mark of each side wherever a Testcase shows it: a starting flag for what is set before
     * the program starts, a target for what it is checked against at the end. Not a play mark,
     * which is Run's.
     */
    export const WHEN_ICONS = {
        start: { icon: FaFlag, color: 'var(--tc-start)' },
        expect: { icon: FaBullseye, color: 'var(--tc-expect)' }
    } as const
</script>

<script lang="ts">
    interface Props {
        when: When
        /** The text beside the mark: Start and Expect unless a table names its column otherwise. */
        label?: string
    }

    let { when, label }: Props = $props()
    const Icon = $derived(WHEN_ICONS[when].icon)
</script>

<span class="when">
    <span class="when-icon" style:color={WHEN_ICONS[when].color} aria-hidden="true">
        <Icon />
    </span>
    <span class="when-text">{label ?? (when === 'start' ? 'Start' : 'Expect')}</span>
</span>

<style>
    .when {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        max-width: 100%;
        white-space: nowrap;
    }

    /* a column too narrow for the word ends it with an ellipsis rather than cutting it off */
    .when-text {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .when-icon {
        display: flex;
        flex: none;
        width: 0.65rem;
        height: 0.65rem;
    }
</style>
