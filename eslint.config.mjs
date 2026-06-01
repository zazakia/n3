import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
    {
        ignores: [
            'node_modules/**',
            'dist/**',
            'scripts/**',
            'coverage/**',
            '.expo/**',
            'src/assets/**',
        ],
    },
    {
        files: ['**/*.{ts,tsx}'],
        languageOptions: {
            parser: tsparser,
            parserOptions: { project: './tsconfig.json' },
        },
        plugins: { '@typescript-eslint': tseslint },
        rules: {
            'no-console': ['warn', { allow: ['warn', 'error'] }],
            '@typescript-eslint/no-explicit-any': 'warn',
        },
    },
];
