import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

/** Centralized error handling and named constants. */
const standards = {
    "no-console": "error",
    "no-restricted-syntax": [
        "error",
        {
            selector: "NewExpression[callee.name='Error'][arguments.0.type='Literal'], NewExpression[callee.name='Error'][arguments.0.type='TemplateLiteral']",
            message: "Do not instantiate Error with a string literal or template literal. Route it through the central error handling instead.",
        },
        {
            selector: "NewExpression[callee.name='DOMException'][arguments.0.type='Literal'], NewExpression[callee.name='DOMException'][arguments.0.type='TemplateLiteral']",
            message: "Do not instantiate DOMException with a string literal or template literal. Route it through the central error handling instead.",
        },
        // Nothing the browser or the operating system draws.
        {
            selector: "CallExpression[callee.name='el'][arguments.0.value=/^(select|datalist)$/], CallExpression[callee.property.name='createElement'][arguments.0.value=/^(select|datalist)$/]",
            message: "Do not use a native select or datalist, the browser draws its popup. Use the Listbox component.",
        },
        {
            selector: "Property[key.name='type'][value.value=/^(date|datetime-local|time|month|week|color)$/], Property[key.value='type'][value.value=/^(date|datetime-local|time|month|week|color)$/]",
            message: "Do not use a native date, time or color input, the browser draws its popup. Build the picker.",
        },
        // No user visible text in code, it all comes from the language files.
        {
            selector: "CallExpression[callee.name='el'] > Literal:not(:first-child)",
            message: "Text shown to the user must come from the language files: use t(\"key\").",
        },
        {
            selector: "CallExpression[callee.name='el'] > TemplateLiteral",
            message: "Text shown to the user must come from the language files: use t(\"key\", { ... }).",
        },
        {
            selector: "CallExpression[callee.name='el'] > ObjectExpression > Property[key.name=/^(title|alt|placeholder)$/] > :matches(Literal, TemplateLiteral).value, CallExpression[callee.name='el'] > ObjectExpression > Property[key.value=/^(aria-label|aria-description|aria-roledescription)$/] > :matches(Literal, TemplateLiteral).value",
            message: "Labels, titles and alternative texts must come from the language files: use t(\"key\").",
        },
        {
            selector: "AssignmentExpression[left.property.name=/^(textContent|innerText)$/] > :matches(Literal, TemplateLiteral).right, AssignmentExpression[left.object.name='document'][left.property.name='title'] > :matches(Literal, TemplateLiteral).right",
            message: "Text shown to the user must come from the language files: use t(\"key\").",
        },
    ],
    "no-alert": "error",
    "no-restricted-properties": [
        "error",
        { object: "window", property: "open", message: "Do not use window.open. A dialog is an in-page dialog, a link is an anchor with target=_blank." },
        { object: "window", property: "alert", message: "Do not use alert. Use the dialog." },
        { object: "window", property: "confirm", message: "Do not use confirm. Use the dialog." },
        { object: "window", property: "prompt", message: "Do not use prompt. Use the dialog." },
    ],
    "no-magic-numbers": [
        "error",
        {
            // 0, 1 and -1 are positions and steps, 2 is halving and pairs.
            ignore: [-1, 0, 1, 2],
            ignoreArrayIndexes: true,
            ignoreDefaultValues: true,
            ignoreClassFieldInitialValues: true,
            enforceConst: true,
        },
    ],
};

/** Code style: 4 spaces, braces on the next line. */
const style = {
    indent: ["error", 4, { SwitchCase: 1, CallExpression: { arguments: "off" }, ignoredNodes: ["TemplateLiteral *"] }],
    "brace-style": ["error", "allman", { allowSingleLine: false }],
    curly: ["error", "all"],
    eqeqeq: ["error", "always"],
};

export default tseslint.config(
    {
        ignores: ["dist/**", "coverage/**", "test-results/**", "playwright-report/**", "node_modules/**", "public/**"],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        linterOptions: { reportUnusedDisableDirectives: "error" },
        rules: {
            ...style,
            "@typescript-eslint/consistent-type-imports": "error",
            "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
        },
    },
    {
        // Type information for the rules that need it (switch exhaustiveness).
        files: ["**/*.ts"],
        languageOptions: {
            parserOptions: { project: "./tsconfig.test.json", tsconfigRootDir: import.meta.dirname },
        },
        rules: {
            // A switch over a closed set must handle every member.
            "@typescript-eslint/switch-exhaustiveness-check": "error",
        },
    },
    {
        // Application source runs in the browser and must follow every standard.
        files: ["src/**/*.ts"],
        languageOptions: { globals: globals.browser },
        rules: standards,
    },
    {
        // Build scripts, tests and config run in Node. Console output and literals are fine there.
        files: ["**/*.mjs", "tests/**/*.ts", "*.ts"],
        languageOptions: { globals: { ...globals.node, ...globals.browser } },
    },
);
