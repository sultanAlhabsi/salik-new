import { describe, expect, it } from 'vitest';
import { assertDemoSeedAllowed } from '../../src/server/services/seed';

describe('demo seed safety', () => {
  it('allows test mode on localhost', () => {
    expect(() =>
      assertDemoSeedAllowed(
        { NODE_ENV: 'test' } as NodeJS.ProcessEnv,
        'postgresql://localhost/salik_test'
      )
    ).not.toThrow();
  });

  it('rejects production even when the host is local', () => {
    expect(() =>
      assertDemoSeedAllowed(
        { NODE_ENV: 'production' } as NodeJS.ProcessEnv,
        'postgresql://localhost/salik'
      )
    ).toThrow('Demo seed is disabled in production');
  });

  it('rejects a remote database', () => {
    expect(() =>
      assertDemoSeedAllowed(
        { NODE_ENV: 'development' } as NodeJS.ProcessEnv,
        'postgresql://pooler.supabase.com/postgres'
      )
    ).toThrow('Demo seed requires a local PostgreSQL host');
  });
});
