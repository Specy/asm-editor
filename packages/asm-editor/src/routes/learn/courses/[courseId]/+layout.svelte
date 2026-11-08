<script lang="ts">
    import TogglableSection from '#cmp/shared/layout/TogglableSection.svelte'
    import FaDonate from '~icons/fa-solid/heart'

    import Icon from '#cmp/shared/layout/Icon.svelte'
    import SiteSidebarLayout from '#cmp/content/SiteSidebarLayout.svelte'
    import type { PageData } from './$types'
    import LecturesMenu from '#cmp/content/LecturesMenu.svelte'
    import Header from '#cmp/shared/layout/Header.svelte'
    import { page } from '$app/state'
    import ButtonLink from '#cmp/shared/button/ButtonLink.svelte'
    import { resolve } from '$app/paths'
    import { courseTheme } from '#lib/languages/languageColors.ts'
    import { lectureAgent } from './lectureAgent.svelte'
    import { COURSES_SCOPE, courseLanguage, languageScope } from '#lib/search/scope.ts'
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
</script>

<!-- A Language course shows its language's colours, the way `/documentation/<language>` does.
     One layout serves every course, so this follows the slug rather than the mount. -->
<SiteSidebarLayout theme={courseTheme(data.course.slug)} {scope} {placeholder} {aiToggle}>
    {#snippet header(closeMenu)}
        <a onclick={closeMenu} href={coursePath} aria-current={onCoursePage ? 'page' : undefined}>
            <!-- Sidebar chrome, not the document's subject: each page under this layout
                 titles itself with its own <Header>. Matches the module headings below. -->
            <Header type="h2" noMargin>
                {data.course.name}
            </Header>
        </a>
    {/snippet}

    {#snippet nav(closeMenu)}
        <!-- the chapters as the exam builder's outline draws its groups (styles/outline.scss),
             each lecture a row under its chapter's name -->
        {#each data.course.modules as module (module.slug)}
            <!-- under the course's name, the sidebar's h2 -->
            <TogglableSection open={true} level={3} sticky>
                {#snippet title()}{module.name}{/snippet}
                <LecturesMenu
                    outline
                    currentLecture={module.lectures.find(
                        (l) => `${module.slug}-${l.slug}` === currentLectureName
                    )}
                    lectures={module.lectures}
                    onClick={closeMenu}
                    courseId={data.course.slug}
                    moduleId={module.slug}
                />
            </TogglableSection>
        {/each}
    {/snippet}

    {#snippet footer()}
        <ButtonLink
            style="width: 100%;"
            kind="secondary"
            href={resolve('/donate')}
            {@attach tooltip('Donate to the project')}
        >
            <Icon>
                <FaDonate />
            </Icon>
            Donate
        </ButtonLink>
    {/snippet}

    {@render children?.()}
</SiteSidebarLayout>
