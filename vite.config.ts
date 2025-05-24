import { sveltekit } from '@sveltejs/kit/vite'
import topLevelAwait from 'vite-plugin-top-level-await'
//import { visualizer } from 'rollup-plugin-visualizer'
import wasm from 'vite-plugin-wasm'
import type { UserConfig } from 'vite'
import { resolve } from 'path'

const config: UserConfig = {
    server: {
        port: 3000
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
        exclude: ['@specy/s68k', '@battlefieldduck/xterm-svelte']
    },
    build: {
        sourcemap: false,
        minify: 'terser'
    },
    plugins: [
        sveltekit(),
        topLevelAwait(),
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
