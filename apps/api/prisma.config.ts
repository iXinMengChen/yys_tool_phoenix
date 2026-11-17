import { databaseUrlSchema, loadApiEnv } from '@phoenix/config/env'
import { defineConfig } from 'prisma/config'

try {
  process.loadEnvFile(process.env.PHOENIX_ENV_FILE || '../../.env')
} catch (error) {
  if (
    !(error instanceof Error) ||
    !('code' in error) ||
    error.code !== 'ENOENT'
  ) {
    throw error
  }
}

const databaseUrl = loadApiEnv().databaseUrl

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    url: databaseUrl ? databaseUrlSchema.parse(databaseUrl) : '',
  },
})
