// core-web-vitals already bundles the next base config and next/typescript,
// matching the project's original `next/core-web-vitals` + `next/typescript` intent
import coreWebVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [
  ...coreWebVitals,
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
];

export default eslintConfig;
