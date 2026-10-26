<script lang="ts">
    interface Props {
        height?: string
        /** Whether the colours drift along the line, slowly and back. */
        animated?: boolean
        style?: string
    }

    let { height = '0.3rem', animated = false, style = '' }: Props = $props()
</script>

<div class="rgb-line" class:animated style={`height: ${height}; ${style}`}></div>

<style>
    .rgb-line {
        width: 100%;
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
    .animated {
        animation: moveLine 10s ease-in-out alternate infinite;
    }
    @keyframes moveLine {
        0% {
            background-position: 0% 50%;
        }
        100% {
            background-position: 100% 50%;
        }
    }
</style>
