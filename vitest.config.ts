import { defineConfig } from "vitest/config";

/**
 * Unit, data and build tests. DOM tests opt into jsdom with a
 * `@vitest-environment jsdom` docblock, everything else runs in plain Node.
 * End-to-end tests live in tests/e2e and run under Playwright instead.
 */
export default defineConfig({
    test: {
        include: ["tests/unit/**/*.test.ts", "tests/data/**/*.test.ts", "tests/build/**/*.test.ts", "tests/lint/**/*.test.ts"],
        environment: "node",
        testTimeout: 30000,
        coverage: {
            provider: "v8",
            include: ["src/**/*.ts"],
            reporter: ["text", "html"],
            reportsDirectory: "coverage",
            // Build-breaking floor.
            thresholds: {
                statements: 97,
                branches: 94,
                functions: 98,
                lines: 97,
            },
        },
    },
});
