import { mdsvex } from 'mdsvex'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'
import adapter from '@sveltejs/adapter-static'
import { sveltekit } from '@sveltejs/kit/vite'
import wasm from 'vite-plugin-wasm'
import Icons from 'unplugin-icons/vite'
import { defineConfig } from 'vite-plus'
import { searchModelPlugin } from './scripts/search-model-plugin.ts'

/** The Cores the editor imports, built from their checkouts by the root's tasks. */
const CORES = ['asm-editor-monorepo#build:cores']

export default defineConfig({
    run: {
        tasks: {
            dev: {
                command: 'node scripts/search-model.mjs --optional && vp dev',
                dependsOn: CORES,
                cache: false
            },
            build: {
                command:
                    'node scripts/search-model.mjs && cross-env NODE_OPTIONS=--max_old_space_size=6000 vp build',
                dependsOn: CORES,
                cache: false
            },
            test: {
                command: 'node scripts/search-model.mjs --optional && vp test run',
                dependsOn: CORES,
                cache: false
            },
            measure: {
                command: 'vp test run --config vitest.measure.config.ts',
                dependsOn: CORES,
                cache: false
            }
        }
    },
    server: {
        port: 4173,
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
        exclude: ['@specy/s68k', '@specy/x86']
    },
    build: {
        sourcemap: true
    },
    plugins: [
        sveltekit({
            preprocess: [vitePreprocess(), mdsvex()],
            extensions: ['.svelte', '.svx'],
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
        searchModelPlugin()
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
