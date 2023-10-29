module.exports = {
	root: true,
	parser: '@typescript-eslint/parser',
	extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'prettier', 'plugin:svelte/recommended'],
	plugins: ['@typescript-eslint'],
	ignorePatterns: ['*.cjs'],
	overrides: [{ files: ['*.svelte'], parser: 'svelte-eslint-parser'}],
	settings: {
		'svelte3/typescript': () => require('typescript')
	},
	parserOptions: {
		sourceType: 'module',
		ecmaVersion: 2019
	},
		
	rules: {
		'@typescript-eslint/ban-ts-comment': [
		  'error',
		  {'ts-ignore': 'allow-with-description'},
		],
		'@typescript-eslint/explicit-module-boundary-types': 'off',
		'no-useless-escape': 'off'
	  },
	env: {
		browser: true,
		es2017: true,
		node: true
	}
};
