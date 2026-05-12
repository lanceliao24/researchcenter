// Shared test setup. Anything that auth/quota libs read at import time
// must be in scope before the test file imports them.

process.env.AUTH_SECRET = 'test_secret_at_least_32_chars_long_xxx'
process.env.NODE_ENV = 'test'
