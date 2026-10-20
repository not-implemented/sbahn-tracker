import { defineConfig } from 'eslint/config';
import pluginVue from 'eslint-plugin-vue';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from "eslint-config-prettier/flat";

export default defineConfig([
    ...pluginVue.configs['flat/recommended'],
    {
        files: ['**/*.vue'],
        languageOptions: {
            parserOptions: {
                parser: tseslint.parser,
            },
        },
    },
    {
        files: ['**/*.ts'],
        languageOptions: {
            parser: tseslint.parser,
        },
    },
    eslintConfigPrettier,
]);
