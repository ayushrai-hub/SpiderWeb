export const config = {
  redisHost: process.env.REDIS_HOST || 'localhost',
  redisPort: parseInt(process.env.REDIS_PORT || '6379', 10),
  databaseUrl: process.env.DATABASE_URL || 'postgresql://dev:dev@localhost:5432/intel_dev',
  tempDir: process.env.TEMP_DIR || '/tmp/intel-extraction',
} as const;
