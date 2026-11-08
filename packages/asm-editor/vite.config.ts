import { mdsvex } from 'mdsvex'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'
import adapter from '@sveltejs/adapter-static'
import { sveltekit } from '@sveltejs/kit/vite'
import wasm from 'vite-plugin-wasm'
import Icons from 'unplugin-icons/vite'
import { defineConfig } from 'vite-plus'
import { searchModelPlugin } from './scripts/search-model-plugin.ts'
import { examplesPlugin } from './scripts/examples-plugin.ts'

/** The Cores and the example archives, built before the editor starts. */
const BUILD_DEPENDENCIES = ['asm-editor-monorepo#build:cores', 'asm-editor-monorepo#build:examples']

export default defineConfig({
    run: {
        tasks: {
            //Only the site's build links the programs the archives carry: it Builds asmOS on the
            //x86 Core, about twenty seconds, so dev, test and measure serve the archives without
            //them, and a first Build in the editor makes them
            'build:example-outputs': {
                command:
                    'cross-env TZ=UTC vp test run --config vitest.examples.config.ts scripts/examples/buildOutputs.task.ts',
                dependsOn: ['asm-editor-monorepo#build:examples', 'asm-editor-monorepo#build:x86'],
                cache: false
            },
            dev: {
                command: 'node scripts/search-model.mjs --optional && vp dev',
                dependsOn: BUILD_DEPENDENCIES,
                cache: false
            },
            build: {
                //then checks the Markdown twins the prerender wrote (ADR 0077)
                command:
                    'node scripts/search-model.mjs && cross-env NODE_OPTIONS=--max_old_space_size=6000 vp build && node scripts/twins-check.mjs',
                dependsOn: [...BUILD_DEPENDENCIES, 'build:example-outputs'],
                cache: false
            },
            test: {
                command: 'node scripts/search-model.mjs --optional && vp test run',
                dependsOn: BUILD_DEPENDENCIES,
                cache: false
            },
            measure: {
                //the measurements run under node: the jsdom project would only fail to load them
                command: 'vp test run --config vitest.measure.config.ts --project node',
                dependsOn: BUILD_DEPENDENCIES,
                cache: false
            }
        }
    },
    server: {
        port: 4173,
        // Cloudflare quick tunnels (`cloudflared tunnel --url`), whose random hostnames are all
        // under trycloudflare.com, to open the dev server from another device
        allowedHosts: ['.trycloudflare.com'],
        fs: {
            // The Cores are workspace packages, so Vite resolves their files to their real paths
            // under `packages/`, outside the app that SvelteKit's allow list covers. Without this
            // the `.wasm` a Core's module fetches is refused, and the 403 page itself reaches
            // `WebAssembly.instantiate`, which reports a bad magic word.
            allow: ['..']
        },
        watch: {
            // The search model and the vectors the index build caches; nothing imports them.
            ignored: ['**/.cache/**']
        }
    },
    optimizeDeps: {
        // The decompiler fetches its wasm and processor description from beside its module
        // (`new URL(…, import.meta.url)`), which pre-bundling would move away from them.
        exclude: ['@specy/s68k', '@specy/x86', '@specy/decompiler']
    },
    build: {
        sourcemap: true
    },
    plugins: [
        sveltekit({
            preprocess: [vitePreprocess(), mdsvex()],
            extensions: ['.svelte', '.svx'],
            // A page's stylesheets up to 30 KB inside its HTML, so a prerendered page paints
            // without waiting for them: they shared the line with about 100 modulepreloads. That
            // is every one the index, documentation, blog and course pages link (the root
            // layout's is 19 KB, the largest 28 KB); the Workbench's look (viewport.css, 44 KB),
            // which lectures, instruction pages and the embed link, stays a file. Inlining all of
            // it took first paint on a production build with Slow 4G throttling from 2.8-4.1 s to
            // 0.9-1.3 s, and on Fast 4G from 0.9-1.5 s to 0.56-1.1 s, for 9-24 KB more of HTML
            // per page (brotli).
            inlineStyleThreshold: 30_000,
            // Written to the repository root, where the deploy picks it up.
            adapter: adapter({ pages: '../../build', assets: '../../build', fallback: '404.html' })
        }),

        Icons({
            compiler: 'svelte',
            // `scale: 0` drops the em-based width/height attributes
            scale: 0,
            defaultClass: 'unplugin-icon'
        }),
        wasm(),
        searchModelPlugin(),
        examplesPlugin()
    ],
    worker: {
        format: 'es',
        plugins: () => [wasm()]
    },
    // The tests run on the app's own Vite config so a test resolves package subpath imports
    // exactly like the app does, and so the Svelte plugin compiles any `.svelte.ts`
    // module a test reaches. Peripheral logic itself stays plain TypeScript, which is why the
    // default environment is node.
    //
    // `*.dom.test.ts` is the exception. Mounting a component needs a DOM and Svelte's browser
    // build, so those files run in their own project.
    test: {
        projects: [
            {
                extends: true,
                test: {
                    name: 'node',
                    environment: 'node',
                    include: ['src/**/*.test.ts'],
                    exclude: ['src/**/*.dom.test.ts']
                }
            },
            {
                extends: true,
                resolve: { conditions: ['browser'] },
                test: {
                    name: 'dom',
                    environment: 'jsdom',
                    include: ['src/**/*.dom.test.ts']
                }
            }
        ]
    }
})
