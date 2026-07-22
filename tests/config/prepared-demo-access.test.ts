import { describe, expect, it } from 'vitest';
import {
  preparedDemoAccounts,
  preparedDemoPassword
} from '../../src/client/demo-access';

describe('prepared demo access', () => {
  it('exposes only the three tenant portals with explicit shared credentials', () => {
    expect(preparedDemoPassword).toBe('Password123!');
    expect(preparedDemoAccounts).toEqual([
      {
        portal: 'supplier',
        label: 'Supplier demo',
        email: 'supplier@fresh.om',
        password: 'Password123!',
        detail: 'Catalog and fulfillment'
      },
      {
        portal: 'store',
        label: 'Store demo',
        email: 'store@alnoor.om',
        password: 'Password123!',
        detail: 'Procurement and invoices'
      },
      {
        portal: 'driver',
        label: 'Driver demo',
        email: 'driver@fresh.om',
        password: 'Password123!',
        detail: 'Routes and delivery proof'
      }
    ]);
    expect(preparedDemoAccounts.map(({ email }) => String(email))).not.toContain('admin@salik.om');
  });
});
