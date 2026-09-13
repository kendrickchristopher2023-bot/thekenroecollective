import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", ".output", ".vinxi"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      // A wrong event time is the worst defect an events product can ship, so
      // date/time formatting lives in exactly ONE module: src/lib/datetime.ts.
      // Everything else calls it. This guard fails the build if a new feature
      // reintroduces ad-hoc formatting.
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "MemberExpression[property.name='toLocaleDateString'], MemberExpression[property.name='toLocaleTimeString']",
          message:
            "Do not format dates directly. Import a formatter from @/lib/datetime (formatEventDate/formatStampDate/formatTimestamp).",
        },
        {
          selector:
            "MemberExpression[object.name='Intl'][property.name='DateTimeFormat']",
          message:
            "Intl.DateTimeFormat belongs only in src/lib/datetime.ts. Import a formatter from @/lib/datetime.",
        },
        {
          selector:
            "CallExpression[callee.property.name='toLocaleString'][callee.object.type='NewExpression'][callee.object.callee.name='Date']",
          message:
            "Do not format dates directly. Import a formatter from @/lib/datetime.",
        },
      ],
    },
  },
  {
    // The approved date/time modules, plus vendored UI that ships its own
    // locale formatting.
    files: [
      "src/lib/datetime.ts",
      "src/lib/date-only.ts",
      "src/lib/event-time.ts",
      "src/lib/ics.ts",
      "src/lib/ecards-time.ts",
      "src/lib/ecards-reveal-time.ts",
      "src/lib/reminder-window.ts",
      "src/lib/reminder-schedule.ts",
      "src/lib/rolling-event-cap.ts",
      "src/components/ui/calendar.tsx",
      "src/components/ui/chart.tsx",
    ],
    rules: {
      "no-restricted-syntax": "off",
    },
  },
  eslintPluginPrettier,
);

