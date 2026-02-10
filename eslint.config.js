import js from "@eslint/js";
import typescript from "typescript-eslint";
import globals from "globals";

export default typescript.config(
  js.configs.recommended,
  ...typescript.configs.strictTypeChecked,
  ...typescript.configs.stylisticTypeChecked,

  // Base config for all TypeScript files
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: globals.node,
    },
    rules: {
      // Strict type imports
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "@typescript-eslint/consistent-type-definitions": ["error", "type"],

      // Unused variables - allow underscore prefix
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],

      // Require explicit return types on functions
      "@typescript-eslint/explicit-function-return-type": [
        "error",
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
          allowHigherOrderFunctions: true,
        },
      ],

      // No floating promises
      "@typescript-eslint/no-floating-promises": "error",

      // No misused promises
      "@typescript-eslint/no-misused-promises": "error",

      // Require await for async functions
      "@typescript-eslint/require-await": "error",

      // Strict boolean expressions
      "@typescript-eslint/strict-boolean-expressions": [
        "error",
        {
          allowString: false,
          allowNumber: false,
          allowNullableObject: true,
          allowNullableBoolean: false,
          allowNullableString: false,
          allowNullableNumber: false,
          allowAny: false,
        },
      ],

      // No unnecessary conditions
      "@typescript-eslint/no-unnecessary-condition": "error",

      // Prefer nullish coalescing
      "@typescript-eslint/prefer-nullish-coalescing": "error",

      // No console (except warn/error/info)
      "no-console": ["error", { allow: ["warn", "error", "info"] }],

      // No non-null assertions
      "@typescript-eslint/no-non-null-assertion": "error",

      // No explicit any
      "@typescript-eslint/no-explicit-any": "error",

      // No unsafe operations with any
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-return": "error",

      // Prefer optional chain
      "@typescript-eslint/prefer-optional-chain": "error",

      // No unnecessary type assertions
      "@typescript-eslint/no-unnecessary-type-assertion": "error",

      // Consistent type exports
      "@typescript-eslint/consistent-type-exports": "error",

      // No import type side effects
      "@typescript-eslint/no-import-type-side-effects": "error",

      // Switch exhaustiveness
      "@typescript-eslint/switch-exhaustiveness-check": "error",

      // Array type style
      "@typescript-eslint/array-type": ["error", { default: "array" }],

      // No confusing void expression
      "@typescript-eslint/no-confusing-void-expression": ["error", { ignoreArrowShorthand: true }],
    },
  },

  // SQLite repositories - allow Tinqer type hint pattern
  {
    files: ["**/repositories/sqlite/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
    },
  },

  // Tests - relaxed rules for test mocks and fixtures
  {
    files: ["**/tests/**/*.ts", "**/*.test.ts", "**/*.spec.ts"],
    languageOptions: {
      globals: { ...globals.node, ...globals.mocha },
    },
    rules: {
      // Mock functions often return promises without await
      "@typescript-eslint/require-await": "off",
      // Mock return types often have non-null values that appear unnecessary
      "@typescript-eslint/no-unnecessary-condition": "off",
    },
  },

  // JS/MJS config files (no type checking)
  {
    files: ["**/*.js", "**/*.mjs"],
    ...typescript.configs.disableTypeChecked,
    languageOptions: {
      globals: globals.node,
    },
  },

  // Ignores
  {
    ignores: [
      "node_modules/**",
      "**/node_modules/**",
      "**/dist/**",
      "**/generated/**",
      "scripts/**",
    ],
  }
);
