import tseslint from "typescript-eslint";

export default [
  { ignores: ["node_modules/"] },
  {
    files: ["**/*.{js,ts}"],
    languageOptions: { parser: tseslint.parser },
    rules: { curly: ["error", "all"] },
  },
];
