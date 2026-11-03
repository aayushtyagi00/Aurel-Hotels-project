import {defineConfig,globalIgnores} from 'eslint/config';
import parser from '@typescript-eslint/parser';
import ts from '@typescript-eslint/eslint-plugin';
import hooks from 'eslint-plugin-react-hooks';
export default defineConfig([
 globalIgnores(['node_modules/**','dist/**','dist-worker/**','dist-firebase/**','.firebase/**','.next/**','.wrangler/**','.sites-runtime/**','outputs/**','work/**']),
 {files:['**/*.{ts,tsx,mts,mjs}'],languageOptions:{parser,parserOptions:{ecmaVersion:'latest',sourceType:'module',ecmaFeatures:{jsx:true}}},plugins:{'@typescript-eslint':ts,'react-hooks':hooks},rules:{'@typescript-eslint/no-explicit-any':'error','@typescript-eslint/no-unused-vars':['warn',{argsIgnorePattern:'^_',varsIgnorePattern:'^_'}],'react-hooks/rules-of-hooks':'error','react-hooks/exhaustive-deps':'warn'}},
]);
