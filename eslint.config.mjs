import { defineConfig } from 'eslint/config';
import obsidianmd from 'eslint-plugin-obsidianmd';

export default defineConfig([
  { ignores: ['main.js', 'node_modules/**', '.npm-cache/**', 'qa/**', 'tests/**', 'scripts/**', 'docs/**', 'examples/**', 'eslint.config.mjs'] },
  ...obsidianmd.configs.recommended,
  {
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {
      'obsidianmd/ui/sentence-case': ['error', { brands: ['Just Simple Planner', 'Obsidian', 'Markdown'] }],
    },
  },
]);
