<script lang="ts">
    import Page from '#cmp/shared/layout/Page.svelte'
    import DefaultNavbar from '#cmp/shared/layout/DefaultNavbar.svelte'
    import AgentDocs from '#cmp/documentation/site/AgentDocs.svelte'
    import FeatureAccordion, {
        type AccordionFeature
    } from '#cmp/specific/landing/FeatureAccordion.svelte'
    import { LANDING_TARGETS, hexStrip } from '#cmp/specific/landing/landing.ts'
    import HeroBackdrop from '#cmp/specific/landing/HeroBackdrop.svelte'
    import ButtonLink from '#cmp/shared/button/ButtonLink.svelte'
    import Button from '#cmp/shared/button/Button.svelte'
    import HeroLink from '#cmp/specific/landing/HeroLink.svelte'
    import SparklesIcon from '#cmp/shared/agent/SparklesIcon.svelte'
    import FaBook from '~icons/fa-solid/book'
    import FaCode from '~icons/fa-solid/code'
    import FaGraduationCap from '~icons/fa-solid/graduation-cap'
    import FaHeart from '~icons/fa-solid/heart'
    import FaDumbbell from '~icons/fa-solid/dumbbell'
    import FaArrowLeft from '~icons/fa-solid/arrow-left'
    import FaRedo from '~icons/fa-solid/redo'
    import FaLock from '~icons/fa-solid/lock'
    import FaTimes from '~icons/fa-solid/times'
    import FaPlus from '~icons/fa-solid/plus'
    import FaFolderOpen from '~icons/fa-solid/folder-open'
    import FaTh from '~icons/fa-solid/th'
    import FaArrowRight from '~icons/fa-solid/arrow-right'
    import FaChevronRight from '~icons/fa-solid/chevron-right'
    import FaPlay from '~icons/fa-solid/play'
    import FaDownload from '~icons/fa-solid/download'
    import FaGithub from '~icons/fa-brands/github'
    import FaExternalLinkAlt from '~icons/fa-solid/external-link-alt'
    import { onMount } from 'svelte'
    import { goto } from '$app/navigation'
    import { resolve } from '$app/paths'
    import type { ResolvedPathname } from '$app/types'
    import { resolveHref } from '#lib/hrefs.ts'
    import { toast } from '#stores/toastStore.ts'
    import type { AvailableLanguages } from '#lib/Project.svelte.ts'
    import {
        EXAMPLE_LEAVE_MESSAGE,
        destinationPath,
        exampleSharePath,
        isExampleDestination
    } from '#lib/examples.ts'
    import { storedProjectCount } from '#lib/storage/projectCount.ts'
    import { AI_FEATURES_ENABLED } from '#lib/Config.ts'
    import { tooltip } from '#cmp/shared/floating/tooltip.svelte.ts'
    import { SITE_URL, jsonLdScriptTag, softwareApplicationLd, websiteLd } from '#lib/seo.ts'

    interface BeforeInstallPromptEvent extends Event {
        prompt(): Promise<void>
    }

    let installEvent: BeforeInstallPromptEvent | null = $state(null)
    onMount(() => {
        const onPrompt = (e: Event) => {
            e.preventDefault()
            installEvent = e as BeforeInstallPromptEvent
        }
        window.addEventListener('beforeinstallprompt', onPrompt)
        return () => window.removeEventListener('beforeinstallprompt', onPrompt)
    })

    async function install() {
        try {
            await installEvent?.prompt()
        } catch (e) {
            console.error(e)
        }
        installEvent = null
    }

    /**
     * How many Projects are stored, counted without reading them: `pending` until the count is
     * in, and undefined when the browser's storage could not be read.
     */
    let projectCount = $state<number | undefined | 'pending'>('pending')
    onMount(() => {
        void storedProjectCount().then((count) => (projectCount = count))
    })
    //a count that failed knows nothing of the projects, and their page says why
    let shouldGoToCurrentProjects = $derived(
        projectCount === 'pending' || projectCount === undefined || projectCount > 0
    )
    const editorHref = $derived(
        shouldGoToCurrentProjects ? resolve('/projects') : resolve('/projects/create')
    )
    const coursesHref = resolve('/learn/courses')
    const examplesHref = resolve('/examples')

    /**
     * The demo: examples in the real editor, framed as the Examples page frames them and started
     * the way each starts. The tabs of the browser drawn around it choose the example, which loads
     * again in the one frame. The frame loads once the window is close to the screen, and never on
     * a narrow one, where the editor would be too small to use: a picture or a link stands in.
     */
    const DEMO_TABS = [
        { name: 'Relay Maze', id: 'risc-v-relay-maze', language: 'RISC-V' },
        { name: 'asmOS', id: 'x86-asmos', language: 'x86-64' },
        { name: 'Flappy ASM', id: 'm68k-flappy-asm', language: 'M68K' },
        { name: 'Sum of two numbers', id: 'z80-sum-of-two-numbers', language: 'Z80', screen: false }
    ].map(({ screen = true, ...tab }) => ({
        ...tab,
        // a program with a Screen opens it in its window, one that only uses the Terminal does not
        path: exampleSharePath(tab.id, 'buildAndRun', screen) as ResolvedPathname
    }))
    let activeTab = $state(0)
    const demo = $derived(DEMO_TABS[activeTab])
    /**
     * The framed editor takes the mouse only once it is clicked, so the wheel scrolls the page
     * over it until then, and again once the pointer leaves the browser window.
     */
    let frameActive = $state(false)
    function activateFrame() {
        frameActive = true
        demoFrame?.contentWindow?.focus()
    }
    const SITE_HOST = new URL(SITE_URL).host
    /**
     * The instruction sets over the hero's title, x86-64 and RISC-V first, in their own colours:
     * each makes a new Project for its Target and opens it, as Create project with the empty
     * program would, without the form.
     */
    const HERO_ISAS = (
        [
            ['x86-64', 'X86'],
            ['RISC-V', 'RISC-V'],
            ['M68K', 'M68K'],
            ['MIPS', 'MIPS'],
            ['Z80', 'Z80']
        ] as const
    ).map(([name, language]) => ({
        name,
        language,
        color: LANDING_TARGETS.find((target) => target.name === name)?.color ?? 'var(--accent)'
    }))
    let creating = $state(false)
    async function createProjectFor(language: AvailableLanguages) {
        if (creating) return
        creating = true
        try {
            // loaded on demand: the home page does not otherwise need the Project store
            const [{ makeProject }, { ProjectStore }] = await Promise.all([
                import('#lib/Project.svelte.ts'),
                import('#stores/projectsStore.svelte.ts')
            ])
            const now = Date.now()
            const project = makeProject({ name: '', language, createdAt: now, updatedAt: now })
            await ProjectStore.addProject(project)
            await goto(resolve('/projects/[project]', { project: project.id }))
        } catch (e) {
            console.error(e)
            toast.error('Could not create the project')
        } finally {
            creating = false
        }
    }
    let browserWindow = $state<HTMLElement>()
    let demoFrame = $state<HTMLIFrameElement>()
    /** Whether the screen is wide enough for the editor, which shows the demo at all. */
    let showDemo = $state(false)
    /** Whether the frame can load, which needs the browser to tell when the demo is on screen. */
    let canFrame = false
    let frameWanted = $state(false)
    let frameLoaded = $state(false)
    let frameKey = $state(0)
    onMount(() => {
        const wide = window.matchMedia?.('(min-width: 900px)')
        if (!wide) return
        showDemo = wide.matches
        const onChange = () => {
            showDemo = wide.matches
            //the frame goes with the demo, so one shown again starts loading from nothing
            if (!showDemo) {
                frameLoaded = false
                frameActive = false
            }
        }
        wide.addEventListener('change', onChange)
        return () => wide.removeEventListener('change', onChange)
    })
    $effect(() => {
        //without it, as in an old browser, the picture stays
        if (!browserWindow || typeof IntersectionObserver === 'undefined') return
        canFrame = true
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (!entry.isIntersecting) return
                frameWanted = true
                observer.disconnect()
            },
            // only once the window is well on screen: the editor takes the focus as it starts, which
            // scrolls the page to it, and must not pull a reader still at the top of the page
            { threshold: 0.25 }
        )
        observer.observe(browserWindow)
        return () => observer.disconnect()
    })
    /**
     * The demo is a demo: what the reader changes in it is let go without asking, on a new tab, a
     * restart or leaving the page, so trying it never ends in a dialog.
     */
    function loadDemo() {
        frameWanted = canFrame
        frameLoaded = false
        frameActive = false
        frameKey++
    }
    function openTab(index: number) {
        if (index === activeTab) return
        activeTab = index
        loadDemo()
    }
    //the framed editor's top bar or Save asks for a page of the site: it opens here
    function receiveFrameMessage(event: MessageEvent) {
        if (event.origin !== window.location.origin || event.source !== demoFrame?.contentWindow)
            return
        if (
            event.data?.type === EXAMPLE_LEAVE_MESSAGE &&
            isExampleDestination(event.data.destination)
        )
            void goto(destinationPath(event.data.destination))
    }

    const showcases = [
        {
            title: 'Breakpoints, stepping and Undo',
            description:
                'Pause on a breakpoint, step one instruction at a time and undo the ones you already ran. Edit registers and memory while the program is paused, and see what each instruction changed.',
            image: '/images/ASM-Tools.webp',
            alt: 'The M68K debugger with the registers, memory and the History of the last instructions',
            width: 1718,
            height: 778
        },
        {
            title: 'Screen, keyboard and sound',
            description:
                'Programs can draw on the Screen, read the keyboard and mouse, play sound, write to the Terminal and access a File System.',
            image: '/images/ASM-Peripherals.webp',
            alt: 'A Flappy ASM game written in M68K assembly, running on the Screen',
            width: 1710,
            height: 688
        },
        {
            title: 'Documentation in the editor',
            description:
                'Every instruction, directive and system call is documented with its operands and an example. Hover an instruction in your code to read about it.',
            image: '/images/ASM-Documentation.webp',
            alt: 'The Documentation panel beside an M68K program, open on the add instruction',
            width: 1350,
            height: 1013
        },
        {
            title: 'Completion and errors as you type',
            description:
                'Completion suggests the operands each instruction accepts and the labels in your code. Mistakes are reported as you write.',
            image: '/images/ASM-CodeCompletion.webp',
            alt: 'Code completion listing the addressing modes an M68K add instruction accepts',
            width: 1050,
            height: 750
        }
    ]

    const deeper: AccordionFeature[] = [
        {
            title: 'Compile *C* and *C++*',
            description:
                'Write C or C++ and compile it to MIPS, RISC-V or x86-64 at any optimization level, with GCC, or Clang on MIPS and RISC-V. Each line of C is matched to the instructions it compiles to, so you can see how code gets compiled to machine code.',
            link: { href: resolve('/documentation/risc-v/using-c'), label: 'Using C on RISC-V' },
            image: '/images/ASM-Compile.webp',
            alt: 'A C program summing squares beside the RISC-V assembly Clang compiled it to, with the instructions of the loop body highlighted',
            width: 1800,
            height: 948
        },
        {
            title: 'Open an *executable (ELF)*',
            description:
                'Import an x86-64 Linux ELF executable to disassemble it, browse its symbols and strings, and edit its bytes in the Hex editor. Then debug it with breakpoints, stepping and Undo.',
            link: {
                href: resolve('/documentation/x86/executables'),
                label: 'Read about Executables'
            },
            image: '/images/ASM-ReverseEngineering.webp',
            alt: 'An imported x86-64 executable with its symbols, disassembly and pseudocode',
            width: 1800,
            height: 777
        },
        {
            title: 'Decompile with *Ghidra*',
            description:
                'Read each function as C-like pseudocode from the Ghidra decompiler, rename functions and add comments as you figure out what the program does. Made for capture the flag challenges and cybersecurity courses.',
            image: '/images/ASM-ReverseEngineering.webp',
            alt: 'Ghidra pseudocode of a check_password function',
            width: 1800,
            height: 777,
            focus: { x: '100%', y: '20%', scale: 1.5 }
        }
    ]

    type Tile = { title: string; description: string; href: ResolvedPathname }
    const tiles: Tile[] = [
        {
            title: 'Blog',
            description:
                'Read the ASM Editor posts about how to use the editor, changelogs and guides.',
            href: resolve('/blog')
        },
        {
            title: 'Changelog',
            description: 'See updates and new things added in each version.',
            href: resolve('/changelog')
        }
    ]
</script>

<svelte:head>
    <title>ASM Editor: online assembler & emulator for M68K, MIPS, RISC-V, x86-64 and Z80</title>
    <meta
        name="description"
        content="Write, learn and run M68K, MIPS, RISC-V, x86-64 and Z80 assembly code in your browser. View registers and memory, step and undo the execution."
    />
    <meta
        property="og:description"
        content="Write, learn and run M68K, MIPS, RISC-V, x86-64 and Z80 assembly code in your browser. View registers and memory, step and undo the execution."
    />
    <meta
        property="og:title"
        content="ASM Editor: online assembler & emulator for M68K, MIPS, RISC-V, x86-64 and Z80"
    />
    <!-- The page's schema.org description. {@html} is the only way to emit a <script>
         from a component: <svelte:element this="script"> renders nothing in Svelte, and a
         literal script tag here is taken as the component's own instance script. Safe
         because the payload is machine generated and serializeJsonLd escapes < > and &,
         so nothing interpolated can close the tag. -->
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    {@html jsonLdScriptTag(softwareApplicationLd())}
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    {@html jsonLdScriptTag(websiteLd())}
</svelte:head>

<svelte:window onmessage={receiveFrameMessage} />

{#snippet rule()}
    <div class="rule" aria-hidden="true"><div class="rule-frame"><i></i><i></i></div></div>
{/snippet}

<!-- a divider drawn as two rows of hex bytes, like a strip of a memory view -->
{#snippet band(seed: number)}
    {@render rule()}
    <div class="band" aria-hidden="true">
        {#each [seed * 2, seed * 2 + 1] as row (row)}
            <div class="hex">
                {#each hexStrip(row) as segment, i (i)}{#if segment.hot}<b>{segment.text}</b
                        >{:else}{segment.text}{/if}{/each}
            </div>
        {/each}
    </div>
    {@render rule()}
{/snippet}

{#snippet editorButton()}
    <ButtonLink href={editorHref} style="gap: 0.6rem" {@attach tooltip('Open the editor')}>
        {#if shouldGoToCurrentProjects}
            <span class="icon" aria-hidden="true"><FaFolderOpen /></span>
            Go to your projects
        {:else}
            <span class="icon" aria-hidden="true"><FaPlus /></span>
            Create first project
        {/if}
    </ButtonLink>
{/snippet}

<DefaultNavbar>
    <span class="create-project">
        <ButtonLink
            href={resolve('/projects/create')}
            {@attach tooltip('Start a new Project in the editor')}
        >
            <span class="create-icon"><FaPlus /></span>
            <span class="create-label">Create project</span>
        </ButtonLink>
    </span>
</DefaultNavbar>
<Page hasNavbar>
    <div class="landing">
        <div class="first-screen">
            <section class="hero" aria-labelledby="hero-title">
                <HeroBackdrop />
                <div class="hero-content">
                    <div class="isas" role="group" aria-label="Create a project for">
                        {#each HERO_ISAS as isa (isa.name)}
                            <button
                                type="button"
                                style="--dot: {isa.color}"
                                disabled={creating}
                                onclick={() => createProjectFor(isa.language)}
                                {@attach tooltip(`Create an empty ${isa.name} Project and open it`)}
                            >
                                <span class="isa-name">{isa.name}</span>
                            </button>
                        {/each}
                    </div>
                    <h1 id="hero-title">The web IDE for <em>assembly</em></h1>
                    <p class="lede">
                        Write assembly and C/C++ in your browser, run it or step one instruction at
                        a time and undo any step while debugging what it does.
                    </p>
                    <div class="actions">
                        {@render editorButton()}
                        <ButtonLink href={coursesHref} kind="secondary" style="gap: 0.6rem">
                            <span class="icon" aria-hidden="true"><FaGraduationCap /></span>
                            Courses
                        </ButtonLink>
                    </div>
                    <!-- always takes its room, so the centred hero does not move when the browser offers the install -->
                    <div class="install actions" class:hidden={!installEvent}>
                        <Button
                            kind="secondary"
                            style="gap: 0.6rem"
                            onClick={install}
                            disabled={!installEvent}
                        >
                            <span class="icon"><FaDownload /></span>
                            Install the app
                        </Button>
                    </div>
                </div>
            </section>

            {@render rule()}

            <!-- one stream of hex bytes across the whole width, as in the dividers, under the cards -->
            <div class="quick-row">
                <div class="quick-hex" aria-hidden="true">
                    {#each hexStrip(100, 1000) as segment, i (i)}{#if segment.hot}<b
                                >{segment.text}</b
                            >{:else}{segment.text}{/if}{/each}
                </div>
                <nav class="frame quick-links" aria-label="Quick links">
                    <HeroLink href={resolve('/documentation')}>
                        {#snippet icon()}<FaBook />{/snippet}
                        {#snippet description()}Documentation{/snippet}
                    </HeroLink>
                    <HeroLink href={examplesHref}>
                        {#snippet icon()}<FaCode />{/snippet}
                        {#snippet description()}Examples{/snippet}
                    </HeroLink>
                    <HeroLink href={coursesHref}>
                        {#snippet icon()}<FaGraduationCap />{/snippet}
                        {#snippet description()}Courses{/snippet}
                    </HeroLink>
                    <HeroLink href={resolve('/donate')}>
                        {#snippet icon()}<FaHeart />{/snippet}
                        {#snippet description()}Donate{/snippet}
                    </HeroLink>
                    <HeroLink href={resolve('/embed')} title="Embed the app in your website">
                        {#snippet icon()}<FaCode />{/snippet}
                        {#snippet description()}Embed{/snippet}
                    </HeroLink>
                    <HeroLink href={resolve('/exam')} title="Create an exam for students">
                        {#snippet icon()}<FaDumbbell />{/snippet}
                        {#snippet description()}Exam{/snippet}
                    </HeroLink>
                    {#if AI_FEATURES_ENABLED}
                        <HeroLink href={resolve('/chat')}>
                            {#snippet icon()}<SparklesIcon style="font-size: 1.8rem" />{/snippet}
                            {#snippet description()}AI Chat{/snippet}
                        </HeroLink>
                    {/if}
                </nav>
            </div>
        </div>

        {@render rule()}

        <!-- only on a screen wide enough for the editor, added once the page knows: a phone gets
             neither the frame nor its picture -->
        {#if showDemo}
            <section class="frame showcase" aria-label="Examples running in the editor">
                <!-- the cover comes back once the pointer leaves the whole window, not on its way
                     to the tabs or the address bar -->
                <div
                    class="browser"
                    role="group"
                    bind:this={browserWindow}
                    onpointerleave={() => (frameActive = false)}
                >
                    <div class="browser-tabs">
                        <span class="lights" aria-hidden="true"><i></i><i></i><i></i></span>
                        {#each DEMO_TABS as tab, index (tab.id)}
                            <button
                                type="button"
                                class="browser-tab"
                                class:active={index === activeTab}
                                aria-pressed={index === activeTab}
                                onclick={() => openTab(index)}
                                {@attach tooltip(
                                    `Run the ${tab.language} ${tab.name} example here`
                                )}
                            >
                                <img src="/favicon.png" alt="" />
                                <span class="ellipsis">{tab.name}</span>
                                <span class="close" aria-hidden="true"><FaTimes /></span>
                            </button>
                        {/each}
                        <a class="browser-tab" href={examplesHref}>
                            <span class="tab-icon"><FaTh /></span>
                            <span class="ellipsis">Examples</span>
                        </a>
                        <a
                            class="new-tab"
                            href={resolve('/projects/create')}
                            aria-label="Create project"
                            {@attach tooltip('Start a new Project in the editor')}
                        >
                            <FaPlus />
                        </a>
                    </div>
                    <div class="browser-toolbar">
                        <div class="browser-nav">
                            <span class="nav-button" aria-hidden="true"><FaArrowLeft /></span>
                            <span class="nav-button" aria-hidden="true"><FaArrowRight /></span>
                            <button
                                type="button"
                                class="nav-button"
                                onclick={loadDemo}
                                aria-label={`Restart ${demo.name}`}
                                {@attach tooltip('Load the example again from the start')}
                            >
                                <FaRedo />
                            </button>
                        </div>
                        <a
                            class="address"
                            href={demo.path}
                            {@attach tooltip(`Open ${demo.name} in the editor`)}
                        >
                            <span class="lock"><FaLock /></span>
                            <span class="ellipsis"
                                ><span class="host">{SITE_HOST}</span>{demo.path}</span
                            >
                        </a>
                    </div>
                    <div
                        class="viewport"
                        role="group"
                        aria-label={`The editor running ${demo.name}`}
                    >
                        {#if !frameLoaded}
                            {#if activeTab === 0}
                                <img
                                    src="/images/ASM-RelayMaze.webp"
                                    alt="Relay Maze written in RISC-V assembly, running in ASM Editor"
                                    width="1917"
                                    height="909"
                                    loading="lazy"
                                />
                            {:else if frameWanted}
                                <p class="loading">Opening {demo.name}…</p>
                            {/if}
                        {/if}
                        {#if frameWanted}
                            {#key frameKey}
                                <iframe
                                    bind:this={demoFrame}
                                    src={demo.path}
                                    title={`ASM Editor running the ${demo.name} example`}
                                    allow="clipboard-write; fullscreen; autoplay"
                                    class:loaded={frameLoaded}
                                    onload={() => (frameLoaded = true)}
                                ></iframe>
                            {/key}
                            {#if frameLoaded && !frameActive}
                                <button type="button" class="activate" onclick={activateFrame}>
                                    <span class="activate-hint">Click to try the editor</span>
                                </button>
                            {/if}
                        {:else}
                            <span class="play">
                                <ButtonLink href={demo.path} style="gap: 0.6rem">
                                    <span class="icon"><FaPlay /></span>
                                    Play {demo.name}
                                </ButtonLink>
                            </span>
                        {/if}
                    </div>
                </div>
            </section>

            {@render rule()}
        {/if}

        <section class="frame docs" aria-labelledby="targets-title">
            <header class="section-head">
                <div>
                    <h2 id="targets-title"><em>Documentation</em> for five Instruction Sets</h2>
                    <p>
                        Read the interactive documentation of each ISA, with instructions,
                        directives and system calls. With descriptions, examples and how to use
                        them. Available <a class="inline-link" href={resolve('/documentation')}
                            >here</a
                        > or inside the editor.
                    </p>
                </div>
                <div class="head-links">
                    <ButtonLink href={resolve('/documentation')} style="gap: 0.6rem">
                        Open the documentation
                        <span class="chevron"><FaChevronRight /></span>
                    </ButtonLink>
                    <a class="text-link" href={coursesHref}>
                        View the courses
                        <span class="chevron"><FaChevronRight /></span>
                    </a>
                </div>
            </header>
            {@render rule()}
            <div class="targets">
                {#each LANDING_TARGETS as target (target.name)}
                    <article
                        class="target"
                        style="--tile: {target.color}"
                        class:ink-light={target.ink === 'light'}
                    >
                        <!-- the same page as the card's Documentation link, so it stays out of the
                             tab order and the accessibility tree -->
                        <a
                            class="tile"
                            href={resolveHref(target.documentation)}
                            aria-hidden="true"
                            tabindex="-1"
                        >
                            <span>{target.glyph}</span>
                        </a>
                        <div class="target-body">
                            <div class="target-head">
                                <h3>{target.name}</h3>
                            </div>
                            <p>{target.description}</p>
                            <div class="target-links">
                                <a class="docs-link" href={resolveHref(target.documentation)}>
                                    Documentation <span class="chevron"><FaChevronRight /></span>
                                </a>
                                {#if target.course}
                                    <a href={resolveHref(target.course)}>
                                        Course <span class="chevron"><FaChevronRight /></span>
                                    </a>
                                {/if}
                            </div>
                        </div>
                    </article>
                {/each}
            </div>
        </section>

        {@render band(1)}

        <section class="frame" aria-label="Debugging in the editor">
            <div class="cards">
                {#each showcases as card (card.title)}
                    <article class="card">
                        <div class="shot">
                            <div class="shot-inner">
                                <img
                                    src={card.image}
                                    alt={card.alt}
                                    width={card.width}
                                    height={card.height}
                                    loading="lazy"
                                />
                            </div>
                        </div>
                        <h3>{card.title}</h3>
                        <p>{card.description}</p>
                    </article>
                {/each}
            </div>
        </section>

        {@render band(2)}

        <section class="frame" aria-labelledby="deeper-title">
            <header class="section-head">
                <div>
                    <h2 id="deeper-title">From C to machine code, and back</h2>
                    <p>
                        See how C and C++ code is compiled to machine code, or decompile a program
                        to understand what it does.
                    </p>
                </div>
            </header>
            {@render rule()}
            <FeatureAccordion features={deeper} />
            {@render rule()}
            <nav class="tiles" aria-label="More of ASM Editor">
                {#each tiles as tile (tile.title)}
                    <a class="tile-link" href={tile.href}>
                        <span class="tile-title">
                            {tile.title}
                            <span class="arrow" aria-hidden="true"><FaArrowRight /></span>
                        </span>
                        <span class="tile-text">{tile.description}</span>
                    </a>
                {/each}
                <a
                    class="tile-link"
                    href="https://github.com/Specy/asm-editor"
                    target="_blank"
                    rel="noopener"
                >
                    <span class="tile-title">
                        <span class="icon"><FaGithub /></span>
                        GitHub
                        <span class="arrow" aria-hidden="true"><FaExternalLinkAlt /></span>
                    </span>
                    <span class="tile-text">Read the source, report a bug or star the project.</span
                    >
                </a>
            </nav>
            {@render rule()}
            <div class="agents">
                <AgentDocs level={2} />
            </div>
        </section>

        {@render band(3)}

        <section class="frame letter" aria-labelledby="research-title">
            <p class="kicker">Published research</p>
            <h2 id="research-title">ASM Editor at EDUCON 2026</h2>
            <p>
                ASM Editor is described in a peer-reviewed paper presented at the 2026 IEEE Global
                Engineering Education Conference, together with the first-year course it was built
                for.
            </p>
            <div class="divider" aria-hidden="true"></div>
            <p class="reference">
                E. Menichelli and L. Forlizzi, &ldquo;ASM Editor: Understanding Language
                Abstractions Through Assembly Programming&rdquo;, 2026 IEEE Global Engineering
                Education Conference (EDUCON), Cairo, Egypt, 2026.
            </p>
            <ButtonLink
                href="https://doi.org/10.1109/EDUCON67543.2026.11574463"
                kind="secondary"
                style="gap: 0.6rem"
                title="Read the EDUCON 2026 paper"
            >
                Read the paper <span class="chevron"><FaExternalLinkAlt /></span>
            </ButtonLink>
        </section>

        {@render rule()}

        <section class="frame closing" aria-labelledby="closing-title">
            <!-- the dividers' bytes, much fainter, behind the whole section -->
            <div class="closing-hex" aria-hidden="true">
                {#each hexStrip(200, 1200) as segment, i (i)}{#if segment.hot}<b>{segment.text}</b
                        >{:else}{segment.text}{/if}{/each}
            </div>
            <h2 id="closing-title">Write your first program</h2>
            <p>Start from an empty Project, or open an example and change it.</p>
            <div class="actions">
                {@render editorButton()}
                <ButtonLink href={examplesHref} kind="secondary" style="gap: 0.6rem">
                    <span class="icon" aria-hidden="true"><FaCode /></span>
                    Open an example
                </ButtonLink>
            </div>
        </section>

        {@render rule()}
    </div>
</Page>

<style lang="scss">
    @use '../styles/visually-hidden.scss' as *;

    .landing {
        --inner: min(100% - 2rem, 76rem);
        --lit:
            radial-gradient(
                ellipse 80% 70% at 50% 0%,
                color-mix(in srgb, var(--accent2) 85%, transparent),
                transparent 75%
            ),
            linear-gradient(
                180deg,
                color-mix(in srgb, var(--accent2) 30%, var(--background)),
                var(--secondary)
            );
        position: relative;
        width: 100%;
        color: var(--background-text);
        padding-bottom: 4rem;
    }

    h1,
    h2,
    h3 {
        font-weight: 400;
        margin: 0;
    }

    .frame {
        position: relative;
        width: var(--inner);
        margin: 0 auto;
        border-inline: 1px solid var(--line);
    }

    /* a divider across the page, a dot where it crosses the frame; the dots sit in a box laid out
       as the frame is, the same width between the same automatic margins, so they round to the
       same pixels as the frame's lines and stay centred on them at any width */
    .rule {
        position: relative;
        z-index: 3;
        /* a border, drawn a whole device pixel thick as the frame's lines are, where a box 1px
           high came out one or two pixels thick on a scaled screen */
        border-top: 1px solid var(--line);
    }

    /* over the rule's line, which is its border, taking no room below it */
    .rule-frame {
        position: relative;
        width: var(--inner);
        height: 1px;
        margin: -1px auto 0;

        /* 5px over a 1px line: two pixels each side */
        i {
            position: absolute;
            top: -2px;
            width: 5px;
            height: 5px;
            border-radius: 50%;
            background: color-mix(in srgb, var(--background-text) 40%, transparent);
        }

        i:nth-child(1) {
            left: -2px;
        }

        i:nth-child(2) {
            right: -2px;
        }
    }

    /* a rule inside a section only crosses the frame, so it has no guides to mark */
    .frame .rule i {
        display: none;
    }

    .band {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.15rem;
        height: 3.4rem;
        overflow: hidden;
        mask-image: linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent);
    }

    .hex {
        white-space: pre;
        font-family: var(--font-mono);
        font-size: 0.8rem;
        line-height: 1.3;
        letter-spacing: 0.08em;
        color: color-mix(in srgb, var(--background-text) 16%, transparent);

        b {
            font-weight: 400;
            color: color-mix(in srgb, var(--accent) 50%, transparent);
        }
    }

    .chevron {
        display: inline-flex;
        width: var(--fs-micro);
        opacity: 0.8;
    }

    /* ---- hero ---- */

    /* the hero and the quick links fill the first screen, the links at its foot, when they fit */
    .first-screen {
        display: flex;
        flex-direction: column;
        min-height: calc(var(--screen-height) - 3.2rem);
    }

    .hero {
        position: relative;
        flex: 1;
        display: grid;
        place-items: center;
        min-height: 26rem;
        overflow: hidden;
    }

    .hero-content {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: 1.4rem;
        padding: 3rem 1.25rem;
        max-width: 48rem;
    }

    /* the instruction sets as one bar, a coloured square on each */
    .isas {
        display: flex;
        border: 1px solid var(--line-strong);
        border-radius: var(--r-control);
        background: color-mix(in srgb, var(--background) 60%, transparent);
        backdrop-filter: blur(8px);
        overflow: hidden;

        button {
            all: unset;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.4rem 0.9rem;
            cursor: pointer;
            font-family: var(--font-mono);
            font-size: var(--fs-small);
            color: var(--background-text);

            &::before {
                content: '';
                width: 0.5rem;
                height: 0.5rem;
                border-radius: 2px;
                background: var(--dot);
            }

            &:hover {
                background: color-mix(in srgb, var(--dot) 16%, transparent);
            }

            &:focus-visible {
                outline: 2px solid var(--accent);
                outline-offset: -2px;
            }

            &:disabled {
                cursor: progress;
            }
        }

        button + button {
            border-left: 1px solid var(--line-strong);
        }
    }

    /* Fira Code's line box puts its capitals off centre, low on one system and high on another:
       trimmed to the capitals, the padding centres what is seen, the same everywhere */
    @supports (text-box: trim-both cap alphabetic) {
        .isas button {
            padding-block: 0.65rem;
        }

        /* on the label rather than the button, as a flex container's text is not trimmed */
        .isa-name {
            display: block;
            text-box: trim-both cap alphabetic;
        }
    }

    @media (max-width: 480px) {
        .isas button {
            padding-inline: 0.6rem;
        }
    }

    /* the app's own face */
    h1 {
        font-family: var(--font-ui);
        font-weight: 500;
        font-size: clamp(2.5rem, 5.5vw, 4rem);
        line-height: 1.08;
        letter-spacing: -0.01em;
        text-shadow: 0 0 2rem var(--background);

        em {
            font-style: normal;
            color: var(--accent);
        }
    }

    .lede {
        font-family: var(--font-mono);
        font-size: var(--fs-body);
        line-height: 1.7;
        letter-spacing: 0.02em;
        color: var(--text-muted);
        max-width: 29rem;
    }

    .actions .icon {
        display: flex;
        width: var(--fs-small);
    }

    .actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 0.7rem;
        margin-top: 0.4rem;
    }

    .actions.install {
        margin-top: -0.7rem;
    }

    .actions.install.hidden {
        visibility: hidden;
    }

    /* ---- quick links ---- */

    .quick-row {
        position: relative;
        overflow: hidden;
    }

    .quick-hex {
        position: absolute;
        inset: 0;
        overflow: hidden;
        font-family: var(--font-mono);
        font-size: 0.8rem;
        line-height: 1.45;
        letter-spacing: 0.08em;
        word-spacing: 0.1em;
        text-align: justify;
        color: color-mix(in srgb, var(--background-text) 16%, transparent);
        pointer-events: none;
        user-select: none;
        /* the hero's fade: gone at the screen's edges, whole at its middle */
        mask-image: linear-gradient(90deg, transparent, #000 50%, transparent);

        b {
            font-weight: 400;
            color: color-mix(in srgb, var(--accent) 50%, transparent);
        }
    }

    /* no background of its own, so the bytes show through the cards; the lines between them
       are the cards' own borders, solid, each card's top and left one, pulled back a pixel so
       those along the row's edges fall outside it and are cut off */
    .quick-links {
        position: relative;
        display: flex;
        flex-wrap: wrap;
        overflow: hidden;
    }

    /* the cards a quarter see-through over the bytes, which show through faintly; a plain change of
       colour under the pointer, with nothing moving or fading */
    .quick-links :global(.link-element) {
        position: relative;
        background: color-mix(in srgb, var(--background) 75%, transparent);
        color: var(--background-text);
        transition: none;
        margin: -1px 0 0 -1px;
        /* the hairline drawn solid over the page, so the bytes do not show through it */
        border-top: 1px solid color-mix(in srgb, var(--tertiary) 60%, var(--background));
        border-left: 1px solid color-mix(in srgb, var(--tertiary) 60%, var(--background));

        &:hover {
            background: color-mix(in srgb, var(--accent) 14%, var(--background));
            color: var(--background-text);
        }
    }

    .section-head p,
    .target-body p,
    .card p,
    .tile-text,
    .closing p {
        font-family: var(--font-mono);
        font-size: var(--fs-small);
        line-height: 1.7;
        letter-spacing: 0.02em;
        color: var(--text-muted);
    }

    /* ---- the editor in a browser window ---- */

    .showcase {
        padding: 0.75rem;
        background: var(--lit);
    }

    .browser {
        --chrome: color-mix(in srgb, var(--background) 55%, var(--tertiary));
        border-radius: var(--r-overlay);
        border: 1px solid var(--line-strong);
        background: var(--chrome);
        box-shadow: var(--shadow-3);
        overflow: hidden;
    }

    .browser-tabs {
        display: flex;
        align-items: flex-end;
        gap: 0.2rem;
        height: 2.6rem;
        padding: 0 0.6rem;
    }

    /* the window buttons and the new-tab button sit on the tabs' middle line, as a browser's do */
    .lights,
    .new-tab {
        flex: none;
        display: flex;
        align-items: center;
        height: 2.15rem;
    }

    .lights {
        gap: 0.45rem;
        margin-right: 0.8rem;

        i {
            width: 0.75rem;
            height: 0.75rem;
            border-radius: 50%;
        }

        i:nth-child(1) {
            background: #ff5f57;
        }
        i:nth-child(2) {
            background: #febc2e;
        }
        i:nth-child(3) {
            background: #28c840;
        }
    }

    .browser-tab {
        all: unset;
        position: relative;
        box-sizing: border-box;
        display: flex;
        align-items: center;
        gap: 0.55rem;
        flex: 0 1 12rem;
        height: 2.15rem;
        min-width: 0;
        padding: 0 0.8rem;
        border-radius: 0.5rem 0.5rem 0 0;
        cursor: pointer;
        font-family: var(--font-ui);
        font-size: 0.82rem;
        color: var(--text-muted);
        transition:
            background-color var(--dur-fast),
            color var(--dur-fast);

        img {
            width: 1rem;
            height: 1rem;
            border-radius: 0.2rem;
        }

        .ellipsis {
            flex: 1;
            min-width: 0;
        }

        .close {
            flex: none;
            display: flex;
            width: 0.55rem;
            opacity: 0;
        }

        .tab-icon {
            flex: none;
            display: flex;
            width: 0.85rem;
        }

        &:hover {
            background: color-mix(in srgb, var(--secondary) 55%, transparent);
            color: var(--secondary-text);
        }

        &:focus-visible {
            outline: 2px solid var(--accent);
            outline-offset: -2px;
        }

        /* the line between two tabs, gone beside the open tab and the one under the pointer */
        &::after {
            content: '';
            position: absolute;
            right: -0.1rem;
            top: 50%;
            height: 1.1rem;
            width: 1px;
            transform: translateY(-50%);
            background: var(--line-strong);
        }

        &.active::after,
        &:hover::after,
        &:has(+ .active)::after,
        &:has(+ :hover)::after {
            opacity: 0;
        }

        &.active {
            background: var(--secondary);
            color: var(--secondary-text);
            cursor: default;

            .close {
                opacity: 0.5;
            }
        }
    }

    .new-tab {
        justify-content: center;
        width: 2rem;
        margin-left: 0.2rem;
        border-radius: var(--r-control);
        color: var(--text-muted);

        :global(svg) {
            width: var(--fs-caption);
        }

        &:hover {
            color: var(--secondary-text);
            background: color-mix(in srgb, var(--secondary) 55%, transparent);
        }

        &:focus-visible {
            outline: 2px solid var(--accent);
        }
    }

    .loading {
        align-self: center;
        justify-self: center;
        font-family: var(--font-mono);
        font-size: var(--fs-small);
        color: var(--text-muted);
    }

    .browser-toolbar {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        height: 2.6rem;
        padding: 0 0.6rem;
        background: var(--secondary);
        color: var(--secondary-text);
        border-bottom: 1px solid var(--line);
    }

    .browser-nav {
        display: flex;
        gap: 0.1rem;
    }

    .nav-button {
        all: unset;
        display: grid;
        place-items: center;
        width: 1.9rem;
        height: 1.9rem;
        border-radius: 50%;
        color: var(--text-muted);

        :global(svg) {
            width: var(--fs-caption);
        }

        &:is(button) {
            cursor: pointer;
        }

        &:is(button):hover {
            color: var(--secondary-text);
            background: var(--hover-bg);
        }

        &:focus-visible {
            outline: 2px solid var(--accent);
        }
    }

    .address {
        flex: 1;
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 0.55rem;
        height: 1.85rem;
        padding: 0 0.85rem;
        border-radius: var(--r-pill);
        background: color-mix(in srgb, var(--background) 65%, var(--secondary));
        font-family: var(--font-mono);
        font-size: 0.8rem;
        color: var(--text-muted);

        .lock {
            flex: none;
            display: flex;
            width: 0.6rem;
        }

        .host {
            color: var(--secondary-text);
        }

        &:hover {
            box-shadow: inset 0 0 0 1px var(--line-strong);
        }

        &:focus-visible {
            outline: 2px solid var(--accent);
        }
    }

    .viewport {
        position: relative;
        display: grid;
        aspect-ratio: 2.25 / 1;
        overflow: hidden;
        background: var(--background);

        > * {
            grid-area: 1 / 1;
        }

        img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            object-position: left top;
        }

        iframe {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            border: none;
            opacity: 0;
            transition: opacity 0.5s ease;
        }

        iframe.loaded {
            opacity: 1;
        }
    }

    /* over the framed editor until it is clicked, so the wheel scrolls the page */
    .activate {
        all: unset;
        /* after the unset, which clears the grid area every child of the viewport shares */
        grid-area: 1 / 1;
        position: relative;
        display: grid;
        place-items: center;
        cursor: pointer;

        &:hover,
        &:focus-visible {
            background: var(--scrim);
        }

        &:hover .activate-hint,
        &:focus-visible .activate-hint {
            opacity: 1;
            transform: none;
        }
    }

    .activate-hint {
        padding: 0.7rem 1.2rem;
        border-radius: var(--r-control);
        background: var(--secondary);
        color: var(--secondary-text);
        border: 1px solid var(--line-strong);
        font-size: var(--fs-body);
        box-shadow: var(--shadow-3);
        opacity: 0;
        transform: translateY(0.3rem);
        transition:
            opacity var(--dur-base),
            transform var(--dur-base);
    }

    .play {
        align-self: center;
        justify-self: center;
        z-index: 1;

        .icon {
            display: flex;
            width: var(--fs-caption);
        }
    }

    /* too narrow for the editor: the screenshot and its link stand in */
    @media (max-width: 900px) {
        .viewport {
            aspect-ratio: 1917 / 909;
        }
    }

    /* ---- section headers ---- */

    .section-head {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 1.5rem 3rem;
        padding: 2.75rem 2.5rem;

        h2 {
            font-family: var(--font-read);
            font-size: clamp(1.8rem, 3.5vw, 2.3rem);
            line-height: 1.2;
            margin-bottom: 0.7rem;
        }

        p {
            font-size: var(--fs-body);
            max-width: 36rem;
        }
    }

    /* the button, and a link under it lined up with its left edge */
    .head-links {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 0.8rem;
        flex-shrink: 0;
    }

    /* a link inside a sentence, in the accent like the page's other text links */
    .inline-link {
        color: var(--accent);
        text-decoration: underline;
        text-underline-offset: 0.25em;
        text-decoration-color: color-mix(in srgb, var(--accent) 45%, transparent);

        &:hover {
            text-decoration-color: currentColor;
        }
    }

    .text-link {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        color: var(--accent);
        font-family: var(--font-mono);
        font-size: var(--fs-small);
        text-decoration: underline;
        text-underline-offset: 0.25em;
        text-decoration-color: color-mix(in srgb, var(--accent) 45%, transparent);

        &:hover {
            text-decoration-color: currentColor;
        }

        &:focus-visible {
            outline: 2px solid var(--accent);
            outline-offset: 2px;
        }
    }

    /* ---- the instruction sets ---- */

    /* the lines between the cells are each cell's own top and left border, pulled back a pixel so
       those along the grid's edges fall outside it and are cut off, as the quick links' are: a
       border is drawn a whole device pixel wide, as the frame's lines are, where a 1px gap
       showing the grid's background came out one or two pixels wide on a scaled screen */
    .targets,
    .cards,
    .tiles {
        display: grid;
        overflow: hidden;
        /* the hairline over the page, solid, so a hovered tile does not tint its own two lines */
        --grid-line: color-mix(in srgb, var(--tertiary) 60%, var(--background));
    }

    .target,
    .card,
    .tile-link {
        margin: -1px 0 0 -1px;
        border-top: 1px solid var(--grid-line);
        border-left: 1px solid var(--grid-line);
    }

    .targets {
        grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .target {
        display: grid;
        grid-template-columns: 6.5rem minmax(0, 1fr);
        background: var(--background);
        --ink: #14161b;

        &.ink-light {
            --ink: #ffffff;
        }
    }

    .tile {
        display: grid;
        place-items: center;
        cursor: pointer;
        background:
            repeating-linear-gradient(135deg, rgb(255 255 255 / 0.13) 0 1px, transparent 1px 7px),
            linear-gradient(160deg, color-mix(in srgb, var(--tile) 85%, white), var(--tile) 60%);
        box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.18);

        span {
            font-family: var(--font-mono);
            font-size: 1.35rem;
            color: var(--ink);
            padding: 0.2rem 0.45rem;
            border: 2px solid color-mix(in srgb, var(--ink) 70%, transparent);
            border-radius: 0.3rem;
        }
    }

    .target-body {
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
        padding: 1.3rem 1.4rem 1.2rem;

        p {
            flex: 1;
            font-size: var(--fs-small);
        }
    }

    .target-head {
        display: flex;
        align-items: baseline;
        gap: 0.7rem;
        /* with the body's own gap, the title stands apart from the text under it */
        margin-bottom: 0.3rem;

        h3 {
            font-family: var(--font-read);
            font-weight: 500;
            font-size: var(--fs-h3);
        }
    }

    .target-links {
        display: flex;
        gap: 1.2rem;

        a {
            display: inline-flex;
            align-items: center;
            gap: 0.4rem;
            font-family: var(--font-mono);
            font-size: var(--fs-small);
            /* the tile's colour, pulled towards the text so it reads on light and dark themes */
            color: color-mix(in srgb, var(--tile) 70%, var(--background-text));

            &:hover {
                text-decoration: underline;
                text-underline-offset: 0.25em;
            }
        }
    }

    /* ---- the documentation ---- */

    .docs {
        background: linear-gradient(
            180deg,
            color-mix(in srgb, var(--accent) 11%, var(--background)),
            var(--background) 22rem
        );
        box-shadow: inset 0 3px 0 var(--accent);

        .section-head h2 em {
            font-style: italic;
            color: var(--accent);
        }
    }

    /* ---- the feature cards ---- */

    .cards {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .card {
        padding: 2.5rem;
        background: var(--background);

        h3 {
            font-family: var(--font-read);
            font-weight: 500;
            font-size: var(--fs-h3);
            margin: 1.4rem 0 0.8rem;
        }

        p {
            max-width: 32rem;
        }
    }

    .shot {
        border: 1px dashed var(--line-strong);
        border-radius: 0.2rem;
    }

    /* the picture covers the whole frame inside the dashed edge */
    .shot-inner {
        aspect-ratio: 16 / 10;
        overflow: hidden;
        border-radius: 0.2rem;

        img {
            display: block;
            width: 100%;
            height: 100%;
            object-fit: cover;
            object-position: left top;
        }
    }

    /* ---- the navbar's Create project ---- */

    /* `a.btn`, so this outweighs the Button's own size rule whichever stylesheet loads last (the
       navbar's Donate and Star say why) */
    .create-project {
        display: flex;

        :global(a.btn) {
            gap: 0.5rem;
            height: 2.2rem;
            padding: 0 1rem;
        }
    }

    .create-icon {
        display: flex;
        width: var(--fs-caption);
    }

    @media (max-width: 760px) {
        .create-project :global(a.btn) {
            width: 2.2rem;
            padding: 0;
        }

        .create-label {
            @include visually-hidden;
        }
    }

    /* ---- the more-of-the-site tiles ---- */

    .tiles {
        grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .tile-link {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        padding: 1.8rem 2rem;
        background: var(--background);
        transition: background-color var(--dur-fast);

        /* the row tint (design-system.md, D4, the text at 10%) mixed into the tile's own fill, which
           hides the grid's lines, so it fades in as a colour does */
        &:hover {
            background-color: color-mix(in srgb, currentColor 10%, var(--background));

            .arrow {
                transform: translateX(3px);
                opacity: 1;
            }
        }

        &:focus-visible {
            outline: 2px solid var(--accent);
            outline-offset: -2px;
        }
    }

    .tile-title {
        display: flex;
        align-items: center;
        gap: 0.55rem;
        font-family: var(--font-read);
        font-size: var(--fs-lead);

        .icon {
            display: flex;
            width: var(--fs-body);
        }
    }

    .arrow {
        display: flex;
        width: var(--fs-caption);
        opacity: 0.5;
        transition:
            transform var(--dur-fast),
            opacity var(--dur-fast);
    }

    .tile-text {
        font-size: var(--fs-small);
    }

    .agents {
        padding: 2.5rem;

        :global(section .heading) {
            font-family: var(--font-read);
            font-weight: 400;
            font-size: var(--fs-h3);
        }

        :global(.agents > p) {
            font-family: var(--font-mono);
            font-size: var(--fs-small);
            letter-spacing: 0.02em;
            color: var(--text-muted);
        }
    }

    /* ---- research ---- */

    .letter {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: 1.1rem;
        padding: 4.5rem 1.5rem;

        h2 {
            font-family: var(--font-read);
            font-size: clamp(1.7rem, 3.2vw, 2.1rem);
        }

        p {
            font-family: var(--font-read);
            font-size: var(--fs-prose);
            line-height: 1.75;
            max-width: 40rem;
        }

        .kicker {
            font-family: var(--font-mono);
            font-size: var(--fs-small);
            color: var(--text-muted);
        }

        .reference {
            font-style: italic;
            font-size: var(--fs-body);
            color: var(--text-muted);
        }
    }

    .divider {
        width: 4rem;
        border-top: 1px solid var(--line-strong);
        margin: 0.4rem 0;
    }

    /* ---- closing call ---- */

    .closing {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: 1rem;
        padding: 5rem 1.5rem;
        background: var(--lit);
        /* the bytes go under the section's content and over its background */
        isolation: isolate;

        /* the hero title's face */
        h2 {
            font-family: var(--font-ui);
            font-weight: 500;
            font-size: clamp(2rem, 5vw, 3.2rem);
            color: var(--background-text);
        }

        .actions {
            margin-top: 0.8rem;
        }
    }

    /* the bytes of the dividers, wrapping to fill the section, far fainter than the bands' so the
       text over them reads as on a plain background; faded at the sides as the bands are, and
       towards the rules above and below */
    .closing-hex {
        position: absolute;
        inset: 0;
        z-index: -1;
        overflow: hidden;
        font-family: var(--font-mono);
        font-size: 0.8rem;
        line-height: 1.45;
        letter-spacing: 0.08em;
        word-spacing: 0.1em;
        text-align: justify;
        color: color-mix(in srgb, var(--background-text) 6%, transparent);
        pointer-events: none;
        user-select: none;
        mask-image:
            linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent),
            linear-gradient(180deg, transparent, #000 25%, #000 75%, transparent);
        mask-composite: intersect;

        b {
            font-weight: 400;
            color: color-mix(in srgb, var(--accent) 18%, transparent);
        }
    }

    /* ---- sizes ---- */

    @media (max-width: 1080px) {
        .targets {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }
    }

    @media (max-width: 900px) {
        .section-head {
            flex-direction: column;
            align-items: flex-start;
            padding: 2rem 1.25rem;
        }

        .cards,
        .tiles {
            grid-template-columns: 1fr;
        }

        .card {
            padding: 1.5rem 1.25rem 2rem;
        }

        .agents {
            padding: 1.5rem 1.25rem;
        }
    }

    @media (max-width: 640px) {
        .landing {
            --inner: calc(100% - 1rem);
        }

        /* the picture across the card's whole width, from its top edge */
        .shot {
            margin: -1.5rem -1.25rem 0;
            border: none;
            border-radius: 0;
        }

        .shot-inner {
            border-radius: 0;
        }

        .hero-content {
            padding: 3.5rem 0.75rem;
        }

        /* the instruction sets as plain names, with no coloured square */
        .isas button::before {
            display: none;
        }

        /* the bytes under the quick links fade only near the edges, as a phone is narrow */
        .quick-hex {
            mask-image: linear-gradient(90deg, transparent, #000 20%, #000 80%, transparent);
        }

        .targets {
            grid-template-columns: 1fr;
        }

        .target {
            grid-template-columns: 4.5rem minmax(0, 1fr);
        }

        .tile span {
            font-size: var(--fs-body);
        }

        .tile-link {
            padding: 1.4rem 1.25rem;
        }

        .showcase {
            padding: 0.5rem;
        }

        .browser-nav,
        .lights,
        .browser-tab img {
            display: none;
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .arrow,
        .viewport iframe {
            transition: none;
        }
    }
</style>
