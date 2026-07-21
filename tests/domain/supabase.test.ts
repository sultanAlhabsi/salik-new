import { describe, expect, it } from 'vitest';
import { buildStoragePath, resolveSupabaseMode } from '../../src/server/services/supabase';

describe('Supabase integration configuration', () => {
  it('uses Supabase only when every server credential is present', () => {
    expect(
      resolveSupabaseMode({
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
        SUPABASE_SECRET_KEY: 'sb_secret_test'
      })
    ).toBe('supabase');

    expect(resolveSupabaseMode({ SUPABASE_URL: 'https://example.supabase.co' })).toBe('local');
    expect(
      resolveSupabaseMode({
        SALIK_SUPABASE_DISABLED: 'true',
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
        SUPABASE_SECRET_KEY: 'sb_secret_test'
      })
    ).toBe('local');
  });

  it('builds private, non-guessable storage paths without unsafe filename characters', () => {
    const path = buildStoragePath('org-1', 'auth-user-1', '../../invoice\r\n.pdf', 'fixed-token');

    expect(path).toBe('org-1/auth-user-1/fixed-token-invoice__.pdf');
    expect(path).not.toContain('..');
  });
});
