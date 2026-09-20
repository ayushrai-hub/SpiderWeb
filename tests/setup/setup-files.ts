import { TEST_DATABASE_URL } from './test-database.js';

// Point every module that reads DATABASE_URL at the throwaway test database
// before any test file imports them.
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.INGESTION_MODE = 'inline';
process.env.UPLOAD_DIR = '/tmp/spiderweb-test-uploads';
process.env.TEMP_DIR = '/tmp/spiderweb-test-extract';
delete process.env.REDIS_URL;
