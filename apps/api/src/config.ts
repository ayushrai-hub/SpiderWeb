export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  host: process.env.HOST || '0.0.0.0',
  isDev: process.env.NODE_ENV !== 'production',
  logLevel: process.env.LOG_LEVEL || 'info',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://dev:dev@localhost:5432/intel_dev',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  s3Bucket: process.env.S3_BUCKET || 'intel-dev',
  s3Endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
} as const;
