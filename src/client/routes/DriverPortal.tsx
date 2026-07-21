import { useState } from 'react';
import { Check, MapPin, Navigation, PackageCheck, PhoneCall } from 'lucide-react';
import { api } from '../api';
import { icons, PortalShell } from '../components/PortalShell';
import { AsyncPanel, Button, Field, Metric, StatusBadge, TextArea, Toast } from '../components/ui';
import { useApiResource } from '../hooks';
import type { CurrentUser } from '../types';
import { Page } from './AdminPortal';
import { NotificationsView } from './SharedViews';

type Delivery = { id: string; status: string; recipientName?: string; proofNote?: string; order: { id: string; totalFormatted: string; store: { name: string; phone?: string }; deliveryAddress?: { line1: string; city: string; country: string }; items: Array<{ id: string; nameSnapshot: string; quantity: number }> } };

const tabs = [
  { id: 'route', label: 'My route', icon: icons.route },
  { id: 'completed', label: 'Completed', icon: <PackageCheck size={18} /> },
  { id: 'notifications', label: 'Notifications', icon: icons.notifications }
];

export function DriverPortal({ user, onLogout }: { user: CurrentUser; onLogout: () => void }) {
  const [tab, setTab] = useState('route');
  return <PortalShell user={user} tabs={tabs} activeTab={tab} onTabChange={setTab} onLogout={onLogout}><section className="content-area driver-content">{tab === 'route' && <DeliveryRoute />}{tab === 'completed' && <Completed />}{tab === 'notifications' && <NotificationsView />}</section></PortalShell>;
}

function DeliveryRoute() {
  const dashboard = useApiResource<{ stats: { assigned: number; active: number; delivered: number }; deliveries: Delivery[] }>('/driver/dashboard');
  const deliveries = useApiResource<{ deliveries: Delivery[] }>('/driver/deliveries');
  const [message, setMessage] = useState('');
  return <Page title="Today's route" subtitle="Assigned stops and proof of delivery"><Toast message={message} /><AsyncPanel state={dashboard.state}>{(data) => <div className="metrics-grid driver-metrics"><Metric label="Assigned" value={data.stats.assigned} tone="amber" /><Metric label="In progress" value={data.stats.active} tone="blue" /><Metric label="Delivered" value={data.stats.delivered} tone="green" /></div>}</AsyncPanel><AsyncPanel state={deliveries.state} empty={(d) => d.deliveries.filter((x) => x.status !== 'DELIVERED').length === 0}>{(data) => <div className="delivery-stack">{data.deliveries.filter((d) => d.status !== 'DELIVERED').map((delivery, index) => <DeliveryCard key={delivery.id} delivery={delivery} stop={index + 1} reload={deliveries.reload} onMessage={setMessage} />)}</div>}</AsyncPanel></Page>;
}

function Completed() {
  const { state } = useApiResource<{ deliveries: Delivery[] }>('/driver/deliveries');
  return <Page title="Completed deliveries" subtitle="Stops delivered on your assigned routes"><AsyncPanel state={state} empty={(d) => !d.deliveries.some((x) => x.status === 'DELIVERED')}>{(data) => <div className="delivery-stack">{data.deliveries.filter((d) => d.status === 'DELIVERED').map((d, i) => <DeliveryCard key={d.id} delivery={d} stop={i + 1} reload={async () => undefined} onMessage={() => undefined} />)}</div>}</AsyncPanel></Page>;
}

function DeliveryCard({ delivery, stop, reload, onMessage }: { delivery: Delivery; stop: number; reload: () => Promise<void>; onMessage: (message: string) => void }) {
  const [recipientName, setRecipientName] = useState('');
  const [proofNote, setProofNote] = useState('');
  const [busy, setBusy] = useState(false);
  async function update(status: string) {
    setBusy(true);
    try { await api(`/driver/deliveries/${delivery.id}/status`, { method: 'POST', body: JSON.stringify({ status, recipientName: recipientName || undefined, proofNote: proofNote || undefined }) }); onMessage('Delivery updated'); await reload(); } catch (error) { onMessage(error instanceof Error ? error.message : 'Update failed'); } finally { setBusy(false); }
  }
  const address = delivery.order.deliveryAddress;
  return <article className="delivery-card"><header><div className="stop-number">{delivery.status === 'DELIVERED' ? <Check size={18} /> : stop}</div><div><small>ORDER {delivery.order.id.slice(-8).toUpperCase()}</small><h3>{delivery.order.store.name}</h3></div><StatusBadge value={delivery.status} /></header><div className="delivery-details"><div><MapPin size={17} /><span>{address ? `${address.line1}, ${address.city}, ${address.country}` : 'Delivery address on file'}</span></div><div><Navigation size={17} /><span>{delivery.order.items.length} product {delivery.order.items.length === 1 ? 'line' : 'lines'} · {delivery.order.totalFormatted}</span></div></div><div className="delivery-items">{delivery.order.items.map((item) => <span key={item.id}>{item.quantity} × {item.nameSnapshot}</span>)}</div>{delivery.status === 'OUT_FOR_DELIVERY' && <div className="proof-fields"><Field label="Recipient name" value={recipientName} onChange={(event) => setRecipientName(event.target.value)} required /><TextArea label="Proof note" value={proofNote} onChange={(event) => setProofNote(event.target.value)} required rows={2} /></div>}<footer>{delivery.order.store.phone && <a className="button button-secondary button-sm" href={`tel:${delivery.order.store.phone}`}><PhoneCall size={15} />Call store</a>}{delivery.status === 'ASSIGNED' && <Button disabled={busy} onClick={() => void update('ACCEPTED')}>Accept delivery</Button>}{delivery.status === 'ACCEPTED' && <Button disabled={busy} onClick={() => void update('OUT_FOR_DELIVERY')}>Start delivery</Button>}{delivery.status === 'OUT_FOR_DELIVERY' && <Button disabled={busy || !recipientName || !proofNote} onClick={() => void update('DELIVERED')}><PackageCheck size={16} />Mark delivered</Button>}</footer></article>;
}
