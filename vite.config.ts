import { sveltekit } from '@sveltejs/kit/vite';
import topLevelAwait from "vite-plugin-top-level-await";
import wasm from 'vite-plugin-wasm';
import type { UserConfig } from 'vite';
import { resolve } from 'path'

const config: UserConfig = {
	server: {
		port: 3000,
	},
	build: {
		target: "esnext"
	},
	resolve: {
		alias: {
			$cmp: resolve('./src/components/'),
			$sec: resolve('./src/'),
			$stores: resolve('./src/stores/'),
			$utils: resolve('./src/utils/')
		}
	},
	optimizeDeps: {
		exclude: [
		  "s68k"
		]
	  },
	plugins: [
		sveltekit(),
		//topLevelAwait(), gives issues with dynamic route
		wasm(),
	],
};

export default config;