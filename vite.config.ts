import adapter from '@sveltejs/adapter-auto';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { yarnSpinnerVitePlugin } from 'yarnspinner-vite-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		tailwindcss(),
		// Compiles .yarn imports (the assistant dialogue) to build-time programs.
		yarnSpinnerVitePlugin(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
			// If your environment is not supported, or you settled on a specific environment, switch out the adapter.
			// See https://svelte.dev/docs/kit/adapters for more information about adapters.
			adapter: adapter()
		})
	],
	// Unit tests run through the same plugin chain (SvelteKit supports Vitest
	// under its plugin): .svelte.ts modules compile with runes, .yarn imports
	// compile to programs — the assistant tests exercise both.
	test: {
		environment: 'node'
	}
});
