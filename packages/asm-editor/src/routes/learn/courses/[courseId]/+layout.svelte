<script lang="ts">
    import DefaultNavbar from '#cmp/shared/layout/DefaultNavbar.svelte'
    import TogglableSection from '#cmp/shared/layout/TogglableSection.svelte'
    import FaDonate from '~icons/fa-solid/heart'

    import Icon from '#cmp/shared/layout/Icon.svelte'
    import Column from '#cmp/shared/layout/Column.svelte'
    import MaskedScroll from '#cmp/shared/layout/MaskedScroll.svelte'
    import Sidebar from '#cmp/shared/layout/Sidebar.svelte'
    import type { PageData } from './$types'
    import LecturesMenu from '#cmp/content/LecturesMenu.svelte'
    import Header from '#cmp/shared/layout/Header.svelte'
    import { page } from '$app/state'
    import ButtonLink from '#cmp/shared/button/ButtonLink.svelte'
    import OpenEditorButton from '#cmp/shared/button/OpenEditorButton.svelte'
    import { resolve } from '$app/paths'
    import { courseTheme } from '#lib/languages/languageColors.ts'
    import ThemeScope from '#cmp/shared/providers/ThemeScope.svelte'
    import { lectureAgent } from './lectureAgent.svelte'
    import { onMount } from 'svelte'
    import SearchLauncher from '#cmp/search/SearchLauncher.svelte'
    import SearchPalette from '#cmp/search/SearchPalette.svelte'
    import { COURSES_SCOPE, courseLanguage, languageScope } from '#lib/search/scope.ts'
    import { searchClient } from '#lib/search/searchClient.svelte.ts'
    import { tooltip } from '#cmp/shared/floating/tooltip.svelte.ts'

    interface Props {
        children?: import('svelte').Snippet
        data: PageData
    }

    let { children, data }: Props = $props()

    let currentLectureName = $derived(`${page.params.moduleId}-${page.params.lectureId}`)
    // the course's own page, which its name at the sidebar's top links to
    let coursePath = $derived(resolve('/learn/courses/[courseId]', { courseId: data.course.slug }))
    let onCoursePage = $derived(
        page.url.pathname.replace(/\/$/, '') === coursePath.replace(/\/$/, '')
    )

    let menuOpen = $state(false)

    /** On a lecture the navbar's AI button opens the lecture's agent rather than the AI Chat page */
    const aiToggle = $derived(
        lectureAgent.available
            ? {
                  open: lectureAgent.open,
                  label: lectureAgent.open ? 'Close' : 'Ask AI',
                  title: lectureAgent.open ? 'Close the AI chat' : 'Ask AI about this lecture',
                  onclick: () => (lectureAgent.open = !lectureAgent.open)
              }
            : undefined
    )

    /**
     * A Language course searches its language's Documentation, itself and the General course; the
     * General course searches every Course ([the design record](../../../../../../../docs/design/documentation-search.md)).
     */
    const scope = $derived.by(() => {
        const language = courseLanguage(data.course.slug)
        return language ? languageScope(language) : COURSES_SCOPE
    })
    const placeholder = $derived(
        courseLanguage(data.course.slug)
            ? `Search ${data.course.name} and its documentation`
            : 'Search in every course'
    )
    onMount(() => searchClient.preload(scope))
</script>

<!-- A Language course shows its language's colours, the way `/documentation/<language>` does.
     One layout serves every course, so this follows the slug rather than the mount. -->
<ThemeScope theme={courseTheme(data.course.slug)}>
    <DefaultNavbar {aiToggle} bind:menuOpen style="border-bottom-left-radius: 0;" />

    <Sidebar bind:menuOpen menuStyle="gap: 0; overflow-y: hidden;">
        <Column padding="0 1rem 0" gap="1rem">
            <a
                onclick={() => (menuOpen = false)}
                href={coursePath}
                aria-current={onCoursePage ? 'page' : undefined}
            >
                <!-- Sidebar chrome, not the document's subject: each page under this layout
                     titles itself with its own <Header>. Matches the module headings below. -->
                <Header type="h2" noMargin>
                    {data.course.name}
                </Header>
            </a>
            <SearchLauncher {placeholder} />
        </Column>
        <!-- the chapters as the exam builder's outline draws its groups (styles/outline.scss):
             each lecture a row run out to the sidebar's left edge (the content's -0.5rem undoes
             the section's padding), so the current lecture's accent edge is the sidebar's side,
             the rows edge to edge with their own padding the rhythm, their text under the
             chapter's name (2.2rem: the arrow's 1.4rem, its 0.4rem gap and the section's 0.5rem,
             less the title's -0.1rem) -->
        <MaskedScroll gap="0">
            {#each data.course.modules as module (module.slug)}
                <!-- under the course's name, the sidebar's h2 -->
                <TogglableSection
                    open={true}
                    level={3}
                    sticky
                    inset="0.5rem"
                    sectionStyle="margin-left: -0.5rem; padding-left: 0; border-left: none; gap: 0;"
                    style="padding-block: 0.5rem; gap: 0.3rem;"
                >
                    {#snippet title()}
                        <span style="font-size: 1rem; margin-left: -0.1rem">
                            {module.name}
                        </span>
                    {/snippet}
                    <LecturesMenu
                        outline
                        currentLecture={module.lectures.find(
                            (l) => `${module.slug}-${l.slug}` === currentLectureName
                        )}
                        lectures={module.lectures}
                        lectureStyle="padding-left: 2.2rem"
                        onClick={() => (menuOpen = false)}
                        courseId={data.course.slug}
                        moduleId={module.slug}
                    />
                </TogglableSection>
            {/each}
        </MaskedScroll>
        <Column style="margin-top: auto;" padding="0.5rem" gap="0.5rem">
            <ButtonLink
                style="width: 100%; gap: 0.5rem"
                kind="secondary"
                href="/donate"
                {@attach tooltip('Donate to the project')}
            >
                <Icon>
                    <FaDonate />
                </Icon>
                Donate
            </ButtonLink>
            <OpenEditorButton />
        </Column>

        {#snippet content()}
            <Column flex1 style="padding-top: 3.2rem;">
                {@render children?.()}
            </Column>
        {/snippet}
    </Sidebar>
    <SearchPalette {scope} {placeholder} />
</ThemeScope>
