import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        root: '.',
        include: ['tests/**/*.test.ts'],
        environment: 'node',
        setupFiles: ['./tests/setup.ts'],
        testTimeout: 10_000,
        mockReset: true,
    },
});
