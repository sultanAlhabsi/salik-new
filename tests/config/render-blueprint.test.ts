import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

type BlueprintEnvironmentVariable = {
  key: string;
  value?: string;
  sync?: boolean;
  generateValue?: boolean;
};

type BlueprintService = {
  type: string;
  name: string;
  runtime: string;
  plan: string;
  region: string;
  branch: string;
  autoDeployTrigger: string;
  healthCheckPath: string;
  buildCommand: string;
  startCommand: string;
  envVars: BlueprintEnvironmentVariable[];
};

function loadBlueprint() {
  return parse(readFileSync('render.yaml', 'utf8')) as { services: BlueprintService[] };
}

describe('Render Blueprint', () => {
  it('installs build-time dependencies when NODE_ENV is production', () => {
    expect(readFileSync('.npmrc', 'utf8')).toContain('include=dev');
  });

  it('defines one free Frankfurt Node service with health checks', () => {
    const blueprint = loadBlueprint();
    expect(blueprint.services).toHaveLength(1);
    expect(blueprint.services[0]).toMatchObject({
      type: 'web',
      name: 'salik-private-pilot',
      runtime: 'node',
      plan: 'free',
      region: 'frankfurt',
      branch: 'main',
      autoDeployTrigger: 'commit',
      healthCheckPath: '/api/health',
      buildCommand: 'npm ci --include=dev && npm run build',
      startCommand: 'npm run db:migrate:deploy && npm start'
    });
  });

  it('never commits secret values', () => {
    const blueprint = loadBlueprint();
    const variables = Object.fromEntries(
      blueprint.services[0].envVars.map((entry) => [entry.key, entry])
    );
    for (const key of [
      'DATABASE_URL',
      'SUPABASE_URL',
      'SUPABASE_PUBLISHABLE_KEY',
      'SUPABASE_SECRET_KEY'
    ]) {
      expect(variables[key]).toEqual({ key, sync: false });
    }
    expect(variables.SESSION_SECRET).toEqual({ key: 'SESSION_SECRET', generateValue: true });
    expect(variables.PAYMENT_WEBHOOK_SECRET).toEqual({
      key: 'PAYMENT_WEBHOOK_SECRET',
      generateValue: true
    });
  });
});
