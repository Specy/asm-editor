import { mdsvex } from 'mdsvex'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'
import adapter from '@sveltejs/adapter-static'

const config = {
    preprocess: [
        vitePreprocess(),
        mdsvex({
            layout: {
                //_: resolve('./src/components/content/Layout.svelte')
                //lecture: resolve('./src/components/content/Layout.svelte')
            }
        })
    ],
    kit: {
        adapter: adapter({ fallback: '404.html' }),
        alias: {
            $cmp: 'src/components',
            $src: 'src',
            $stores: 'src/stores',
            $utils: 'src/utils',
            $content: 'src/content',
            $overrides: 'src/components/content/custom',
            $embed: 'src/components/content/Embed.svelte'
        }
    },
    extensions: ['.svelte', '.svx']
}

export default config
