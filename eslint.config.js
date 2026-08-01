import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: ['dist', 'node_modules', '.wrangler', '.superpowers', 'src/db/migrations'],
  },
  {
    files: ['**/*.{js,ts}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      // TS 已做未定义检查，关闭 ESLint 的 no-undef 以免对全局/类型误报。
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  prettier, // 放最后：关闭与 Prettier 冲突的格式化规则
);
