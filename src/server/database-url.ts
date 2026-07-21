const localPostgresHosts = new Set(['localhost', '127.0.0.1', '::1']);
const remoteTestConfirmation = 'I_UNDERSTAND_THIS_DESTROYS_TEST_DATA';

function parsePostgresUrl(databaseUrl: string) {
  const parsed = new URL(databaseUrl);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('DATABASE_URL must use PostgreSQL');
  }
  return parsed;
}

export function withPostgresSchema(databaseUrl: string, schema: string) {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema)) {
    throw new Error('Invalid PostgreSQL schema identifier');
  }
  const parsed = parsePostgresUrl(databaseUrl);
  parsed.searchParams.set('schema', schema);
  return parsed.toString();
}

export function assertSafeTestDatabaseUrl(
  databaseUrl: string,
  environment: NodeJS.ProcessEnv = process.env
) {
  const parsed = parsePostgresUrl(databaseUrl);
  if (
    !localPostgresHosts.has(parsed.hostname) &&
    environment.SALIK_ALLOW_REMOTE_TEST_DATABASE !== remoteTestConfirmation
  ) {
    throw new Error('Refusing destructive tests against a remote PostgreSQL host');
  }
  return parsed;
}
