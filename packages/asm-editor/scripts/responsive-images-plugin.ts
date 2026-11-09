import { readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp, { type WebpOptions } from 'sharp'
import type { Plugin } from 'vite'
import { IMAGE_VARIANT_RULES, variantPath } from '../src/lib/images/variants.ts'

/**
 * Smaller copies of the large static pictures ([variants.ts](../src/lib/images/variants.ts)), so a
 * page loads each picture at about the size it draws it, through `srcset`:
 *
 * - `virtual:responsive-images` gives each picture's size and the widths of its copies, which
 *   `responsiveImage` turns into a `srcset`, in the server render and in the browser alike;
 * - a build writes the copies beside their originals, as WebP (`-480w.webp`), in the client output;
 * - the dev server makes a copy when it is first asked for and keeps it in memory.
 *
 * The pictures are read when the server starts or the build begins: one added later needs a restart
 * to get copies, and until then it is shown as it is.
 */

const STATIC = fileURLToPath(new URL('../static/', import.meta.url))
const VIRTUAL_ID = 'virtual:responsive-images'
const RESOLVED_ID = '\0' + VIRTUAL_ID
/**
 * The screenshots are mostly text, which lossy WebP smears: at quality 82 the letters had blocky
 * edges and colour bleeding. 92 with `smartSubsample` (sharper colour at the edges of coloured
 * text) keeps them clean for about 45% more bytes than 82, still smaller than the originals.
 */
const WEBP: WebpOptions = { quality: 92, smartSubsample: true }

type Picture = { file: string; width: number; height: number; widths: number[] }

function walk(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = join(directory, entry.name)
        return entry.isDirectory() ? walk(path) : [path]
    })
}

async function scan(): Promise<Map<string, Picture>> {
    const pictures = new Map<string, Picture>()
    await Promise.all(
        walk(STATIC).map(async (file) => {
            const src = '/' + relative(STATIC, file).split(sep).join('/')
            const rule = IMAGE_VARIANT_RULES.find((rule) => rule.pattern.test(src))
            if (!rule) return
            const { width, height } = await sharp(file).metadata()
            if (!width || !height) return
            pictures.set(src, {
                file,
                width,
                height,
                widths: rule.widths.filter((copy) => copy < width)
            })
        })
    )
    return pictures
}

function makeCopy(picture: Picture, width: number): Promise<Buffer> {
    return sharp(picture.file).resize({ width }).webp(WEBP).toBuffer()
}

export function responsiveImagesPlugin(): Plugin {
    let serverBuild = false
    let scanned: Promise<Map<string, Picture>> | undefined
    const pictures = () => (scanned ??= scan())

    return {
        name: 'asm-editor:responsive-images',
        configResolved(config) {
            serverBuild = !!config.build.ssr
        },
        resolveId(id) {
            return id === VIRTUAL_ID ? RESOLVED_ID : undefined
        },
        async load(id) {
            if (id !== RESOLVED_ID) return
            const entries = [...(await pictures())]
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([src, picture]) => [src, [picture.width, picture.height, picture.widths]])
            return `export default ${JSON.stringify(Object.fromEntries(entries))}`
        },
        configureServer(server) {
            const copies = new Map<string, Promise<Buffer>>()
            server.middlewares.use((request, response, next) => {
                const path = decodeURIComponent((request.url ?? '').split('?')[0])
                if (!/-\d+w\.webp$/.test(path)) return next()
                pictures()
                    .then((all) => {
                        for (const [src, picture] of all) {
                            const width = picture.widths.find(
                                (copy) => variantPath(src, copy) === path
                            )
                            if (width === undefined) continue
                            let copy = copies.get(path)
                            if (!copy) {
                                copy = makeCopy(picture, width)
                                copies.set(path, copy)
                            }
                            return copy.then((buffer) => {
                                response.setHeader('Content-Type', 'image/webp')
                                response.setHeader('Cache-Control', 'no-cache')
                                response.end(buffer)
                            })
                        }
                        next()
                    })
                    .catch(next)
            })
        },
        async generateBundle() {
            if (serverBuild) return
            const jobs = [...(await pictures())].flatMap(([src, picture]) =>
                picture.widths.map(async (width) => {
                    this.emitFile({
                        type: 'asset',
                        fileName: variantPath(src, width).slice(1),
                        source: await makeCopy(picture, width)
                    })
                })
            )
            await Promise.all(jobs)
        }
    }
}
