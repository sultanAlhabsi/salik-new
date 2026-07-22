import { describe, expect, it } from 'vitest';
import { assertHostedDemoBootstrapAllowed } from '../../src/server/services/hosted-demo';

describe('hosted demo bootstrap safety', () => {
  const confirmedProduction = {
    NODE_ENV: 'production',
    HOSTED_DEMO_CONFIRM: 'SALIK_HOSTED_DEMO'
  } as NodeJS.ProcessEnv;

  it('requires the exact explicit confirmation', () => {
    expect(() =>
      assertHostedDemoBootstrapAllowed({ NODE_ENV: 'production' }, true)
    ).toThrow('Hosted demo bootstrap requires HOSTED_DEMO_CONFIRM=SALIK_HOSTED_DEMO');
    expect(() =>
      assertHostedDemoBootstrapAllowed(
        { NODE_ENV: 'production', HOSTED_DEMO_CONFIRM: 'yes' },
        true
      )
    ).toThrow('Hosted demo bootstrap requires HOSTED_DEMO_CONFIRM=SALIK_HOSTED_DEMO');
  });

  it('only runs in production', () => {
    expect(() =>
      assertHostedDemoBootstrapAllowed(
        { NODE_ENV: 'development', HOSTED_DEMO_CONFIRM: 'SALIK_HOSTED_DEMO' },
        true
      )
    ).toThrow('Hosted demo bootstrap requires NODE_ENV=production');
  });

  it('requires hosted Supabase Auth', () => {
    expect(() => assertHostedDemoBootstrapAllowed(confirmedProduction, false)).toThrow(
      'Hosted demo bootstrap requires Supabase Auth'
    );
  });

  it('accepts confirmed production with Supabase Auth', () => {
    expect(() => assertHostedDemoBootstrapAllowed(confirmedProduction, true)).not.toThrow();
  });
});
