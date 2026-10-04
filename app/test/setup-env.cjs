process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgresql://fixture:fixture@127.0.0.1:5432/fixture';
process.env.FEATURE_AUTO_PUBLISHING = 'false';
process.env.FEATURE_META_PUBLISHING = 'false';
