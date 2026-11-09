<script lang="ts">
    import { responsiveImage } from '#lib/images/responsive.ts'
    import FaGithub from '~icons/fa-brands/github'
    import FaCopyright from '~icons/fa-solid/copyright'
    import Icon from './Icon.svelte'
    import { toast } from '#stores/toastStore.ts'
    import { page } from '$app/state'
    import { hexStrip } from '#cmp/specific/landing/landing.ts'
    import FaDonate from '~icons/fa-solid/heart'
    import { resolve } from '$app/paths'
    import { tooltip } from '#cmp/shared/floating/tooltip.svelte.ts'
    interface Props {
        pages?: RegExp[]
    }

    let { pages = [] }: Props = $props()
    /** More rows than the tallest footer, a phone's, has room for; the rest are cut off. */
    const HEX_ROWS = Array.from({ length: 12 }, (_, i) => 7 + i)
</script>

{#if pages.some((p) => page.url.pathname.match(p))}
    <footer class="footer">
        <!-- the page dissolving into bytes: rows of hex, like a memory view, fading in from the
             top of the footer and running down behind it to its bottom edge -->
        <div class="footer-hex" aria-hidden="true">
            {#each HEX_ROWS as row (row)}
                <div>
                    {#each hexStrip(row) as segment, i (i)}{#if segment.hot}<b>{segment.text}</b
                            >{:else}{segment.text}{/if}{/each}
                </div>
            {/each}
        </div>
        <div class="footer-inner">
            <div class="footer-justify">
                <a
                    class="logo-wrapper"
                    href="https://specy.app"
                    {@attach tooltip('View my other websites')}
                >
                    <div class="logo-content">
                        <img
                            src="/images/logo.png"
                            srcset={responsiveImage('/images/logo.png').srcset}
                            sizes="32px"
                            alt="logo"
                            class="logo"
                        />
                        <div>Specy</div>
                    </div>
                </a>
                <a href={resolve('/changelog')}> Changelog </a>
                <div class="icon-wrapper">
                    <a
                        class="icon"
                        href={resolve('/donate')}
                        {@attach tooltip('Donate and support me')}
                        aria-label="Donate"
                    >
                        <Icon size="h2">
                            <FaDonate />
                        </Icon>
                    </a>
                    <button
                        type="button"
                        class="icon"
                        aria-label="Copyright"
                        onclick={() => {
                            toast.custom(
                                'Copyright',
                                `© ${new Date().getFullYear()} Specy. All rights reserved.`,
                                4000
                            )
                        }}
                    >
                        <Icon size="h2">
                            <FaCopyright />
                        </Icon>
                    </button>
                    <a
                        class="icon"
                        href="https://github.com/Specy/asm-editor"
                        target="_blank"
                        rel="noreferrer"
                        {@attach tooltip('Visit on github')}
                        aria-label="GitHub"
                    >
                        <Icon size="h2">
                            <FaGithub />
                        </Icon>
                    </a>
                </div>
            </div>
        </div>
    </footer>
{/if}

<style lang="scss">
    .logo-content {
        display: flex;
        align-items: center;
        > .logo {
            width: 2rem;
            height: 2rem;
            margin-right: 0.5rem;
        }
        > div {
            font-size: var(--fs-body);
        }
    }
    a {
        color: var(--primary-text);
        transition: color var(--dur-fast) ease-in-out;
    }
    a:hover {
        color: var(--accent);
    }

    .icon-wrapper {
        display: flex;
        flex-direction: row;
        align-items: center;
        > .icon {
            display: flex;
            align-items: center;
            color: var(--primary-text);
            margin-left: 1rem;
            cursor: pointer;
            transition: transform var(--dur-base);
            &:hover {
                transform: rotate(25deg) scale(1.1);
            }
        }
        /* Copyright, which shows a toast, drawn as the two links beside it */
        > button.icon {
            padding: 0;
            border: none;
            background: none;
            font: inherit;
        }
    }
    .footer {
        position: relative;
        margin-top: auto;
        width: 100%;
        background-color: var(--primary);
    }

    /* the rows of bytes are wider than any screen, so they sit out of the flow, or they would
       widen the whole page to their own width */
    .footer-hex {
        position: absolute;
        inset: 0;
        overflow: hidden;
        white-space: pre;
        font-family: var(--font-mono);
        font-size: var(--fs-prose);
        line-height: 1.3;
        letter-spacing: 0.08em;
        color: color-mix(in srgb, var(--background-text) 9%, transparent);
        user-select: none;
        pointer-events: none;
        /* nothing at the top, building slowly to whole at the bottom, and long gone at the sides */
        mask-image:
            linear-gradient(
                transparent,
                rgb(0 0 0 / 0.08) 35%,
                rgb(0 0 0 / 0.3) 65%,
                rgb(0 0 0 / 0.65) 90%,
                #000
            ),
            linear-gradient(90deg, transparent, #000 22%, #000 78%, transparent);
        mask-composite: intersect;

        b {
            font-weight: 400;
            color: color-mix(in srgb, var(--accent) 30%, transparent);
        }
    }

    .footer-justify {
        display: flex;

        justify-content: space-between;
        align-items: center;
    }
    /* over the bytes, with room above for them to fade in */
    .footer-inner {
        position: relative;
        color: var(--primary-text);
        justify-content: center;
        padding: 3rem 1.5rem 1.2rem;
        display: flex;
        z-index: 2;
        flex-direction: column;
    }
    @media (max-width: 480px) {
        .footer-justify {
            flex-wrap: wrap;
            gap: 0.5rem;
        }
        .footer-inner {
            padding: 3rem 1rem 1rem;
        }
    }
</style>
