import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'
import swc from 'rollup-plugin-swc'
import dotenv from 'dotenv'
import { readFileSync } from 'fs'

export default defineConfig({
  // We have to disable esbuild and use swc because esbuild doesn't support
  // the required decorator metadata features that NestJS uses.
  esbuild: false,
  plugins: [
    swc({
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { decoratorMetadata: true },
      },
    }),
    // We use tsconfigpaths, and therefore we need this.
    tsconfigPaths(),
  ],
  test: {
    include: ['src/**/*.test.ts'],
    env: dotenv.parse(readFileSync(`${__dirname}/.env.test`)),
  },
})
