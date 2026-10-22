import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  {
    rules: {
      // `any` needs an explanation comment (spec 01 §1.6); the disable comment is that explanation.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      // A pages-router rule: with the page builder's root /[slug] route it reads every
      // literal internal link as a page link. Site links are plain <a> by choice (server
      // components, full navigations between public pages).
      "@next/next/no-html-link-for-pages": "off",
    },
  },
  globalIgnores([
    ".next/**",
    ".next-e2e/**",
    ".next-buildcheck/**",
    "out/**",
    "build/**",
    ".open-next/**",
    ".wrangler/**",
    ".data/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "db/migrations/**",
    "lintel-spec/**",
    "next-env.d.ts",
    "cloudflare-env.d.ts",
  ]),
]);

export default eslintConfig;
