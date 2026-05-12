// Shared test setup. Anything that auth/quota libs read at import time
// must be in scope before the test file imports them.

process.env.AUTH_SECRET = 'test_secret_at_least_32_chars_long_xxx'
// NODE_ENV is set by vitest itself ('test'); avoid reassigning — TS treats it as read-only
