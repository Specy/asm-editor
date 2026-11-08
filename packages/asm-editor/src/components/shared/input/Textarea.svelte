<script lang="ts">
    interface Props {
        value?: string
        title?: string
    }

    let { value = $bindable(''), title = '' }: Props = $props()
</script>

<label class="wrapper">
    <span>{title}</span>
    <textarea placeholder={title} bind:value></textarea>
</label>

<style lang="scss">
    @use '../../../styles/field.scss';

    /* drawn as every field is (styles/field.scss), as TextField is */
    textarea {
        @include field.input;
        padding: 0.5rem 0.75rem;
        min-height: 4rem;
        max-height: 20rem;
        resize: vertical;
    }
    .wrapper {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        flex: 1;
    }
</style>
