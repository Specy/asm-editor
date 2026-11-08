<script lang="ts">
    /**
     * A Button whose action copies something to the clipboard. After a copy that worked it shows a
     * check and "Copied" in place of its label for as long as the pill saying what was copied
     * shows, at the same width (CopyLabel); a copy that failed leaves it as it was. It takes a
     * Button's props, but `copy` for `onClick`.
     */
    import type { ComponentProps } from 'svelte'
    import Button from './Button.svelte'
    import CopyLabel from './CopyLabel.svelte'
    import { CopyFeedback } from './copyFeedback.svelte.ts'

    interface Props extends Omit<ComponentProps<typeof Button>, 'onClick'> {
        /** Copies, answering whether the text reached the clipboard, as `copyText` (lib/utils.ts)
         * does. */
        copy: () => boolean | Promise<boolean>
    }

    let { copy, children, style = '', ...rest }: Props = $props()
    const feedback = new CopyFeedback()
</script>

<!-- the room between the label's icon and its words, which the caller's style may change -->
<Button {...rest} style={`gap: 0.45rem; ${style}`} onClick={() => void feedback.run(copy)}>
    <CopyLabel copied={feedback.copied}>{@render children?.()}</CopyLabel>
</Button>
