import { defineConfig } from 'eslint/config';
import pluginVue from 'eslint-plugin-vue';
import eslintConfigPrettier from "eslint-config-prettier/flat";

export default defineConfig([
    ...pluginVue.configs['flat/recommended'],
    eslintConfigPrettier,
]);
