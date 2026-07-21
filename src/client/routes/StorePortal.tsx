import { useMemo, useState } from 'react';
import { Download, Search, ShoppingCart, Trash2 } from 'lucide-react';
import { api } from '../api';
import { icons, PortalShell } from '../components/PortalShell';
import { AsyncPanel, Button, DataTable, Field, Metric, StatusBadge, Toast } from '../components/ui';
import { useApiResource } from '../hooks';
import type { CurrentUser } from '../types';
import { formatDate, Page, Panel } from './AdminPortal';
import { NotificationsView, OrganizationView } from './SharedViews';

type Dashboard = { stats: { orders: number; openInvoices: number; suppliers: number; unread: number }; recentOrders: Order[] };
type Product = { id: string; name: string; sku: string; description: string; imageUrl?: string; unit: string; minOrderQty: number; priceFormatted: string; available: number; supplier: { name: string } };
type Cart = { id: string; totalFormatted: string; groups: Array<{ supplierId: string; supplierName: string; totalFormatted: string; items: Array<{ id: string; name: string; quantity: number; priceFormatted: string; lineTotalFormatted: string }> }> };
type Address = { id: string; label: string; line1: string; city: string; country: string; isDefault: boolean };
type Order = { id: string; status: string; paymentStatus: string; paymentMethod: string; totalFormatted: string; createdAt: string; supplier: { name: string }; delivery?: { status: string } };
type Invoice = { id: string; invoiceNumber: string; status: string; totalBaisa: number; dueAt?: string; createdAt: string };

const tabs = [
  { id: 'overview', label: 'Overview', icon: icons.dashboard },
  { id: 'marketplace', label: 'Marketplace', icon: icons.catalog },
  { id: 'cart', label: 'Cart', icon: <ShoppingCart size={18} /> },
  { id: 'orders', label: 'Orders', icon: icons.orders },
  { id: 'invoices', label: 'Invoices', icon: icons.payments },
  { id: 'recurring', label: 'Recurring', icon: icons.boxes },
  { id: 'reports', label: 'Reports', icon: icons.reports },
  { id: 'organization', label: 'Organization', icon: icons.users },
  { id: 'notifications', label: 'Notifications', icon: icons.notifications }
];

export function StorePortal({ user, onLogout }: { user: CurrentUser; onLogout: () => void }) {
  const [tab, setTab] = useState('overview');
  const [cartVersion, setCartVersion] = useState(0);
  return <PortalShell user={user} tabs={tabs} activeTab={tab} onTabChange={setTab} onLogout={onLogout}><section className="content-area">{tab === 'overview' && <Overview />}{tab === 'marketplace' && <Marketplace onAdded={() => setCartVersion((v) => v + 1)} />}{tab === 'cart' && <CartView version={cartVersion} onCheckedOut={() => setCartVersion((v) => v + 1)} />}{tab === 'orders' && <Orders />}{tab === 'invoices' && <Invoices />}{tab === 'recurring' && <RecurringOrders />}{tab === 'reports' && <Reports />}{tab === 'organization' && <OrganizationView user={user} />}{tab === 'notifications' && <NotificationsView />}</section></PortalShell>;
}

function Overview() {
  const { state } = useApiResource<Dashboard>('/store/dashboard');
  return <Page title="Store overview" subtitle="Procurement status across your supplier network"><AsyncPanel state={state}>{(data) => <><div className="metrics-grid"><Metric label="Orders" value={data.stats.orders} tone="blue" /><Metric label="Open invoices" value={data.stats.openInvoices} tone="amber" /><Metric label="Active suppliers" value={data.stats.suppliers} tone="green" /><Metric label="Unread alerts" value={data.stats.unread} /></div><Panel title="Recent orders"><OrderTable orders={data.recentOrders} /></Panel></>}</AsyncPanel></Page>;
}

function Marketplace({ onAdded }: { onAdded: () => void }) {
  const { state } = useApiResource<{ products: Product[] }>('/store/products');
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const products = useMemo(() => state.status === 'success' ? state.data.products.filter((p) => `${p.name} ${p.sku} ${p.supplier.name}`.toLowerCase().includes(query.toLowerCase())) : [], [query, state]);
  async function add(product: Product) {
    try { await api('/store/cart/items', { method: 'POST', body: JSON.stringify({ productId: product.id, quantity: product.minOrderQty }) }); setMessage(`${product.name} added to cart`); onAdded(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not add product'); }
  }
  return <Page title="Marketplace" subtitle="Published products from approved Omani suppliers"><Toast message={message} /><div className="filter-bar"><Search size={18} /><Field label="Search products" aria-label="Search products" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, SKU, or supplier" /></div><AsyncPanel state={state}>{() => products.length === 0 ? <div className="state-box">No matching products</div> : <div className="product-grid">{products.map((product) => <article className="product-card" key={product.id}><div className="product-visual">{product.imageUrl ? <img src={product.imageUrl} alt="" /> : <span>{product.supplier.name.slice(0, 2).toUpperCase()}</span>}<small>{product.unit}</small></div><div className="product-copy"><small>{product.supplier.name}</small><h3>{product.name}</h3><p>{product.description}</p><div className="product-meta"><strong>{product.priceFormatted}</strong><span>{product.available} available</span></div><Button disabled={product.available < product.minOrderQty} onClick={() => void add(product)}><ShoppingCart size={16} />Add {product.name}</Button></div></article>)}</div>}</AsyncPanel></Page>;
}

function CartView({ version, onCheckedOut }: { version: number; onCheckedOut: () => void }) {
  const cart = useApiResource<{ cart: Cart }>(`/store/cart?v=${version}`);
  const addresses = useApiResource<{ addresses: Address[] }>('/store/addresses');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function remove(id: string) { await api(`/store/cart/items/${id}`, { method: 'DELETE' }); await cart.reload(); }
  async function checkout() {
    if (addresses.state.status !== 'success' || !addresses.state.data.addresses[0]) { setMessage('Add a delivery address before checkout'); return; }
    setBusy(true);
    try {
      await api('/store/checkout', { method: 'POST', body: JSON.stringify({ deliveryAddressId: addresses.state.data.addresses[0].id, paymentMethod: 'INVOICE', idempotencyKey: globalThis.crypto?.randomUUID?.() ?? `checkout-${Date.now()}` }) });
      setMessage('Checkout submitted'); onCheckedOut(); await cart.reload();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Checkout failed'); } finally { setBusy(false); }
  }
  return <Page title="Cart" subtitle="One checkout, automatically split into supplier orders"><Toast message={message} /><AsyncPanel state={cart.state}>{(data) => data.cart.groups.length === 0 ? <div className="empty-cart"><ShoppingCart size={26} /><strong>Your cart is empty</strong><span>Add products from the marketplace to begin.</span></div> : <div className="cart-layout"><div className="cart-groups">{data.cart.groups.map((group) => <Panel title={group.supplierName} key={group.supplierId}>{group.items.map((item) => <div className="cart-item" key={item.id}><div><strong>{item.name}</strong><span>{item.quantity} × {item.priceFormatted}</span></div><strong>{item.lineTotalFormatted}</strong><button className="icon-action" type="button" title={`Remove ${item.name}`} onClick={() => void remove(item.id)}><Trash2 size={16} /></button></div>)}</Panel>)}</div><aside className="checkout-summary"><h3>Order summary</h3><div><span>Suppliers</span><strong>{data.cart.groups.length}</strong></div><div className="summary-total"><span>Total</span><strong>{data.cart.totalFormatted}</strong></div><p>Payment terms: Invoice</p><Button disabled={busy} onClick={() => void checkout()}>{busy ? 'Submitting…' : 'Submit checkout'}</Button></aside></div>}</AsyncPanel></Page>;
}

function Orders() {
  const { state, reload } = useApiResource<{ orders: Order[] }>('/store/orders');
  const [message, setMessage] = useState('');
  async function pay(order: Order) { try { await api(`/store/orders/${order.id}/payments`, { method: 'POST', body: JSON.stringify({ provider: 'local-pay', idempotencyKey: `payment:${order.id}` }) }); setMessage('Payment initiated'); await reload(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Payment could not start'); } }
  return <Page title="Orders" subtitle="Track supplier fulfillment and delivery progress"><Toast message={message} /><Panel title="Order history"><AsyncPanel state={state} empty={(d) => d.orders.length === 0}>{(data) => <OrderTable orders={data.orders} onPay={pay} />}</AsyncPanel></Panel></Page>;
}

function OrderTable({ orders, onPay }: { orders: Order[]; onPay?: (order: Order) => void }) {
  const columns = ['Supplier', 'Order', 'Status', 'Payment', 'Total', 'Created', ...(onPay ? ['Action'] : [])];
  return <DataTable columns={columns} rows={orders.map((order) => ({ id: order.id, cells: <><td><strong>{order.supplier.name}</strong></td><td>{order.id.slice(-8).toUpperCase()}</td><td><StatusBadge value={order.status} /></td><td><StatusBadge value={order.paymentStatus} /></td><td>{order.totalFormatted}</td><td>{formatDate(order.createdAt)}</td>{onPay && <td>{order.paymentMethod === 'CARD' && ['PENDING', 'FAILED'].includes(order.paymentStatus) && <Button size="sm" onClick={() => onPay(order)}>Pay now</Button>}</td>}</> }))} getKey={(row) => row.id} />;
}

function Invoices() {
  const { state } = useApiResource<{ invoices: Invoice[] }>('/invoices');
  return <Page title="Invoices" subtitle="Printable records for every supplier order"><Panel title="Invoice register"><AsyncPanel state={state} empty={(d) => d.invoices.length === 0}>{(data) => <DataTable columns={['Invoice', 'Status', 'Total', 'Issued', 'Document']} rows={data.invoices.map((invoice) => ({ id: invoice.id, cells: <><td><strong>{invoice.invoiceNumber}</strong></td><td><StatusBadge value={invoice.status} /></td><td>{(invoice.totalBaisa / 1000).toFixed(3)} OMR</td><td>{formatDate(invoice.createdAt)}</td><td><a className="table-link" href={`/api/invoices/${invoice.id}/print`} target="_blank" rel="noreferrer">Print</a></td></> }))} getKey={(row) => row.id} />}</AsyncPanel></Panel></Page>;
}

type Recurring = { id: string; name: string; status: string; cadenceDays: number; nextRunAt: string; lastRunAt?: string; supplier: { name: string }; items: Array<{ quantity: number; product: { name: string } }> };

function RecurringOrders() {
  const recurring = useApiResource<{ recurringOrders: Recurring[] }>('/store/recurring-orders');
  const products = useApiResource<{ products: Product[] }>('/store/products');
  const addresses = useApiResource<{ addresses: Address[] }>('/store/addresses');
  const [name, setName] = useState('');
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [cadenceDays, setCadenceDays] = useState(7);
  const [message, setMessage] = useState('');
  async function create() {
    if (addresses.state.status !== 'success' || !addresses.state.data.addresses[0]) return;
    try { await api('/store/recurring-orders', { method: 'POST', body: JSON.stringify({ name, deliveryAddressId: addresses.state.data.addresses[0].id, cadenceDays, nextRunAt: new Date().toISOString(), paymentMethod: 'INVOICE', items: [{ productId, quantity }] }) }); setMessage('Recurring order created'); setName(''); await recurring.reload(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not create recurring order'); }
  }
  async function run(order: Recurring) { try { await api(`/store/recurring-orders/${order.id}/run`, { method: 'POST', body: JSON.stringify({ idempotencyKey: `recurring:${order.id}:${new Date(order.nextRunAt).getTime()}` }) }); setMessage('Recurring order submitted'); await recurring.reload(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not run recurring order'); } }
  async function pause(order: Recurring) { await api(`/store/recurring-orders/${order.id}`, { method: 'PATCH', body: JSON.stringify({ status: order.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE' }) }); await recurring.reload(); }
  return <Page title="Recurring orders" subtitle="Scheduled templates that create normal traceable checkouts"><Toast message={message} /><Panel title="Schedules"><AsyncPanel state={recurring.state} empty={(data) => data.recurringOrders.length === 0}>{(data) => <DataTable columns={['Schedule', 'Supplier', 'Items', 'Cadence', 'Next run', 'Status', 'Actions']} rows={data.recurringOrders.map((order) => ({ id: order.id, cells: <><td><strong>{order.name}</strong></td><td>{order.supplier.name}</td><td>{order.items.map((item) => `${item.quantity} × ${item.product.name}`).join(', ')}</td><td>Every {order.cadenceDays} days</td><td>{formatDate(order.nextRunAt)}</td><td><StatusBadge value={order.status} /></td><td><div className="row-actions"><Button size="sm" disabled={order.status !== 'ACTIVE'} onClick={() => void run(order)}>Run now</Button><Button size="sm" variant="secondary" onClick={() => void pause(order)}>{order.status === 'ACTIVE' ? 'Pause' : 'Resume'}</Button></div></td></> }))} getKey={(row) => row.id} />}</AsyncPanel><div className="inline-form recurring-form"><Field label="Schedule name" value={name} onChange={(event) => setName(event.target.value)} /><label className="field"><span>Product</span><select name="product" value={productId} onChange={(event) => { setProductId(event.target.value); const selected = products.state.status === 'success' ? products.state.data.products.find((product) => product.id === event.target.value) : undefined; if (selected) setQuantity(selected.minOrderQty); }}><option value="">Select product</option>{products.state.status === 'success' && products.state.data.products.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.supplier.name}</option>)}</select></label><Field label="Quantity" type="number" min={1} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /><Field label="Cadence (days)" type="number" min={1} max={365} value={cadenceDays} onChange={(event) => setCadenceDays(Number(event.target.value))} /><Button disabled={!name || !productId} onClick={() => void create()}>Create schedule</Button></div></Panel></Page>;
}

function Reports() {
  return <Page title="Reports" subtitle="Download procurement data for reconciliation"><Panel title="Spending report"><div className="report-callout"><div><Download size={22} /><div><strong>Store spending</strong><p>Supplier, status, payment, and total value for every order.</p></div></div><a className="button button-primary button-md" href="/api/store/reports/spending.csv"><Download size={16} />Download CSV</a></div></Panel></Page>;
}
