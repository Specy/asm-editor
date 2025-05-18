import { mdsvex } from 'mdsvex'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'
import adapter from '@sveltejs/adapter-static'

const config = {
    preprocess: [vitePreprocess(), mdsvex()],
    kit: { adapter: adapter({ fallback: '404.html' }) },
    extensions: ['.svelte', '.svx']
}

export default config
