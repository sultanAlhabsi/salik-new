import { useEffect, useState } from 'react';
import { ArrowRight, Building2, Loader2, LockKeyhole, Store, Truck, Warehouse } from 'lucide-react';
import { api, login, logout, me } from './api';
import { Button, Field } from './components/ui';
import { preparedDemoAccounts, preparedDemoPassword } from './demo-access';
import { AdminPortal } from './routes/AdminPortal';
import { DriverPortal } from './routes/DriverPortal';
import { StorePortal } from './routes/StorePortal';
import { SupplierPortal } from './routes/SupplierPortal';
import type { CurrentUser } from './types';

const demoIcons = { admin: Building2, supplier: Warehouse, store: Store, driver: Truck } as const;

export default function App() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [checking, setChecking] = useState(true);
  useEffect(() => { me().then((result) => setUser(result.user)).catch(() => undefined).finally(() => setChecking(false)); }, []);
  if (checking) return <div className="boot-screen"><Loader2 className="spin" /><span>Opening SALIK</span></div>;
  async function signOut() { await logout(); setUser(null); }
  if (!user) return <LoginScreen onLogin={setUser} />;
  if (user.portal === 'admin') return <AdminPortal user={user} onLogout={() => void signOut()} />;
  if (user.portal === 'supplier') return <SupplierPortal user={user} onLogout={() => void signOut()} />;
  if (user.portal === 'store') return <StorePortal user={user} onLogout={() => void signOut()} />;
  return <DriverPortal user={user} onLogout={() => void signOut()} />;
}

function LoginScreen({ onLogin }: { onLogin: (user: CurrentUser) => void }) {
  const [email, setEmail] = useState('store@alnoor.om');
  const [password, setPassword] = useState(preparedDemoPassword);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const resetToken =
    new URLSearchParams(window.location.search).get('resetToken') ??
    (hashParams.get('type') === 'recovery' ? hashParams.get('access_token') : null);
  async function authenticate(loginEmail = email, loginPassword = password) {
    setBusy(true); setError('');
    try { const result = await login(loginEmail, loginPassword); onLogin(result.user); } catch (err) { setError(err instanceof Error ? err.message : 'Sign in failed'); } finally { setBusy(false); }
  }
  async function requestReset() {
    setBusy(true); setError('');
    try { const result = await api<{ message: string }>('/auth/password-reset/request', { method: 'POST', body: JSON.stringify({ email }) }); setNotice(result.message); } catch (err) { setError(err instanceof Error ? err.message : 'Request failed'); } finally { setBusy(false); }
  }
  async function completeReset() {
    if (!resetToken) return;
    setBusy(true); setError('');
    try { await api('/auth/password-reset/complete', { method: 'POST', body: JSON.stringify({ token: resetToken, newPassword: password }) }); window.history.replaceState({}, '', window.location.pathname); setNotice('Password updated. You can now sign in.'); } catch (err) { setError(err instanceof Error ? err.message : 'Reset failed'); } finally { setBusy(false); }
  }
  const isReset = resetMode || Boolean(resetToken);
  return <main className="login-page"><section className="login-brand"><div className="login-wordmark"><span>S</span><strong>SALIK</strong></div><div className="login-message"><p>Wholesale distribution for Oman</p><h1>Orders moving.<br />Business connected.</h1><span>One operating system for suppliers, stores, drivers, and the SALIK team.</span></div><div className="route-map" aria-hidden="true"><span /><span /><span /><span /></div><footer>Muscat · Nizwa · Sohar · Salalah</footer></section><section className="login-panel"><div className="login-form"><header><div className="lock-mark"><LockKeyhole size={20} /></div><h2>{resetToken ? 'Set a new password' : resetMode ? 'Reset your password' : 'Sign in to SALIK'}</h2><p>{isReset ? 'Use your work email to restore secure access.' : 'Use your work account or open a prepared demo portal.'}</p></header>{resetToken ? <form onSubmit={(event) => { event.preventDefault(); void completeReset(); }}><Field label="New password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={10} required />{error && <p className="login-error" role="alert">{error}</p>}{notice && <p className="login-notice" role="status" aria-live="polite">{notice}</p>}<Button type="submit" disabled={busy}>Update password</Button></form> : resetMode ? <form onSubmit={(event) => { event.preventDefault(); void requestReset(); }}><Field label="Work email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />{error && <p className="login-error" role="alert">{error}</p>}{notice && <p className="login-notice" role="status" aria-live="polite">{notice}</p>}<Button type="submit" disabled={busy}>Request reset link</Button><button className="text-button" type="button" onClick={() => setResetMode(false)}>Back to sign in</button></form> : <><form onSubmit={(event) => { event.preventDefault(); void authenticate(); }}><Field label="Work email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /><Field label="Password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />{error && <p className="login-error" role="alert">{error}</p>}<Button type="submit" disabled={busy}>{busy ? <Loader2 className="spin" size={17} /> : <>Sign in <ArrowRight size={17} /></>}</Button><button className="text-button" type="button" onClick={() => setResetMode(true)}>Forgot password?</button></form><div className="demo-divider"><span>Prepared demo access</span></div><div className="demo-grid">{preparedDemoAccounts.map((demo) => { const Icon = demoIcons[demo.portal]; return <button type="button" key={demo.email} disabled={busy} onClick={() => { setEmail(demo.email); setPassword(demo.password); void authenticate(demo.email, demo.password); }}><Icon size={18} /><span><strong>{demo.label}</strong><small>{demo.detail}</small></span><ArrowRight size={16} /></button>; })}</div></>}</div></section></main>;
}
