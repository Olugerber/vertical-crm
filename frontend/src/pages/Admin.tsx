import { useEffect, useState } from 'react';
import { api } from '../api/client.ts';
import Modal from '../components/Modal.tsx';

type Tab = 'org' | 'policy' | 'users';

const ROLE_OPTIONS = ['Admin', 'SalesManager', 'AE', 'CS', 'Compliance', 'SalesDirector'];

export default function Admin() {
  const [tab, setTab] = useState<Tab>('policy');

  // Org state
  const [org, setOrg] = useState<any>(null);
  const [orgForm, setOrgForm] = useState({ name: '', website: '', industry: '' });
  const [orgSaving, setOrgSaving] = useState(false);

  // Policy state
  const [policyState, setPolicyState] = useState<{ active: boolean; policy: any } | null>(null);
  const [policyJson, setPolicyJson] = useState('');
  const [policyError, setPolicyError] = useState('');
  const [policyActivating, setPolicyActivating] = useState(false);

  // Users state
  const [users, setUsers] = useState<any[]>([]);
  const [userModal, setUserModal] = useState<{ type: 'create'; email: string; name: string; roles: string[] } | { type: 'roles'; user: any; roles: string[] } | null>(null);
  const [userBusy, setUserBusy] = useState(false);

  useEffect(() => {
    loadOrg();
    loadPolicy();
    loadUsers();
  }, []);

  const loadOrg = async () => {
    const data = await api.admin.getOrg();
    setOrg(data);
    setOrgForm({ name: data.name ?? '', website: data.website ?? '', industry: data.industry ?? '' });
  };

  const loadPolicy = async () => {
    const data = await api.admin.getActivePolicy();
    setPolicyState(data);
    if (data.policy?.config) {
      setPolicyJson(JSON.stringify(data.policy.config, null, 2));
    }
  };

  const loadUsers = async () => {
    const data = await api.admin.getUsers();
    setUsers(Array.isArray(data) ? data : []);
  };

  const saveOrg = async () => {
    setOrgSaving(true);
    await api.admin.updateOrg(orgForm);
    await loadOrg();
    setOrgSaving(false);
  };

  const activatePolicy = async () => {
    setPolicyError('');
    setPolicyActivating(true);
    try {
      const config = JSON.parse(policyJson);
      const result: any = await api.admin.activatePolicy(config);
      if (result.error) { setPolicyError(result.error); }
      else { await loadPolicy(); }
    } catch (err: any) {
      setPolicyError(err.message ?? 'Invalid JSON');
    } finally {
      setPolicyActivating(false);
    }
  };

  const submitUserModal = async () => {
    if (!userModal) return;
    setUserBusy(true);
    try {
      if (userModal.type === 'create') {
        await api.admin.createUser({ email: userModal.email, name: userModal.name, roles: userModal.roles });
      } else {
        await api.admin.updateRoles(userModal.user.id, userModal.roles);
      }
      setUserModal(null);
      await loadUsers();
    } finally {
      setUserBusy(false);
    }
  };

  const TABS: { key: Tab; label: string }[] = [
    { key: 'policy', label: 'Policy' },
    { key: 'org', label: 'Organization' },
    { key: 'users', label: 'Users & Roles' },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Admin Console</h2>
          <p className="text-sm text-gray-500 mt-0.5">Org setup, policy management, and access control</p>
        </div>
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">Admin only</span>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <div className="flex gap-0">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Policy Tab */}
      {tab === 'policy' && (
        <div className="space-y-6 max-w-3xl">
          {/* Status */}
          <div className={`rounded-xl p-4 border ${policyState?.active ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${policyState?.active ? 'bg-green-500' : 'bg-amber-500'}`} />
              <p className={`text-sm font-medium ${policyState?.active ? 'text-green-800' : 'text-amber-800'}`}>
                {policyState?.active
                  ? `Active: ${policyState.policy?.config?.verticalKey} v${policyState.policy?.config?.version}`
                  : 'No active policy — all CRM actions are blocked (POLICY_NOT_CONFIGURED)'}
              </p>
            </div>
            {policyState?.active && policyState.policy && (
              <div className="mt-3 grid grid-cols-3 gap-3 text-xs text-green-700">
                <div><span className="font-medium">Stages:</span> {policyState.policy.config?.stages?.length ?? 0}</div>
                <div><span className="font-medium">Approval rules:</span> {policyState.policy.config?.approvalRules?.length ?? 0}</div>
                <div><span className="font-medium">Transitions:</span> {policyState.policy.config?.transitions?.length ?? 0}</div>
              </div>
            )}
          </div>

          {/* Policy JSON editor */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">Policy Configuration (JSON)</label>
              <span className="text-xs text-gray-400">Paste a VerticalPolicy JSON and click Activate</span>
            </div>
            <textarea
              value={policyJson}
              onChange={e => setPolicyJson(e.target.value)}
              rows={20}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
              placeholder='{ "verticalPolicyId": "policy-saas-v1", "verticalKey": "saas", "version": "1.0", ... }'
            />
            {policyError && (
              <p className="mt-2 text-sm text-red-600">{policyError}</p>
            )}
            <button
              onClick={activatePolicy}
              disabled={policyActivating || !policyJson.trim()}
              className="mt-3 px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {policyActivating ? 'Activating…' : 'Validate & Activate Policy'}
            </button>
          </div>

          {/* Active policy summary */}
          {policyState?.active && policyState.policy?.config && (
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-3">Active Policy Summary</h4>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-medium text-gray-600">Stages: </span>
                  {policyState.policy.config.stages?.map((s: any) => (
                    <span key={s.stageKey} className="inline-flex items-center mr-1 px-2 py-0.5 rounded-full text-xs bg-indigo-100 text-indigo-700">{s.displayName}</span>
                  ))}
                </div>
                <div>
                  <span className="font-medium text-gray-600">Approval rules: </span>
                  {policyState.policy.config.approvalRules?.map((r: any, i: number) => (
                    <span key={i} className="inline-flex items-center mr-1 px-2 py-0.5 rounded text-xs bg-orange-100 text-orange-700">
                      &ge;{r.discountThresholdPercent}% &rarr; {r.requiredApproverRole}
                    </span>
                  ))}
                </div>
                <div>
                  <span className="font-medium text-gray-600">Compliance: </span>
                  <span className="text-gray-500">
                    Allowed channels: {policyState.policy.config.complianceRules?.allowedOutboundChannels?.join(', ')}
                    {' · '}Consent required: {policyState.policy.config.complianceRules?.consentRequiredChannels?.join(', ')}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Org Tab */}
      {tab === 'org' && (
        <div className="max-w-lg space-y-4">
          {(['name', 'website', 'industry'] as const).map(field => (
            <div key={field}>
              <label className="block text-xs font-medium text-gray-700 mb-1 capitalize">{field}</label>
              <input
                type="text"
                value={orgForm[field]}
                onChange={e => setOrgForm(f => ({ ...f, [field]: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder={field === 'name' ? 'Organization name' : field === 'website' ? 'https://...' : 'e.g. SaaS, FinTech'}
              />
            </div>
          ))}
          <button
            onClick={saveOrg}
            disabled={orgSaving}
            className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {orgSaving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      )}

      {/* Users Tab */}
      {tab === 'users' && (
        <div>
          <div className="flex justify-end mb-4">
            <button
              onClick={() => setUserModal({ type: 'create', email: '', name: '', roles: [] })}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Add User
            </button>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Email</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Roles</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-800">{u.name}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs font-mono">{u.email}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {u.roles?.map((r: string) => (
                          <span key={r} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-700">{r}</span>
                        ))}
                        {(!u.roles || u.roles.length === 0) && <span className="text-xs text-gray-400 italic">No roles</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setUserModal({ type: 'roles', user: u, roles: [...(u.roles ?? [])] })}
                        className="text-xs px-2 py-1 rounded-md text-indigo-600 hover:bg-indigo-50 transition-colors font-medium"
                      >
                        Edit Roles
                      </button>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-12 text-center text-gray-400 text-sm">No users yet</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create User Modal */}
      {userModal?.type === 'create' && (
        <Modal
          title="Add User"
          onClose={() => setUserModal(null)}
          onConfirm={submitUserModal}
          confirmLabel="Create User"
          disabled={userBusy || !userModal.email || !userModal.name}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
              <input type="text" autoFocus value={userModal.name} onChange={e => setUserModal({ ...userModal, name: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Full name" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={userModal.email} onChange={e => setUserModal({ ...userModal, email: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="user@company.com" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">Roles</label>
              <div className="grid grid-cols-2 gap-1.5">
                {ROLE_OPTIONS.map(r => (
                  <label key={r} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" checked={userModal.roles.includes(r)}
                      onChange={e => setUserModal({ ...userModal, roles: e.target.checked ? [...userModal.roles, r] : userModal.roles.filter(x => x !== r) })}
                      className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-600" />
                    <span className="text-sm text-gray-700">{r}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit Roles Modal */}
      {userModal?.type === 'roles' && (
        <Modal
          title={`Edit Roles — ${userModal.user.name}`}
          onClose={() => setUserModal(null)}
          onConfirm={submitUserModal}
          confirmLabel="Save Roles"
          disabled={userBusy}
        >
          <p className="text-sm text-gray-500 mb-3">{userModal.user.email}</p>
          <div className="grid grid-cols-2 gap-1.5">
            {ROLE_OPTIONS.map(r => (
              <label key={r} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" checked={userModal.roles.includes(r)}
                  onChange={e => setUserModal({ ...userModal, roles: e.target.checked ? [...userModal.roles, r] : userModal.roles.filter(x => x !== r) })}
                  className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-600" />
                <span className="text-sm text-gray-700">{r}</span>
              </label>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
