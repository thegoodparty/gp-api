const { defineConfig, globalIgnores } = require('eslint/config')

const tsParser = require('@typescript-eslint/parser')
const typescriptEslintEslintPlugin = require('@typescript-eslint/eslint-plugin')
const unusedImports = require('eslint-plugin-unused-imports')
const sonarjs = require('eslint-plugin-sonarjs')
const simpleImportSort = require('eslint-plugin-simple-import-sort')
const globals = require('globals')
const js = require('@eslint/js')

const { FlatCompat } = require('@eslint/eslintrc')

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
})

module.exports = defineConfig([
  {
    languageOptions: {
      parser: tsParser,
      sourceType: 'module',

      parserOptions: {
        project: 'tsconfig.json',
        tsconfigRootDir: __dirname,
      },

      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },

    plugins: {
      '@typescript-eslint': typescriptEslintEslintPlugin,
      'unused-imports': unusedImports,
      sonarjs,
      'simple-import-sort': simpleImportSort,
    },

    extends: compat.extends(
      'plugin:@typescript-eslint/recommended',
      'plugin:prettier/recommended',
    ),

    rules: {
      semi: 'off',
      '@typescript-eslint/no-namespace': 'off',
      '@typescript-eslint/interface-name-prefix': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      // Type Safety (error - suppressed with native ESLint suppressions)
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-useless-constructor': 'error',
      '@typescript-eslint/no-empty-function': 'error',

      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          vars: 'all',
          args: 'all',
          ignoreRestSiblings: false,
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],

      'no-restricted-imports': [
        'error',
        {
          name: 'node:test',
          message: 'Use vitest instead of node:test',
        },
      ],

      'no-unreachable': 'error',
      'unused-imports/no-unused-imports': 'error',
      '@typescript-eslint/no-duplicate-type-constituents': 'error',
      '@typescript-eslint/no-duplicate-enum-values': 'error',

      'max-lines-per-function': [
        'warn',
        {
          max: 150,
        },
      ],

      'max-lines': [
        'warn',
        {
          max: 800,
        },
      ],

      'max-params': ['warn', 4],
      'max-depth': ['warn', 3],
      complexity: ['warn', 15],
      'sonarjs/cognitive-complexity': ['warn', 20],
      'sonarjs/no-duplicate-string': 'warn',
      'sonarjs/no-identical-functions': 'warn',

      // SonarJS Bug Detection (error - high confidence bugs)
      'sonarjs/no-all-duplicated-branches': 'error',
      'sonarjs/no-identical-expressions': 'error',
      'sonarjs/no-identical-conditions': 'error',
      'sonarjs/non-existent-operator': 'error',

      // SonarJS Code Smells (warn - should fix but not blocking)
      'sonarjs/no-duplicated-branches': 'warn',
      'sonarjs/no-useless-catch': 'warn',
      'sonarjs/no-collapsible-if': 'warn',
      'sonarjs/no-collection-size-mischeck': 'warn',

      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-unsafe-enum-comparison': 'error',

      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'class',
          format: ['PascalCase'],
        },
        {
          selector: 'interface',
          format: ['PascalCase'],
        },
        {
          selector: 'typeAlias',
          format: ['PascalCase'],
        },
        {
          selector: 'enum',
          format: ['PascalCase'],
        },
        {
          selector: 'enumMember',
          format: ['PascalCase', 'UPPER_CASE', 'camelCase'],
        },
        {
          selector: 'function',
          format: ['camelCase', 'PascalCase'],
        },
        {
          // Destructured variables often mirror external API or DB column names
          selector: 'variable',
          modifiers: ['destructured'],
          format: null,
        },
        {
          selector: 'variable',
          format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
          leadingUnderscore: 'allowSingleOrDouble',
        },
        {
          selector: 'parameter',
          format: ['camelCase'],
          leadingUnderscore: 'allow',
        },
      ],

      '@typescript-eslint/no-unsafe-type-assertion': 'error',

      // Disabled Auto-Fix Rules (Phase 2):
      // The following rules are imported but not enabled due to auto-fix spam.
      // They will be re-enabled in a separate PR after team approval:
      //
      // "simple-import-sort/imports": "error",
      // "simple-import-sort/exports": "error",
      // "@typescript-eslint/consistent-type-definitions": ["error", "type"],
    },
  },
  globalIgnores([
    '**/.eslintrc.js',
    '**/.eslintrc.test.js',
    'eslint.config.js',
  ]),
  {
    files: ['src/**/*.test.ts', 'src/**/*.e2e.ts', 'src/**/test-utils/**/*.ts'],

    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-type-assertion': 'off',
      '@typescript-eslint/no-unsafe-enum-comparison': 'off',
      'max-lines-per-function': 'off',
      complexity: 'off',
    },
  },
  {
    files: ['seed/**/*.ts', 'e2e-tests/**/*.ts'],

    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-type-assertion': 'off',
      '@typescript-eslint/no-unsafe-enum-comparison': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/naming-convention': 'off',
    },
  },
  globalIgnores(['**/generated/', '**/dist/']),
  {
    files: ['scripts/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: 'tsconfig.scripts.json',
      },
    },
  },
])
