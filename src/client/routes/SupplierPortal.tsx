import { useState } from 'react';
import { Download } from 'lucide-react';
import { api } from '../api';
import { icons, PortalShell } from '../components/PortalShell';
import { AsyncPanel, Button, DataTable, Field, Metric, StatusBadge, Toast } from '../components/ui';
import { useApiResource } from '../hooks';
import type { CurrentUser } from '../types';
import { formatDate, Page, Panel } from './AdminPortal';
import { NotificationsView, OrganizationView } from './SharedViews';

type Dashboard = { stats: { orders: number; products: number; lowStock: number; activeDeliveries: number; openInvoices: number }; recentOrders: Order[] };
type Product = { id: string; sku: string; name: string; status: string; priceFormatted: string; available: number; unit: string };
type Stock = { id: string; onHand: number; reserved: number; available: number; isLow: boolean; product: { name: string; sku: string }; warehouse: { name: string } };
type Order = { id: string; status: string; paymentStatus: string; totalFormatted: string; createdAt: string; store: { name: string }; delivery?: { id: string; status: string; driver?: { name: string } } };
type Driver = { id: string; name: string; email: string; status: string };

const tabs = [
  { id: 'overview', label: 'Overview', icon: icons.dashboard },
  { id: 'catalog', label: 'Catalog', icon: icons.catalog },
  { id: 'inventory', label: 'Inventory', icon: icons.inventory },
  { id: 'operations', label: 'Operations', icon: icons.boxes },
  { id: 'orders', label: 'Orders', icon: icons.orders },
  { id: 'reports', label: 'Reports', icon: icons.reports },
  { id: 'organization', label: 'Organization', icon: icons.users },
  { id: 'notifications', label: 'Notifications', icon: icons.notifications }
];

export function SupplierPortal({ user, onLogout }: { user: CurrentUser; onLogout: () => void }) {
  const [tab, setTab] = useState('overview');
  return <PortalShell user={user} tabs={tabs} activeTab={tab} onTabChange={setTab} onLogout={onLogout}><section className="content-area">{tab === 'overview' && <Overview />}{tab === 'catalog' && <Catalog />}{tab === 'inventory' && <Inventory />}{tab === 'operations' && <Operations />}{tab === 'orders' && <Orders />}{tab === 'reports' && <Reports />}{tab === 'organization' && <OrganizationView user={user} />}{tab === 'notifications' && <NotificationsView />}</section></PortalShell>;
}

function Overview() {
  const { state } = useApiResource<Dashboard>('/supplier/dashboard');
  return <Page title="Supply overview" subtitle="Orders, stock, and fulfillment at a glance"><AsyncPanel state={state}>{(data) => <><div className="metrics-grid"><Metric label="Orders" value={data.stats.orders} tone="blue" /><Metric label="Published products" value={data.stats.products} tone="green" /><Metric label="Low stock" value={data.stats.lowStock} tone="amber" /><Metric label="Active deliveries" value={data.stats.activeDeliveries} /><Metric label="Open invoices" value={data.stats.openInvoices} /></div><OrderTable orders={data.recentOrders} compact /></>}</AsyncPanel></Page>;
}

function Catalog() {
  const { state, reload } = useApiResource<{ products: Product[] }>('/supplier/products');
  const [message, setMessage] = useState('');
  async function toggle(product: Product) { try { await api(`/supplier/products/${product.id}`, { method: 'PATCH', body: JSON.stringify({ status: product.status === 'PUBLISHED' ? 'HIDDEN' : 'PUBLISHED' }) }); setMessage('Product visibility updated'); await reload(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not update product'); } }
  return <Page title="Catalog" subtitle="Products visible to stores across the network"><Toast message={message} /><Panel title="Product list"><AsyncPanel state={state} empty={(d) => d.products.length === 0}>{(data) => <DataTable columns={['Product', 'SKU', 'Unit price', 'Available', 'Status', 'Action']} rows={data.products.map((p) => ({ id: p.id, cells: <><td><strong>{p.name}</strong><small>{p.unit}</small></td><td>{p.sku}</td><td>{p.priceFormatted}</td><td>{p.available}</td><td><StatusBadge value={p.status} /></td><td><Button size="sm" variant="secondary" onClick={() => void toggle(p)}>{p.status === 'PUBLISHED' ? 'Hide' : 'Publish'}</Button></td></> }))} getKey={(row) => row.id} />}</AsyncPanel></Panel></Page>;
}

function Inventory() {
  const { state } = useApiResource<{ stocks: Stock[] }>('/supplier/inventory');
  return <Page title="Inventory" subtitle="On-hand, reserved, and available quantities by warehouse"><Panel title="Stock positions"><AsyncPanel state={state} empty={(d) => d.stocks.length === 0}>{(data) => <DataTable columns={['Product', 'Warehouse', 'On hand', 'Reserved', 'Available', 'Health']} rows={data.stocks.map((s) => ({ id: s.id, cells: <><td><strong>{s.product.name}</strong><small>{s.product.sku}</small></td><td>{s.warehouse.name}</td><td>{s.onHand}</td><td>{s.reserved}</td><td>{s.available}</td><td><StatusBadge value={s.isLow ? 'LOW_STOCK' : 'HEALTHY'} /></td></> }))} getKey={(row) => row.id} />}</AsyncPanel></Panel></Page>;
}

function Operations() {
  const warehouses = useApiResource<{ warehouses: Array<{ id: string; name: string; status: string; address?: { label: string }; _count: { stocks: number } }> }>('/supplier/warehouses');
  const categories = useApiResource<{ categories: Array<{ id: string; name: string; status: string; _count: { products: number } }> }>('/supplier/categories');
  const addresses = useApiResource<{ addresses: Array<{ id: string; label: string; type: string }> }>('/organization/addresses');
  const [warehouseName, setWarehouseName] = useState('');
  const [addressId, setAddressId] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [message, setMessage] = useState('');
  async function addWarehouse() { try { await api('/supplier/warehouses', { method: 'POST', body: JSON.stringify({ name: warehouseName, addressId: addressId || undefined }) }); setMessage('Warehouse created'); setWarehouseName(''); await warehouses.reload(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not create warehouse'); } }
  async function addCategory() { try { await api('/supplier/categories', { method: 'POST', body: JSON.stringify({ name: categoryName }) }); setMessage('Category created'); setCategoryName(''); await categories.reload(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not create category'); } }
  return <Page title="Supply operations" subtitle="Warehouses and catalog categories within plan capacity"><Toast message={message} /><div className="two-column"><Panel title="Warehouses"><AsyncPanel state={warehouses.state} empty={(data) => data.warehouses.length === 0}>{(data) => <DataTable columns={['Warehouse', 'Address', 'Stock records', 'Status']} rows={data.warehouses.map((warehouse) => ({ id: warehouse.id, cells: <><td><strong>{warehouse.name}</strong></td><td>{warehouse.address?.label ?? 'Not linked'}</td><td>{warehouse._count.stocks}</td><td><StatusBadge value={warehouse.status} /></td></> }))} getKey={(row) => row.id} />}</AsyncPanel><div className="inline-form"><Field label="Warehouse name" value={warehouseName} onChange={(event) => setWarehouseName(event.target.value)} /><label className="field"><span>Address</span><select name="address" value={addressId} onChange={(event) => setAddressId(event.target.value)}><option value="">No linked address</option>{addresses.state.status === 'success' && addresses.state.data.addresses.map((address) => <option key={address.id} value={address.id}>{address.label}</option>)}</select></label><Button disabled={!warehouseName} onClick={() => void addWarehouse()}>Add warehouse</Button></div></Panel><Panel title="Categories"><AsyncPanel state={categories.state} empty={(data) => data.categories.length === 0}>{(data) => <DataTable columns={['Category', 'Products', 'Status']} rows={data.categories.map((category) => ({ id: category.id, cells: <><td><strong>{category.name}</strong></td><td>{category._count.products}</td><td><StatusBadge value={category.status} /></td></> }))} getKey={(row) => row.id} />}</AsyncPanel><div className="inline-form"><Field label="Category name" value={categoryName} onChange={(event) => setCategoryName(event.target.value)} /><Button disabled={!categoryName} onClick={() => void addCategory()}>Add category</Button></div></Panel></div></Page>;
}

function Orders() {
  const { state, reload } = useApiResource<{ orders: Order[] }>('/supplier/orders');
  const drivers = useApiResource<{ drivers: Driver[] }>('/supplier/drivers');
  const [message, setMessage] = useState('');
  async function transition(order: Order, status: string) {
    try { await api(`/supplier/orders/${order.id}/transition`, { method: 'POST', body: JSON.stringify({ status }) }); setMessage('Order updated'); await reload(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Update failed'); }
  }
  async function assign(order: Order) {
    if (drivers.state.status !== 'success' || !drivers.state.data.drivers[0]) return;
    try { await api(`/supplier/orders/${order.id}/assign-driver`, { method: 'POST', body: JSON.stringify({ driverId: drivers.state.data.drivers[0].id }) }); setMessage('Driver assigned'); await reload(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Assignment failed'); }
  }
  async function reschedule(order: Order) { if (!order.delivery) return; try { await api(`/supplier/deliveries/${order.delivery.id}/reschedule`, { method: 'POST', body: JSON.stringify({ scheduledFor: new Date(Date.now() + 86_400_000).toISOString() }) }); setMessage('Delivery rescheduled'); await reload(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Reschedule failed'); } }
  return <Page title="Orders" subtitle="Move accepted orders through preparation and dispatch"><Toast message={message} /><AsyncPanel state={state} empty={(d) => d.orders.length === 0}>{(data) => <Panel title="Order queue"><div className="order-list">{data.orders.map((order) => <article className="order-row" key={order.id}><div><small>{order.id.slice(-8).toUpperCase()}</small><strong>{order.store.name}</strong><span>{order.totalFormatted} · {formatDate(order.createdAt)}</span></div><StatusBadge value={order.delivery?.status ?? order.status} /><div className="row-actions">{order.status === 'SUBMITTED' && <Button size="sm" onClick={() => void transition(order, 'ACCEPTED')}>Accept</Button>}{order.status === 'ACCEPTED' && <Button size="sm" onClick={() => void transition(order, 'PREPARING')}>Prepare</Button>}{order.status === 'PREPARING' && <Button size="sm" onClick={() => void transition(order, 'READY_FOR_DELIVERY')}>Ready</Button>}{order.status === 'READY_FOR_DELIVERY' && !order.delivery && <Button size="sm" onClick={() => void assign(order)}>Assign driver</Button>}{order.delivery?.status === 'FAILED' && <Button size="sm" onClick={() => void reschedule(order)}>Reschedule</Button>}{order.delivery?.status === 'RESCHEDULED' && <Button size="sm" onClick={() => void assign(order)}>Reassign driver</Button>}</div></article>)}</div></Panel>}</AsyncPanel></Page>;
}

function OrderTable({ orders }: { orders: Order[]; compact?: boolean }) {
  return <Panel title="Recent orders"><DataTable columns={['Store', 'Status', 'Payment', 'Total', 'Created']} rows={orders.map((order) => ({ id: order.id, cells: <><td><strong>{order.store.name}</strong></td><td><StatusBadge value={order.status} /></td><td><StatusBadge value={order.paymentStatus} /></td><td>{order.totalFormatted}</td><td>{formatDate(order.createdAt)}</td></> }))} getKey={(row) => row.id} /></Panel>;
}

function Reports() {
  return <Page title="Reports" subtitle="Operational exports for finance and planning"><Panel title="Sales ledger"><div className="report-callout"><div><Download size={22} /><div><strong>Sales report</strong><p>Every supplier order with store, status, payment, and OMR value.</p></div></div><a className="button button-primary button-md" href="/api/supplier/reports/sales.csv"><Download size={16} />Download CSV</a></div></Panel></Page>;
}
