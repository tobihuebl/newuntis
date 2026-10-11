// Muss vor dem Laden der App gesetzt sein: die API liest ihre Konfiguration aus der Umgebung.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? '';
process.env.DATABASE_APP_URL = process.env.TEST_DATABASE_APP_URL ?? '';
process.env.SESSION_SECRET = 'test-session-secret-with-at-least-32-chars';
process.env.APP_URL = 'http://localhost:3000';
process.env.API_URL = 'http://localhost:4000';
process.env.SMTP_URL = 'smtp://localhost:1025';
process.env.S3_ENDPOINT = 'http://localhost:9000';
process.env.S3_BUCKET = 'test';
process.env.S3_ACCESS_KEY = 'test';
process.env.S3_SECRET_KEY = 'test';
process.env.BASE_DOMAIN = 'localhost';
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
