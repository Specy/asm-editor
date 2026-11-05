import type {
    Course,
    CourseWithModules,
    Lecture,
    TopicLinks,
    TopicSibling
} from '#lib/content/getters.ts'
import type { LectureInstructionGroup } from '#lib/content/lectureInstructions.ts'
import { GENERAL_COURSE } from '#lib/search/scope.ts'
import { DOCUMENTATION_SITES } from '#lib/documentation/site.ts'
import type { BlogPost, BlogPostSummary } from '#lib/blog/catalog.ts'
import type { Example } from '#lib/examples.ts'
import { rewriteMarkdown } from './rewrite'
import { twinLinks } from './links'
import { blocks, codeSpan, link, linkText, oneLine } from './format'
import { absoluteUrl, courseFullPathname, twinPathname } from './urls'

/**
 * The **Markdown twins** of the Courses, the Blog, the Examples page and the changelog, each from
 * what its page's own `load` returns
 * ([ADR 0077](../../../../../docs/adr/0077-agents-read-markdown-twins-derived-from-the-pages-sources.md)).
 */

function twinUrl(pathname: string): string {
    return absoluteUrl(twinPathname(pathname) ?? pathname)
}

const COURSES_PATH = '/learn/courses'

function coursePath(course: { slug: string }): string {
    return `${COURSES_PATH}/${course.slug}`
}

function lecturePath(course: string, module: string, lecture: string): string {
    return `${COURSES_PATH}/${course}/${module}/${lecture}`
}

/** A line of a list: the link, then its description. */
function item(text: string, url: string, description?: string): string {
    const said = description?.trim() ? `: ${oneLine(description)}` : ''
    return `- ${link(linkText(text), url)}${said}`
}

/** `/learn/courses.md`: every Course, in the Learn page's order. */
export function coursesTwin(courses: Course[]): string {
    return blocks(
        '# Courses',
        `Web page: ${absoluteUrl(COURSES_PATH)}`,
        courses
            .map((course) => item(course.name, twinUrl(coursePath(course)), course.description))
            .join('\n')
    )
}

/** `/learn/courses/<course>.md`: a Course's own text, then its Modules and their Lectures. */
export async function courseTwin(course: CourseWithModules, content: string): Promise<string> {
    const links = await twinLinks()
    const path = coursePath(course)
    return blocks(
        `# ${linkText(course.name)}`,
        `${link('Courses', twinUrl(COURSES_PATH))} › ${linkText(course.name)}\n\nWeb page: ${absoluteUrl(path)}`,
        `> ${oneLine(course.description)}`,
        course.authors.length && `By ${course.authors.join(', ')}`,
        rewriteMarkdown(content, links.rewriter(path)),
        ...course.modules.map((module) =>
            blocks(
                `## ${linkText(module.name)}`,
                module.description,
                module.lectures
                    .map((lecture) =>
                        item(
                            lecture.name,
                            twinUrl(lecturePath(course.slug, module.slug, lecture.slug)),
                            lecture.description
                        )
                    )
                    .join('\n')
            )
        ),
        '## Optional',
        `- ${link(`The whole ${linkText(course.name)} course`, absoluteUrl(courseFullPathname(course.slug)))}: every Lecture in order in one file, to search through`
    )
}

function siblingLinks(siblings: TopicSibling[]): string {
    return siblings
        .map((sibling) =>
            link(
                linkText(sibling.courseName),
                twinUrl(lecturePath(sibling.courseSlug, sibling.moduleSlug, sibling.lectureSlug))
            )
        )
        .join(', ')
}

/** The same Topic in the other Courses, as the Lecture's page links it. */
function topicLines(course: string, module: string, topicLinks: TopicLinks | null): string[] {
    if (!topicLinks) return []
    if (course === GENERAL_COURSE) {
        return topicLinks.siblings.length
            ? [`This topic in the language courses: ${siblingLinks(topicLinks.siblings)}`]
            : []
    }
    if (module === 'examples') {
        return topicLinks.siblings.length
            ? [`The same program in: ${siblingLinks(topicLinks.siblings)}`]
            : []
    }
    return [
        topicLinks.overview ? `Overview of this topic: ${siblingLinks([topicLinks.overview])}` : '',
        topicLinks.siblings.length ? `The same topic in: ${siblingLinks(topicLinks.siblings)}` : ''
    ].filter(Boolean)
}

/** What a Lecture's page `load` returns, which its twin reads as the page does. */
export type LecturePageData = {
    course: CourseWithModules
    lecture: Lecture
    content: string
    topicLinks: TopicLinks | null
    instructions: LectureInstructionGroup[]
}

/**
 * `/learn/courses/<course>/<module>/<lecture>.md`: where the Lecture sits, its text, the
 * instructions it uses, and the Lectures before and after it.
 */
export async function lectureTwin(moduleSlug: string, data: LecturePageData): Promise<string> {
    const links = await twinLinks()
    const { course, lecture } = data
    const path = lecturePath(course.slug, moduleSlug, lecture.slug)
    const module = course.modules.find((module) => module.slug === moduleSlug)
    const order = course.modules.flatMap((module) =>
        module.lectures.map((lecture) => ({ module, lecture }))
    )
    const at = order.findIndex(
        (entry) => entry.module.slug === moduleSlug && entry.lecture.slug === lecture.slug
    )
    const neighbour = (label: string, index: number) => {
        const entry = order[index]
        if (!entry) return undefined
        return `${label}: ${link(linkText(entry.lecture.name), twinUrl(lecturePath(course.slug, entry.module.slug, entry.lecture.slug)))}`
    }
    // a Lecture that repeats its title as a `# Title` keeps it as the twin's title
    const heading = /^# .*(\r?\n|$)/.exec(data.content)
    const text = heading ? data.content.slice(heading[0].length) : data.content
    const instructions = data.instructions.map(
        (group) =>
            `- ${DOCUMENTATION_SITES[group.language].label}: ${group.instructions
                .map((instruction) =>
                    link(codeSpan(instruction.name), twinUrl(instruction.pathname))
                )
                .join(', ')}`
    )
    return blocks(
        heading ? heading[0].trim() : `# ${linkText(lecture.name)}`,
        [
            `${link('Courses', twinUrl(COURSES_PATH))} › ${link(linkText(course.name), twinUrl(coursePath(course)))}${module ? ` › ${linkText(module.name)}` : ''}`,
            `Web page: ${absoluteUrl(path)}`
        ].join('\n\n'),
        lecture.description && `> ${oneLine(lecture.description)}`,
        topicLines(course.slug, moduleSlug, data.topicLinks).join('\n\n'),
        rewriteMarkdown(text, links.rewriter(path)),
        instructions.length && blocks('## Instructions in this Lecture', instructions.join('\n')),
        [neighbour('Previous', at - 1), neighbour('Next', at + 1)].filter(Boolean).join('\n\n')
    )
}

/** `/learn/courses/<course>/llms-full.txt`: the Course's twin, then every Lecture's, in order. */
export function courseFull(courseMarkdown: string, lectures: string[]): string {
    return [courseMarkdown, ...lectures].join('\n---\n\n')
}

function postLine(post: BlogPostSummary): string {
    const tags = post.tags.length ? ` (${post.tags.join(', ')})` : ''
    return `${item(post.title, twinUrl(post.pathname), `${post.datePublished}${tags}. ${post.description}`)}`
}

/** `/blog.md`: the posts to start with, the rest newest first, and the tags. */
export function blogTwin(data: {
    featured: BlogPostSummary[]
    recent: BlogPostSummary[]
    tags: { id: string; label: string; description: string }[]
}): string {
    return blocks(
        '# Blog',
        `Web page: ${absoluteUrl('/blog')}`,
        data.featured.length && blocks('## Start here', data.featured.map(postLine).join('\n')),
        data.recent.length && blocks('## More guides', data.recent.map(postLine).join('\n')),
        data.tags.length &&
            blocks(
                '## Tags',
                data.tags
                    .map((tag) => item(tag.label, twinUrl(`/blog/tags/${tag.id}`), tag.description))
                    .join('\n')
            )
    )
}

/** `/blog/posts/<slug>.md`: a post's text. */
export async function postTwin(post: BlogPost): Promise<string> {
    const links = await twinLinks()
    const dates = post.dateUpdated
        ? `Published ${post.datePublished}, updated ${post.dateUpdated}`
        : `Published ${post.datePublished}`
    return blocks(
        `# ${linkText(post.title)}`,
        `${link('Blog', twinUrl('/blog'))}\n\nWeb page: ${absoluteUrl(post.pathname)}`,
        `${dates}. Tags: ${post.tags.map((tag) => link(tag, twinUrl(`/blog/tags/${tag}`))).join(', ')}`,
        `> ${oneLine(post.description)}`,
        rewriteMarkdown(post.content, links.rewriter(post.pathname))
    )
}

/** `/blog/tags/<tag>.md`: a tag and its posts. */
export function tagTwin(data: {
    tag: { id: string; label: string; description: string }
    posts: BlogPostSummary[]
}): string {
    return blocks(
        `# ${linkText(data.tag.label)}`,
        `${link('Blog', twinUrl('/blog'))}\n\nWeb page: ${absoluteUrl(`/blog/tags/${data.tag.id}`)}`,
        data.tag.description,
        data.posts.map(postLine).join('\n')
    )
}

/**
 * `/examples.md`: the Examples page's programs with their archives, as its pickers list them. The
 * programs' sources stay in the archives, which the page does not unpack either.
 */
export function examplesTwin(examples: Example[]): string {
    return blocks(
        '# Examples',
        `Web page: ${absoluteUrl('/examples')}`,
        examples
            .map((example) => {
                const page = absoluteUrl(`/examples?example=${encodeURIComponent(example.id)}`)
                const archive = absoluteUrl(`/examples/${example.archive}`)
                return `- **${linkText(example.label)}**: ${oneLine(example.description)} ${link('Open it', page)} · ${link('Project archive (.asmproj, a zip)', archive)}`
            })
            .join('\n')
    )
}

/** `/changelog.md`: every version, newest first. */
export function changelogTwin(
    versions: { version: string; title?: string; date: Date; changes: string[] }[]
): string {
    return blocks(
        '# Changelog',
        `Web page: ${absoluteUrl('/changelog')}`,
        ...versions.map((version) =>
            blocks(
                `## ${version.version}${version.title ? `: ${version.title}` : ''}`,
                version.date.toISOString().slice(0, 10),
                version.changes.map((change) => `- ${oneLine(change)}`).join('\n')
            )
        )
    )
}
