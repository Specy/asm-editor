<script lang="ts">
    interface Props {
        width?: string
        height?: string
        style?: string
    }

    let { width = '100%', height = '0.2rem', style = '' }: Props = $props()
</script>

<div class="rgb-line" style={` height: ${height}; width: ${width}; ${style}`}></div>

<style>
    .rgb-line {
        border-radius: 1rem;
        background: linear-gradient(
            60deg,
            hsl(224, 85%, 66%),
            hsl(269, 85%, 66%),
            hsl(314, 85%, 66%),
            hsl(359, 85%, 66%),
            hsl(44, 85%, 66%),
            hsl(89, 85%, 66%),
            hsl(134, 85%, 66%),
            hsl(179, 85%, 66%)
        );
        background-size: 300% 300%;
        background-position: 0 50%;
    }
</style>
