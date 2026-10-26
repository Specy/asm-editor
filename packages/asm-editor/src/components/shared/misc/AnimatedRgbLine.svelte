<script lang="ts">
    import RgbLine from './RgbLine.svelte'
    import type { ComponentProps } from 'svelte'

    /** `RgbLine` animated, under the name the home page imports it by. */
    let props: Omit<ComponentProps<typeof RgbLine>, 'animated'> = $props()
</script>

<RgbLine animated {...props} />
