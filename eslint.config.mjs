import nextConfig from "eslint-config-next";

export default [
  ...nextConfig,
  {
    ignores: [
      ".next",
      "node_modules",
      "src/server/db/migrations",
      "coverage",
      ".agents",
      ".claude",
      "*.config.mjs",
    ],
  },
  {
    rules: {
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
];
