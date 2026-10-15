// ESLint 9 flat config using the Next.js recommended rules. `next lint` is deprecated in Next 15.5, so the lint script runs `eslint .` directly.
// NOT YET EXECUTED (no dependencies could be installed where this was prepared): run `npm install && npm run lint` on a connected machine.
import { FlatCompat } from "@eslint/eslintrc";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

export default [
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts", "*.tsbuildinfo", "playwright-report/**", "test-results/**"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];
