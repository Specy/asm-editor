import { mdsvex } from 'mdsvex'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'
import adapter from '@sveltejs/adapter-static'
import { resolve } from 'path'

const config = {
    preprocess: [
      vitePreprocess(),
        mdsvex({
            layout: {
                //_: resolve('./src/components/content/Layout.svelte')
              //lecture: resolve('./src/components/content/Layout.svelte')
            },
        })
    ],
    kit: { adapter: adapter({ fallback: '404.html' }) },
    extensions: ['.svelte', '.svx']
}

export default config
