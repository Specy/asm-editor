import * as fs from 'node:fs/promises'

export async function getAllCourses() {
    const content = await import.meta.glob('$content/*/meta.json', { eager: true })
    return Object.entries(content)
        .map(([path, course]) => {
            const c = course as any
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
            const l = lecture as any
            return [
                path,
                {
                    name: l.name,
                    slug: path.split('/')[path.split('/').length - 2] as string,
                    description: l.description,
                    order: l.order
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
            const l = lecture as any
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
                    .map(([_, lecture]) => lecture)
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
