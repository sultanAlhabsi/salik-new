import { Bell, Boxes, Building2, ChartNoAxesCombined, ClipboardList, CreditCard, LayoutDashboard, LogOut, PackageSearch, Route, Truck, UserCog, Warehouse } from 'lucide-react';
import type { KeyboardEvent, ReactNode } from 'react';
import type { CurrentUser, Portal } from '../types';
import { Button } from './ui';

export type TabItem = {
  id: string;
  label: string;
  icon: ReactNode;
};

const portalAccent: Record<Portal, string> = {
  admin: 'Platform',
  supplier: 'Supply',
  store: 'Store',
  driver: 'Driver'
};

export const icons = {
  dashboard: <LayoutDashboard size={18} />,
  organizations: <Building2 size={18} />,
  catalog: <PackageSearch size={18} />,
  orders: <ClipboardList size={18} />,
  inventory: <Warehouse size={18} />,
  deliveries: <Truck size={18} />,
  payments: <CreditCard size={18} />,
  reports: <ChartNoAxesCombined size={18} />,
  users: <UserCog size={18} />,
  notifications: <Bell size={18} />,
  route: <Route size={18} />,
  boxes: <Boxes size={18} />
};

export function PortalShell({
  user,
  tabs,
  activeTab,
  onTabChange,
  onLogout,
  children
}: {
  user: CurrentUser;
  tabs: TabItem[];
  activeTab: string;
  onTabChange: (tab: string) => void;
  onLogout: () => void;
  children: ReactNode;
}) {
  function handleTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | undefined;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = tabs.length - 1;
    if (nextIndex === undefined) return;
    event.preventDefault();
    const nextTab = tabs[nextIndex];
    onTabChange(nextTab.id);
    document.getElementById(`${user.portal}-tab-${nextTab.id}`)?.focus();
  }

  return (
    <div className="portal-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">S</div>
          <div>
            <strong>SALIK</strong>
            <span>{portalAccent[user.portal]}</span>
          </div>
        </div>
        <div className="route-rail" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <nav className="nav-tabs" role="tablist" aria-label={`${user.portal} navigation`}>
          {tabs.map((tab, index) => (
            <button
              key={tab.id}
              id={`${user.portal}-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`${user.portal}-panel-${tab.id}`}
              tabIndex={activeTab === tab.id ? 0 : -1}
              className={activeTab === tab.id ? 'active' : ''}
              onClick={() => onTabChange(tab.id)}
              onKeyDown={(event) => handleTabKey(event, index)}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <div>
            <p>{user.organizationName ?? 'SALIK Operations'}</p>
            <h1>{portalAccent[user.portal]} portal</h1>
          </div>
          <div className="topbar-actions">
            <span>{user.name}</span>
            <Button variant="ghost" size="sm" onClick={onLogout}>
              <LogOut size={16} />
              Sign out
            </Button>
          </div>
        </header>
        <section
          id={`${user.portal}-panel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`${user.portal}-tab-${activeTab}`}
          tabIndex={0}
        >
          {children}
        </section>
      </main>
    </div>
  );
}
