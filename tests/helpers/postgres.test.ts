import { describe, expect, it } from 'vitest';
import { createIsolatedPostgresSchema } from './postgres';

describe('isolated PostgreSQL schemas', () => {
  it('applies committed migrations and removes the schema on disposal', async () => {
    const scope = await createIsolatedPostgresSchema({ prefix: 'helper_test' });
    const schema = scope.schema;

    expect(await scope.prisma.organization.count()).toBe(0);
    await scope.prisma.organization.create({
      data: { name: 'Only here', type: 'PLATFORM' }
    });
    expect(await scope.prisma.organization.count()).toBe(1);

    await scope.dispose();
    await expect(scope.dispose()).resolves.toBeUndefined();
    expect(schema).toMatch(/^salik_helper_test_/);
  });
});
