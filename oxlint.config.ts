import { defineConfig } from "oxlint";

export default defineConfig({
  plugins: ["typescript", "unicorn", "import", "node", "promise", "jsdoc"],
  env: {
    node: true,
    es2024: true,
  },
  categories: {
    correctness: "error",
    suspicious: "warn",
    pedantic: "warn",
    perf: "warn",
    style: "off",
    restriction: "off",
    nursery: "off",
  },
  rules: {
    "no-console": "off",
    "no-debugger": "error",
    eqeqeq: "error",
    curly: "error",
    "no-var": "error",
    "prefer-const": "error",
    "typescript/no-explicit-any": "warn",
    "typescript/no-non-null-assertion": "warn",
    "unicorn/prefer-node-protocol": "error",
    "unicorn/no-process-exit": "off",
    "import/no-self-import": "error",
    "import/no-cycle": "error",
    "max-lines-per-function": "off",
  },
  ignorePatterns: ["dist/**", "node_modules/**", "*.d.ts", "coverage/**"],
});
