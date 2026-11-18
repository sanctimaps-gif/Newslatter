import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    env: { ENV_FILE: resolve(__dirname, '../.env.test'), SANDBOX_SMTP_PORT: '2525', MAIL_SANDBOX: 'true' },
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
    include: ['tests/**/*.test.ts'],
  },
});
