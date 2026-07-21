import { useState } from 'react';
import { Bell, Check, MapPin, UserPlus } from 'lucide-react';
import { api } from '../api';
import { AsyncPanel, Button, DataTable, Field, Metric, StatusBadge, TextArea, Toast } from '../components/ui';
import { useApiResource } from '../hooks';
import type { CurrentUser } from '../types';
import { formatDate, Page, Panel } from './AdminPortal';

type Notification = { id: string; title: string; body: string; readAt?: string; createdAt: string };

export function NotificationsView() {
  const { state, reload } = useApiResource<{ notifications: Notification[] }>('/notifications');
  async function markRead(id: string) {
    await api(`/notifications/${id}/read`, { method: 'POST' });
    await reload();
  }
  return <Page title="Notifications" subtitle="Operational updates linked to your organization"><Panel title="Inbox"><AsyncPanel state={state} empty={(data) => data.notifications.length === 0}>{(data) => <div className="notification-list">{data.notifications.map((notification) => <article key={notification.id} className={notification.readAt ? 'read' : ''}><div className="notification-icon">{notification.readAt ? <Check size={16} /> : <Bell size={16} />}</div><div><strong>{notification.title}</strong><p>{notification.body}</p><small>{formatDate(notification.createdAt)}</small></div>{!notification.readAt && <Button size="sm" variant="secondary" onClick={() => void markRead(notification.id)}>Mark read</Button>}</article>)}</div>}</AsyncPanel></Panel></Page>;
}

type OrganizationPayload = {
  organization: { id: string; name: string; type: string; status: string; email?: string; phone?: string; taxNumber?: string };
  subscription?: { status: string; plan: { name: string; maxUsers: number; maxWarehouses: number; maxProducts: number } };
  usage: { users: number; warehouses: number; products: number };
};
type SafeUser = { id: string; name: string; email: string; role: string; status: string };
type Address = { id: string; label: string; type: string; line1: string; city: string; country: string; isDefault: boolean };

export function OrganizationView({ user }: { user: CurrentUser }) {
  const org = useApiResource<OrganizationPayload>('/organization');
  const canManage = ['SUPPLIER_ADMIN', 'STORE_ADMIN'].includes(user.role);
  return <Page title="Organization" subtitle="Company profile, plan capacity, users, and addresses"><AsyncPanel state={org.state}>{(data) => <><div className="metrics-grid"><Metric label="Users" value={data.usage.users} tone="blue" /><Metric label="Warehouses" value={data.usage.warehouses} tone="green" /><Metric label="Products" value={data.usage.products} tone="amber" /><Metric label="Plan" value={data.subscription?.plan.name ?? 'Standard'} /></div><Panel title={data.organization.name}><div className="organization-summary"><div><span>Status</span><StatusBadge value={data.organization.status} /></div><div><span>Email</span><strong>{data.organization.email ?? 'Not set'}</strong></div><div><span>Phone</span><strong>{data.organization.phone ?? 'Not set'}</strong></div><div><span>Tax number</span><strong>{data.organization.taxNumber ?? 'Not set'}</strong></div></div></Panel>{canManage && <OrganizationAdmin portal={user.portal} currentUserId={user.id} />}<SupportRequest /></>}</AsyncPanel></Page>;
}

function OrganizationAdmin({ portal, currentUserId }: { portal: CurrentUser['portal']; currentUserId: string }) {
  const users = useApiResource<{ users: SafeUser[] }>('/organization/users');
  const addresses = useApiResource<{ addresses: Address[] }>('/organization/addresses');
  const [message, setMessage] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('Temporary123!');
  const [role, setRole] = useState(portal === 'supplier' ? 'DRIVER' : 'STORE_BUYER');
  const [addressLabel, setAddressLabel] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [addressCity, setAddressCity] = useState('Muscat');
  async function invite() {
    try { await api('/organization/users', { method: 'POST', body: JSON.stringify({ name, email, role, temporaryPassword }) }); setMessage('User invitation created'); setName(''); setEmail(''); await users.reload(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Invitation failed'); }
  }
  async function toggleUser(member: SafeUser) { try { await api(`/organization/users/${member.id}`, { method: 'PATCH', body: JSON.stringify({ status: member.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' }) }); setMessage('User access updated'); await users.reload(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not update user'); } }
  async function addAddress() { try { await api('/organization/addresses', { method: 'POST', body: JSON.stringify({ type: portal === 'supplier' ? 'WAREHOUSE' : 'SHIPPING', label: addressLabel, line1: addressLine, city: addressCity, country: 'Oman' }) }); setMessage('Address created'); setAddressLabel(''); setAddressLine(''); await addresses.reload(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not create address'); } }
  return <><Toast message={message} /><div className="two-column"><Panel title="Team"><AsyncPanel state={users.state} empty={(data) => data.users.length === 0}>{(data) => <DataTable columns={['Name', 'Role', 'Status', 'Action']} rows={data.users.map((member) => ({ id: member.id, cells: <><td><strong>{member.name}</strong><small>{member.email}</small></td><td>{member.role.replaceAll('_', ' ')}</td><td><StatusBadge value={member.status} /></td><td>{member.id !== currentUserId && <Button size="sm" variant="secondary" onClick={() => void toggleUser(member)}>{member.status === 'ACTIVE' ? 'Suspend' : 'Activate'}</Button>}</td></> }))} getKey={(row) => row.id} />}</AsyncPanel><div className="inline-form"><Field label="Name" value={name} onChange={(event) => setName(event.target.value)} /><Field label="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} /><label className="field"><span>Role</span><select name="role" value={role} onChange={(event) => setRole(event.target.value)}>{portal === 'supplier' ? <><option value="DRIVER">Driver</option><option value="SUPPLIER_STAFF">Supplier staff</option></> : <option value="STORE_BUYER">Store buyer</option>}</select></label><Field label="Temporary password" value={temporaryPassword} onChange={(event) => setTemporaryPassword(event.target.value)} /><Button disabled={!name || !email} onClick={() => void invite()}><UserPlus size={16} />Invite user</Button></div></Panel><Panel title="Addresses"><AsyncPanel state={addresses.state} empty={(data) => data.addresses.length === 0}>{(data) => <div className="address-list">{data.addresses.map((address) => <article key={address.id}><MapPin size={17} /><div><strong>{address.label}</strong><span>{address.line1}, {address.city}, {address.country}</span></div><StatusBadge value={address.type} /></article>)}</div>}</AsyncPanel><div className="inline-form"><Field label="Label" value={addressLabel} onChange={(event) => setAddressLabel(event.target.value)} /><Field label="Address line" value={addressLine} onChange={(event) => setAddressLine(event.target.value)} /><Field label="City" value={addressCity} onChange={(event) => setAddressCity(event.target.value)} /><Button disabled={!addressLabel || !addressLine} onClick={() => void addAddress()}>Add address</Button></div></Panel></div></>;
}

function SupportRequest() {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [message, setMessage] = useState('');
  async function submit() { try { await api('/support', { method: 'POST', body: JSON.stringify({ subject, message: body }) }); setMessage('Support request submitted'); setSubject(''); setBody(''); } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not submit support request'); } }
  return <Panel title="Support request"><div className="support-form"><Toast message={message} /><Field label="Subject" value={subject} onChange={(event) => setSubject(event.target.value)} /><TextArea label="Message" value={body} onChange={(event) => setBody(event.target.value)} rows={3} /><Button disabled={!subject || body.length < 5} onClick={() => void submit()}>Submit request</Button></div></Panel>;
}
