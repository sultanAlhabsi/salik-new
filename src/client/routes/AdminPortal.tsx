import { useState } from 'react';
import { Download, LifeBuoy, SlidersHorizontal } from 'lucide-react';
import { api } from '../api';
import type { CurrentUser } from '../types';
import { useApiResource } from '../hooks';
import { icons, PortalShell } from '../components/PortalShell';
import { AsyncPanel, Button, DataTable, Field, Metric, StatusBadge, Toast } from '../components/ui';
import { NotificationsView } from './SharedViews';

type Dashboard = {
  stats: { organizations: number; orders: number; deliveries: number; paid: number; subscriptions: number };
  recentAudit: Array<{ id: string; action: string; entityType: string; createdAt: string; actor?: { name: string } }>;
};
type Organizations = { organizations: Array<{ id: string; name: string; type: string; status: string; users: unknown[]; createdAt: string }> };
type Payments = { payments: Array<{ id: string; status: string; method: string; amountFormatted: string; createdAt: string; order: { supplier: { name: string }; store: { name: string } } }> };
type Audit = { logs: Array<{ id: string; action: string; entityType: string; entityId: string; createdAt: string; actor?: { name: string }; organization?: { name: string } }> };
type Support = { tickets: Array<{ id: string; subject: string; status: string; organization: { name: string }; createdAt: string }> };

const tabs = [
  { id: 'overview', label: 'Overview', icon: icons.dashboard },
  { id: 'organizations', label: 'Organizations', icon: icons.organizations },
  { id: 'plans', label: 'Plans', icon: <SlidersHorizontal size={18} /> },
  { id: 'payments', label: 'Payments', icon: icons.payments },
  { id: 'audit', label: 'Audit log', icon: icons.reports },
  { id: 'support', label: 'Support', icon: <LifeBuoy size={18} /> },
  { id: 'notifications', label: 'Notifications', icon: icons.notifications }
];

export function AdminPortal({ user, onLogout }: { user: CurrentUser; onLogout: () => void }) {
  const [tab, setTab] = useState('overview');
  return (
    <PortalShell user={user} tabs={tabs} activeTab={tab} onTabChange={setTab} onLogout={onLogout}>
      <section className="content-area">
        {tab === 'overview' && <AdminOverview />}
        {tab === 'organizations' && <OrganizationsView />}
        {tab === 'plans' && <PlansView />}
        {tab === 'payments' && <PaymentsView />}
        {tab === 'audit' && <AuditView />}
        {tab === 'support' && <SupportView />}
        {tab === 'notifications' && <NotificationsView />}
      </section>
    </PortalShell>
  );
}

type PlanRecord = { id: string; code: string; name: string; status: string; monthlyPriceFormatted: string; maxUsers: number; maxWarehouses: number; maxProducts: number; supportsCredit: boolean };
type SubscriptionRecord = { id: string; status: string; currentPeriodEnd: string; supplier: { name: string }; plan: { name: string } };

function PlansView() {
  const plans = useApiResource<{ plans: PlanRecord[] }>('/admin/plans');
  const subscriptions = useApiResource<{ subscriptions: SubscriptionRecord[] }>('/admin/subscriptions');
  const settings = useApiResource<{ settings: Array<{ id: string; key: string; value: unknown }> }>('/admin/settings');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  async function createPlan() {
    try {
      await api('/admin/plans', { method: 'POST', body: JSON.stringify({ code, name, monthlyPriceBaisa: 19000, maxUsers: 5, maxWarehouses: 1, maxProducts: 100, supportsCredit: true }) });
      setMessage('Plan created'); setName(''); setCode(''); await plans.reload();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not create plan'); }
  }
  async function suspend(id: string) { await api(`/admin/subscriptions/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'SUSPENDED' }) }); await subscriptions.reload(); }
  return <Page title="Plans and settings" subtitle="Subscription capacity, lifecycle, and platform policy"><Toast message={message} /><div className="two-column"><Panel title="Plans"><AsyncPanel state={plans.state}>{(data) => <DataTable columns={['Plan', 'Price', 'Users', 'Warehouses', 'Products', 'Status']} rows={data.plans.map((plan) => ({ id: plan.id, cells: <><td><strong>{plan.name}</strong><small>{plan.code}</small></td><td>{plan.monthlyPriceFormatted}</td><td>{plan.maxUsers}</td><td>{plan.maxWarehouses}</td><td>{plan.maxProducts}</td><td><StatusBadge value={plan.status} /></td></> }))} getKey={(row) => row.id} />}</AsyncPanel><div className="inline-form"><Field label="Plan name" value={name} onChange={(event) => setName(event.target.value)} /><Field label="Code" value={code} onChange={(event) => setCode(event.target.value)} /><Button disabled={!name || !code} onClick={() => void createPlan()}>Create plan</Button></div></Panel><Panel title="Platform settings"><AsyncPanel state={settings.state} empty={(data) => data.settings.length === 0}>{(data) => <div className="setting-list">{data.settings.map((setting) => <div key={setting.id}><strong>{setting.key}</strong><code>{JSON.stringify(setting.value)}</code></div>)}</div>}</AsyncPanel></Panel></div><Panel title="Subscriptions"><AsyncPanel state={subscriptions.state} empty={(data) => data.subscriptions.length === 0}>{(data) => <DataTable columns={['Supplier', 'Plan', 'Status', 'Period end', 'Action']} rows={data.subscriptions.map((subscription) => ({ id: subscription.id, cells: <><td><strong>{subscription.supplier.name}</strong></td><td>{subscription.plan.name}</td><td><StatusBadge value={subscription.status} /></td><td>{formatDate(subscription.currentPeriodEnd)}</td><td>{['ACTIVE', 'TRIAL'].includes(subscription.status) && <Button size="sm" variant="secondary" onClick={() => void suspend(subscription.id)}>Suspend</Button>}</td></> }))} getKey={(row) => row.id} />}</AsyncPanel></Panel></Page>;
}

function AdminOverview() {
  const { state } = useApiResource<Dashboard>('/admin/dashboard');
  return (
    <Page title="Operations overview" subtitle="Live platform activity across Oman">
      <AsyncPanel state={state}>
        {(data) => (
          <>
            <div className="metrics-grid">
              <Metric label="Active organizations" value={data.stats.organizations} tone="green" />
              <Metric label="Orders" value={data.stats.orders} tone="blue" />
              <Metric label="Deliveries" value={data.stats.deliveries} tone="amber" />
              <Metric label="Paid transactions" value={data.stats.paid} />
              <Metric label="Subscriptions" value={data.stats.subscriptions} />
            </div>
            <Panel title="Recent activity">
              <DataTable
                columns={['Action', 'Entity', 'Actor', 'Time']}
                rows={data.recentAudit.map((log) => ({ cells: <><td>{humanize(log.action)}</td><td>{humanize(log.entityType)}</td><td>{log.actor?.name ?? 'System'}</td><td>{formatDate(log.createdAt)}</td></> }))}
                getKey={(row) => row.id ?? crypto.randomUUID()}
              />
            </Panel>
          </>
        )}
      </AsyncPanel>
    </Page>
  );
}

function OrganizationsView() {
  const { state, reload } = useApiResource<Organizations>('/admin/organizations');
  const [name, setName] = useState('');
  const [type, setType] = useState('SUPPLIER');
  const [adminEmail, setAdminEmail] = useState('');
  const [message, setMessage] = useState('');
  async function create() { try { await api('/admin/organizations', { method: 'POST', body: JSON.stringify({ name, type, adminName: `${name} Admin`, adminEmail, temporaryPassword: 'Temporary123!' }) }); setMessage('Organization and administrator created'); setName(''); setAdminEmail(''); await reload(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not create organization'); } }
  return <Page title="Organizations" subtitle="Suppliers and stores on the SALIK network"><Toast message={message} /><Panel title="Directory"><AsyncPanel state={state} empty={(d) => d.organizations.length === 0}>{(data) => <DataTable columns={['Organization', 'Type', 'Users', 'Status', 'Joined']} rows={data.organizations.map((org) => ({ id: org.id, cells: <><td><strong>{org.name}</strong></td><td>{org.type}</td><td>{org.users.length}</td><td><StatusBadge value={org.status} /></td><td>{formatDate(org.createdAt)}</td></> }))} getKey={(row) => row.id} />}</AsyncPanel><div className="inline-form"><Field label="Organization name" value={name} onChange={(event) => setName(event.target.value)} /><label className="field"><span>Type</span><select name="type" value={type} onChange={(event) => setType(event.target.value)}><option value="SUPPLIER">Supplier</option><option value="STORE">Store</option></select></label><Field label="Administrator email" type="email" value={adminEmail} onChange={(event) => setAdminEmail(event.target.value)} /><Button disabled={!name || !adminEmail} onClick={() => void create()}>Create organization</Button></div></Panel></Page>;
}

function PaymentsView() {
  const { state } = useApiResource<Payments>('/admin/payments');
  return <Page title="Payments" subtitle="Gateway attempts and invoice settlement"><Panel title="Transaction ledger"><AsyncPanel state={state} empty={(d) => d.payments.length === 0}>{(data) => <DataTable columns={['Route', 'Method', 'Amount', 'Status', 'Time']} rows={data.payments.map((payment) => ({ id: payment.id, cells: <><td>{payment.order.store.name} to {payment.order.supplier.name}</td><td>{payment.method}</td><td>{payment.amountFormatted}</td><td><StatusBadge value={payment.status} /></td><td>{formatDate(payment.createdAt)}</td></> }))} getKey={(row) => row.id} />}</AsyncPanel></Panel></Page>;
}

function AuditView() {
  const { state } = useApiResource<Audit>('/admin/audit');
  return <Page title="Audit log" subtitle="Immutable record of sensitive platform actions"><Panel title="Latest events" action={<button className="icon-action" title="Export audit log" type="button"><Download size={17} /></button>}><AsyncPanel state={state} empty={(d) => d.logs.length === 0}>{(data) => <DataTable columns={['Action', 'Organization', 'Entity', 'Actor', 'Time']} rows={data.logs.map((log) => ({ id: log.id, cells: <><td>{humanize(log.action)}</td><td>{log.organization?.name ?? 'Platform'}</td><td>{humanize(log.entityType)}</td><td>{log.actor?.name ?? 'System'}</td><td>{formatDate(log.createdAt)}</td></> }))} getKey={(row) => row.id} />}</AsyncPanel></Panel></Page>;
}

function SupportView() {
  const { state, reload } = useApiResource<Support>('/admin/support');
  async function advance(id: string) { await api(`/admin/support/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'IN_PROGRESS' }) }); await reload(); }
  return <Page title="Support" subtitle="Service requests that need operational attention"><Panel title="Tickets"><AsyncPanel state={state} empty={(d) => d.tickets.length === 0}>{(data) => <DataTable columns={['Subject', 'Organization', 'Status', 'Opened', 'Action']} rows={data.tickets.map((ticket) => ({ id: ticket.id, cells: <><td><strong>{ticket.subject}</strong></td><td>{ticket.organization.name}</td><td><StatusBadge value={ticket.status} /></td><td>{formatDate(ticket.createdAt)}</td><td>{ticket.status === 'OPEN' && <Button size="sm" onClick={() => void advance(ticket.id)}>Start work</Button>}</td></> }))} getKey={(row) => row.id} />}</AsyncPanel></Panel></Page>;
}

export function Page({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <><div className="page-heading"><div><h2>{title}</h2><p>{subtitle}</p></div></div>{children}</>;
}

export function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <section className="panel"><header><h3>{title}</h3>{action}</header><div className="panel-body">{children}</div></section>;
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-OM', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function humanize(value: string) {
  return value.replaceAll('_', ' ').toLowerCase().replace(/^./, (letter) => letter.toUpperCase());
}
