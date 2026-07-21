import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../../src/server/config';

const validProduction = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://prisma:strong@pooler.example.com:5432/postgres',
  RENDER_EXTERNAL_URL: 'https://salik.onrender.com',
  SESSION_SECRET: 's'.repeat(48),
  PAYMENT_WEBHOOK_SECRET: 'p'.repeat(32),
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'publishable-test-value',
  SUPABASE_SECRET_KEY: 'supabase-secret-test-value',
  SUPABASE_STORAGE_BUCKET: 'salik-private',
  SALIK_SUPABASE_DISABLED: 'false'
} as NodeJS.ProcessEnv;

describe('production configuration', () => {
  it('uses the Render external URL when APP_ORIGIN is absent', () => {
    expect(resolveConfig(validProduction).appOrigin).toBe('https://salik.onrender.com');
  });

  it.each([
    ['SQLite database', { DATABASE_URL: 'file:./prod.db' }, 'DATABASE_URL'],
    ['weak session secret', { SESSION_SECRET: 'short' }, 'SESSION_SECRET'],
    ['HTTP origin', { RENDER_EXTERNAL_URL: 'http://salik.onrender.com' }, 'APP_ORIGIN'],
    ['disabled Supabase', { SALIK_SUPABASE_DISABLED: 'true' }, 'SALIK_SUPABASE_DISABLED'],
    ['missing Supabase secret', { SUPABASE_SECRET_KEY: undefined }, 'SUPABASE_SECRET_KEY']
  ])('rejects %s without leaking values', (_name, override, invalidName) => {
    try {
      resolveConfig({ ...validProduction, ...override });
      throw new Error('Expected production configuration to be rejected');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain('Invalid production configuration');
      expect((error as Error).message).toContain(invalidName);
      for (const value of Object.values(override).filter(Boolean)) {
        expect((error as Error).message).not.toContain(String(value));
      }
    }
  });
});
