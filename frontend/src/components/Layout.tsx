import { NavLink } from 'react-router-dom';
import type { ReactNode } from 'react';

const navItems = [
  { to: '/pipeline', label: 'Pipeline' },
  { to: '/leads', label: 'Leads' },
  { to: '/contacts', label: 'Contacts' },
  { to: '/audit', label: 'Audit Log' },
];

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200">
          <h1 className="text-lg font-bold text-indigo-600">VerticalCRM</h1>
          <p className="text-xs text-gray-400">Policy-driven CRM</p>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-gray-200 text-xs text-gray-400">
          Org: {localStorage.getItem('x-org-id') ?? 'org-acme'}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  );
}
