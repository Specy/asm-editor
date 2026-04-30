import { sveltekit } from '@sveltejs/kit/vite'
//import { visualizer } from 'rollup-plugin-visualizer'
import wasm from 'vite-plugin-wasm'
import type { UserConfig } from 'vite'
import { resolve } from 'path'
//import devtoolsJson from 'vite-plugin-devtools-json';
const config: UserConfig = {
    server: {
        port: 4173
    },
    resolve: {
        alias: {
            $cmp: resolve('./src/components/'),
            $src: resolve('./src/'),
            $stores: resolve('./src/stores/'),
            $utils: resolve('./src/utils/'),
            $lib: resolve('./src/lib/'),
            $content: resolve('./src/content/'),
            $overrides: resolve('./src/components/content/custom'),
            $embed: resolve('./src/components/content/Embed.svelte')
        }
    },
    optimizeDeps: {
        exclude: ['@specy/s68k', '@specy/x86','@battlefieldduck/xterm-svelte']
    },
    build: {
        sourcemap: true,
    },
    plugins: [
        //devtoolsJson(),
        sveltekit(),
        wasm()
        /*
         visualizer({
            emitFile: true,
            filename: 'stats.html'
        })
         */
    ]
}

export default config
