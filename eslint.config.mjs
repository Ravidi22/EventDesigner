import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // `const { secret: _s, ...rest } = row` is how this codebase drops a key; an underscore says so.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    // The two hand-tuned canvas hosts. The camera is a transform, not state: the view lives in a
    // ref, written per frame and read in render on purpose, and every node reaches this render's
    // handlers through `hostRef`/`latest` (CLAUDE.md, "The camera is a transform, not state" and
    // "Every drag is startPointerGesture"). The React Compiler's rules cannot tell that design from
    // a mistake, and one silenced finding only lets the compiler reach the next one, so the compiler
    // family is off for these two files only. exhaustive-deps and everything else still apply.
    files: ["components/plan-canvas.tsx", "app/(app)/studio/studio-screen.tsx"],
    rules: {
      "react-hooks/refs": "off",
      "react-hooks/immutability": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
