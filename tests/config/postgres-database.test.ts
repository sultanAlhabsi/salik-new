import { describe, expect, it } from 'vitest';
import { assertSafeTestDatabaseUrl, withPostgresSchema } from '../../src/server/database-url';

describe('PostgreSQL database URL safety', () => {
  it('adds an isolated schema without changing credentials or host', () => {
    const result = new URL(
      withPostgresSchema(
        'postgresql://salik:secret@127.0.0.1:54329/salik_test?connect_timeout=5',
        'salik_case_123'
      )
    );

    expect(result.hostname).toBe('127.0.0.1');
    expect(result.pathname).toBe('/salik_test');
    expect(result.searchParams.get('connect_timeout')).toBe('5');
    expect(result.searchParams.get('schema')).toBe('salik_case_123');
  });

  it('rejects invalid schema identifiers', () => {
    expect(() =>
      withPostgresSchema('postgresql://localhost/salik_test', 'public;drop schema public')
    ).toThrow('Invalid PostgreSQL schema identifier');
  });

  it('allows destructive tests on localhost', () => {
    expect(
      assertSafeTestDatabaseUrl('postgresql://salik:secret@localhost:54329/salik_test').hostname
    ).toBe('localhost');
  });

  it('rejects remote destructive tests by default', () => {
    expect(() =>
      assertSafeTestDatabaseUrl(
        'postgresql://prisma:secret@aws-0-eu.pooler.supabase.com/postgres'
      )
    ).toThrow('Refusing destructive tests against a remote PostgreSQL host');
  });

  it('requires the exact explicit override for a disposable remote test project', () => {
    expect(
      assertSafeTestDatabaseUrl('postgresql://prisma:secret@db.test.invalid/postgres', {
        SALIK_ALLOW_REMOTE_TEST_DATABASE: 'I_UNDERSTAND_THIS_DESTROYS_TEST_DATA'
      } as NodeJS.ProcessEnv).hostname
    ).toBe('db.test.invalid');
  });
});
