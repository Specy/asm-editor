<script lang="ts">
    interface Props {
        id: string
        style?: string
        imageUrl?: string
        reverse?: boolean
        title?: import('svelte').Snippet
        children?: import('svelte').Snippet
    }

    let { id, style = '', imageUrl = '', reverse = false, title, children }: Props = $props()
</script>

<div class="section" {id} {style} class:reverse>
    <div class="section-image" style={`background-image: url('${imageUrl}');`}>
        <div class="section-image-overlay"></div>
    </div>
    <div class="section-content">
        <div class="column content">
            <div class="title">
                {@render title?.()}
            </div>
            <div class="section-text">
                {@render children?.()}
            </div>
        </div>
    </div>
</div>

<style lang="scss">
    .section {
        display: flex;
        flex-direction: column;
        align-items: center;
        position: relative;
        background-color: var(--primary);
        color: var(--primary-text);
    }
    .section-image {
        background-repeat: no-repeat;
        position: absolute;
        top: 0;
        left: 0;
        background-position: center;
        background-size: cover;
        overflow: hidden;
        width: 80%;
        height: 100%;
    }
    .section-text {
        font-size: 1.1rem;
        line-height: 1.6rem;
        padding: 1rem;
        max-width: 40rem;
    }
    .section-image-overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: linear-gradient(
            90deg,
            rgba(var(--RGB-primary), 0.4001751042) 0%,
            rgba(var(--RGB-primary), 0.8994748241) 50%,
            rgba(var(--RGB-primary), 0.99) 90%
        );
        backdrop-filter: blur(2px);
        color: var(--secondary-text);
    }
    .section-content {
        display: flex;
        gap: 1rem;
        z-index: 2;
        justify-content: flex-end;
        width: 100%;
        max-width: 80vw;
    }
    .reverse {
        background-color: var(--secondary);
        color: var(--secondary-text);
        align-items: center;
        > .section-image {
            right: 0;
            left: unset;
            > .section-image-overlay {
                background: linear-gradient(
                    270deg,
                    rgba(var(--RGB-secondary), 0.4001751042) 0%,
                    rgba(var(--RGB-secondary), 0.8994748241) 50%,
                    rgba(var(--RGB-secondary), 0.99) 90%
                );
                backdrop-filter: blur(2px);
            }
        }
        > .section-content {
            justify-content: flex-start;
        }
    }
    .title {
        font-size: 2.2rem;
        padding: 1rem;
        font-weight: bold;
    }
    .content {
        padding: 3rem 2rem;
    }
    @media screen and (max-width: 850px) {
        .reverse {
            background-color: unset;
        }
        .section-content {
            max-width: unset;
        }
        .section {
            position: relative;
            padding: 0;
            border-radius: 0.5rem;
            overflow: hidden;
            margin: 0.5rem 1rem;
        }
        .section-text {
            padding: 1.4rem;
        }
        .content {
            flex: 1;
            padding: 0;
        }
        .title {
            padding: 1.2rem;
            font-size: 1.8rem;
            background-color: rgba(var(--RGB-tertiary), 0.5);
            color: var(--tertiary-text);
        }
        .section-image {
            width: 100%;
        }
        .section-image-overlay {
            opacity: 0.92;
            background: unset;
            background-color: var(--secondary) !important;
        }
    }
</style>
