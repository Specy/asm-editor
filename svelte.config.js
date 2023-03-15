import preprocess from 'svelte-preprocess';
import adapter from '@sveltejs/adapter-static';
/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: preprocess(),
	
	kit: {
		adapter: adapter({
			fallback: '404.html',
			
		}),
	}
};

export default config;
