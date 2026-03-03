import { useEffect, useState } from 'react';
import { api } from '../api/client.ts';
import ValidationResult from '../components/ValidationResult.tsx';

const STATUS_COLORS: Record<string, string> = {
  New: 'bg-gray-100 text-gray-700',
  Working: 'bg-blue-100 text-blue-700',
  Qualified: 'bg-green-100 text-green-700',
  Disqualified: 'bg-red-100 text-red-700',
  Converted: 'bg-purple-100 text-purple-700',
};

export default function Leads() {
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<{ id: string; error: any } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const data = await api.leads.list();
    setLeads(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const doAction = async (id: string, fn: () => Promise<any>) => {
    setBusy(id);
    setActionError(null);
    try {
      const res = await fn();
      if (res.success === false) {
        setActionError({ id, error: res });
      } else {
        await load();
      }
    } finally {
      setBusy(null);
    }
  };

  const handleAssign = (lead: any) => {
    const toUserId = window.prompt('Assign to user ID:', 'user-ae-1');
    if (!toUserId) return;
    doAction(lead.id, () => api.leads.assign(lead.id, { toUserId }));
  };

  const handleQualify = (lead: any) => {
    const keysInput = window.prompt('Completed BANT keys (comma-separated):', 'budget,authority,need,timeline');
    if (!keysInput) return;
    const completedKeys = keysInput.split(',').map(k => k.trim());
    doAction(lead.id, () => api.leads.qualify(lead.id, {
      qualificationChecklist: { framework: 'BANT', completedKeys },
    }));
  };

  const handleDisqualify = (lead: any) => {
    const reason = window.prompt('Disqualification reason:');
    if (!reason) return;
    doAction(lead.id, () => api.leads.disqualify(lead.id, { reason }));
  };

  if (loading) return <div className="text-gray-500">Loading...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Leads</h2>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Source</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Assigned To</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {leads.map(lead => (
              <>
                <tr key={lead.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">
                    <span className="text-gray-800">{lead.source}</span>
                    <span className="ml-2 text-gray-400">{lead.id.slice(0, 8)}…</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[lead.status] ?? 'bg-gray-100 text-gray-700'}`}>
                      {lead.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{lead.assignedToUserId ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAssign(lead)}
                        disabled={busy === lead.id}
                        className="text-xs text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
                      >
                        Assign
                      </button>
                      {lead.status !== 'Qualified' && lead.status !== 'Converted' && (
                        <button
                          onClick={() => handleQualify(lead)}
                          disabled={busy === lead.id}
                          className="text-xs text-green-600 hover:text-green-800 disabled:opacity-50"
                        >
                          Qualify
                        </button>
                      )}
                      {lead.status !== 'Disqualified' && lead.status !== 'Converted' && (
                        <button
                          onClick={() => handleDisqualify(lead)}
                          disabled={busy === lead.id}
                          className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
                        >
                          Disqualify
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                {actionError?.id === lead.id && (
                  <tr key={`${lead.id}-error`}>
                    <td colSpan={4} className="px-4 py-2">
                      <ValidationResult
                        blockedReasons={actionError.error.blockedReasons}
                        missingFields={actionError.error.missingFields}
                        requiredApprovals={actionError.error.requiredApprovals}
                      />
                    </td>
                  </tr>
                )}
              </>
            ))}
            {leads.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-400">No leads found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
