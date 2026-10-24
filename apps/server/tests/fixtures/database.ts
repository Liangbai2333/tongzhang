/** Refuse implicit/development databases without ever echoing a credential-bearing URL. */
export function testDatabaseUrl(value = process.env.TEST_DATABASE_URL): string {
  try {
    const url = new URL(value ?? '');
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !/^\/[\w-]+_test$/.test(decodeURIComponent(url.pathname))
    )
      throw new Error();
    return value!;
  } catch {
    throw new Error('Set TEST_DATABASE_URL to a dedicated PostgreSQL database ending in _test.');
  }
}
