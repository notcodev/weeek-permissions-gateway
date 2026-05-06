import nextPlugin from "eslint-config-next";

export default [
  ...nextPlugin(),
  {
    ignores: [".next", "node_modules", "src/server/db/migrations", "coverage"],
  },
  {
    rules: {
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
];
