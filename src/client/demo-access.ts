export const preparedDemoPassword = 'Password123!';

export const preparedDemoAccounts = [
  {
    portal: 'admin',
    label: 'Admin demo',
    email: 'demo-admin@salik.om',
    password: preparedDemoPassword,
    detail: 'Platform operations'
  },
  {
    portal: 'supplier',
    label: 'Supplier demo',
    email: 'supplier@fresh.om',
    password: preparedDemoPassword,
    detail: 'Catalog and fulfillment'
  },
  {
    portal: 'store',
    label: 'Store demo',
    email: 'store@alnoor.om',
    password: preparedDemoPassword,
    detail: 'Procurement and invoices'
  },
  {
    portal: 'driver',
    label: 'Driver demo',
    email: 'driver@fresh.om',
    password: preparedDemoPassword,
    detail: 'Routes and delivery proof'
  }
] as const;
