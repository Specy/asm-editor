import * as fs from 'node:fs/promises'

export async function getAllCourses() {
    const content = await import.meta.glob('$content/*/meta.json', { eager: true })
    return Object.entries(content)
        .map(([path, course]) => {
            const c = course as Omit<Course, 'slug'>
            return {
                id: c.id as string,
                name: c.name as string,
                authors: c.authors as string[],
                slug: path.split('/')[path.split('/').length - 2] as string,
                description: c.description as string,
                image: c.image as string,
                tags: c.tags as string[],
                date: c.date as string,
                order: c.order as number
            }
        })
        .sort((a, b) => {
            return a.order - b.order
        }) as Course[]
}

export type Course = {
    id: string
    name: string
    authors: string[]
    description: string
    slug: string
    image: string
    tags: string[]
    date: string
    order: number
}

export type Lecture = {
    name: string
    slug: string
    order: number
    description: string
    /**
     * What the Lecture teaches, spelled the same way in every Course that covers it. It is what ties
     * this Lecture to its deep dives in the Language courses and an Example to the same program in
     * the other languages; the links between them are derived from it, never written by hand
     * (`getTopicLinks`).
     */
    topic?: string
}
export type Module = {
    name: string
    slug: string
    description: string
    order: number
    lectures: Lecture[]
}
export type CourseWithModules = Course & {
    modules: Module[]
}

export async function getCourse(slug: string) {
    const courses = await getAllCourses()
    const course = courses.find((course) => course.slug === slug)
    if (!course) {
        throw new Error(`Course with slug ${slug} not found`)
    }
    const lectures = Object.entries(
        await import.meta.glob(`$content/*/*/*/meta.json`, { eager: true })
    )
        .filter(([path]) => {
            return path.startsWith('/src/content/' + course.slug)
        })
        .map(([path, lecture]) => {
            const l = lecture as Omit<Lecture, 'slug'>
            return [
                path,
                {
                    name: l.name,
                    slug: path.split('/')[path.split('/').length - 2] as string,
                    description: l.description,
                    order: l.order,
                    topic: l.topic
                } as Lecture
            ] as [string, Lecture]
        })

    const modules = Object.entries(
        await import.meta.glob(`$content/*/*/meta.json`, { eager: true })
    )
        .filter(([path]) => {
            return path.startsWith('/src/content/' + course.slug)
        })
        .map(([path, lecture]) => {
            const l = lecture as Omit<Module, 'slug' | 'lectures'>
            return [
                path,
                {
                    name: l.name,
                    slug: path.split('/')[path.split('/').length - 2] as string,
                    description: l.description,
                    order: l.order,
                    lectures: []
                } as Module
            ] as [string, Module]
        })

    const parsedModules = modules
        .map(([path, module]) => {
            const modulePath = path.replace('meta.json', '')
            return {
                ...module,
                lectures: lectures
                    .filter(([p]) => {
                        return p.startsWith(modulePath)
                    })
                    .map(([, lecture]) => lecture)
                    .sort((a, b) => {
                        return a.order - b.order
                    })
            }
        })
        .sort((a, b) => {
            return a.order - b.order
        })
    return {
        ...course,
        modules: parsedModules
    } as CourseWithModules
}

export async function getLecture(courseSlug: string, moduleSlug: string, lectureSlug: string) {
    const course = await getCourse(courseSlug)
    if (!course) {
        throw new Error(`Course with slug ${courseSlug} not found`)
    }
    const module = course.modules.find((module) => module.slug === moduleSlug)
    if (!module) {
        throw new Error(`Module with slug ${moduleSlug} not found`)
    }
    const lecture = module.lectures.find((lecture) => lecture.slug === lectureSlug)
    if (!lecture) {
        throw new Error(`Lecture with slug ${lectureSlug} not found`)
    }
    return lecture
}

export async function getLectureContent(
    courseSlug: string,
    moduleSlug: string,
    lectureSlug: string
) {
    return await fs.readFile(
        `src/content/${courseSlug}/${moduleSlug}/${lectureSlug}/index.md`,
        'utf-8'
    )
}

export async function getCourseContent(courseSlug: string) {
    return await fs.readFile(`src/content/${courseSlug}/index.md`, 'utf-8')
}

export async function getModuleContent(courseSlug: string, moduleSlug: string) {
    return await fs.readFile(`src/content/${courseSlug}/${moduleSlug}/index.md`, 'utf-8')
}

/**
 * The Course every other Course mirrors, and the only one whose Lectures are an overview rather than
 * a deep dive: the wording of a topic link depends on which side of it a reader is standing on.
 */
export const GENERAL_COURSE_SLUG = 'assembly-basics'

/** One Lecture that shares a Topic with the Lecture being read. */
export type TopicSibling = {
    courseSlug: string
    /** The course's name as a sentence says it: "M68K assembly" is "M68K" once inside one. */
    courseName: string
    moduleSlug: string
    lectureSlug: string
}

export type TopicLinks = {
    topic: string
    /** The General course's Lecture on this Topic, when the Lecture asking is not the one in it. */
    overview: TopicSibling | null
    /** The Language courses' Lectures on the same Topic, in the order the courses are listed in. */
    siblings: TopicSibling[]
}

type LectureEntry = {
    courseSlug: string
    moduleSlug: string
    lectureSlug: string
    topic?: string
}

/** Every Lecture of every Course, flat, which is what a Topic has to be looked up across. */
async function getAllLectures(): Promise<LectureEntry[]> {
    const content = await import.meta.glob(`$content/*/*/*/meta.json`, { eager: true })
    return Object.entries(content).map(([path, lecture]) => {
        const l = lecture as { topic?: string }
        const parts = path.split('/')
        return {
            courseSlug: parts[parts.length - 4] as string,
            moduleSlug: parts[parts.length - 3] as string,
            lectureSlug: parts[parts.length - 2] as string,
            topic: l.topic
        }
    })
}

function shortCourseName(name: string): string {
    return name.replace(/\s+assembly$/i, '')
}

/**
 * The other Lectures that teach the same Topic as this one. A Lecture with no `topic` in its
 * `meta.json`, and one whose topic nothing else covers, answer null, and the page draws nothing.
 */
export async function getTopicLinks(
    courseSlug: string,
    moduleSlug: string,
    lectureSlug: string
): Promise<TopicLinks | null> {
    const lectures = await getAllLectures()
    const current = lectures.find(
        (lecture) =>
            lecture.courseSlug === courseSlug &&
            lecture.moduleSlug === moduleSlug &&
            lecture.lectureSlug === lectureSlug
    )
    if (!current?.topic) return null
    const courses = await getAllCourses()
    const bySlug = new Map(courses.map((course) => [course.slug, course]))
    const found = lectures
        .filter((lecture) => lecture.topic === current.topic && lecture.lectureSlug !== lectureSlug)
        .flatMap((lecture) => {
            const course = bySlug.get(lecture.courseSlug)
            if (!course || lecture.courseSlug === courseSlug) return []
            return [
                {
                    order: course.order,
                    sibling: {
                        courseSlug: lecture.courseSlug,
                        courseName: shortCourseName(course.name),
                        moduleSlug: lecture.moduleSlug,
                        lectureSlug: lecture.lectureSlug
                    } as TopicSibling
                }
            ]
        })
        .sort((a, b) => a.order - b.order)
        .map((entry) => entry.sibling)
    const overview = found.find((sibling) => sibling.courseSlug === GENERAL_COURSE_SLUG) ?? null
    const siblings = found.filter((sibling) => sibling.courseSlug !== GENERAL_COURSE_SLUG)
    if (!overview && siblings.length === 0) return null
    return { topic: current.topic, overview, siblings }
}
