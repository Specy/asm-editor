import { sveltekit } from '@sveltejs/kit/vite'
//import { visualizer } from 'rollup-plugin-visualizer'
import wasm from 'vite-plugin-wasm'
import Icons from 'unplugin-icons/vite'
import { defineConfig } from 'vitest/config'
//import devtoolsJson from 'vite-plugin-devtools-json';
export default defineConfig({
    server: {
        port: 4173
    },
    optimizeDeps: {
        exclude: ['@specy/s68k', '@specy/x86', '@battlefieldduck/xterm-svelte']
    },
    build: {
        sourcemap: true
    },
    plugins: [
        //devtoolsJson(),
        sveltekit(),
        Icons({
            compiler: 'svelte',
            // `scale: 0` drops the em-based width/height attributes; sizing comes from
            // the `.unplugin-icon` rule in global.css so icons fill their parent, the
            // same contract svelte-icons' IconBase provided.
            scale: 0,
            defaultClass: 'unplugin-icon'
        }),
        wasm()
        /*
         visualizer({
            emitFile: true,
            filename: 'stats.html'
        })
         */
    ],
    // The tests run on the app's own Vite config so a test resolves `$lib`, `$cmp` and the other
    // SvelteKit aliases exactly like the app does, and so the Svelte plugin compiles any `.svelte.ts`
    // module a test reaches. Peripheral logic itself stays plain TypeScript, which is why the
    // environment is node: nothing under test needs a DOM.
    test: {
        environment: 'node',
        include: ['src/**/*.test.ts']
    }
})
