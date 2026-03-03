import { useEffect, useState } from 'react';
import { api } from '../api/client.ts';
import ValidationResult from '../components/ValidationResult.tsx';
import Modal from '../components/Modal.tsx';

const STATUS_COLORS: Record<string, string> = {
  New: 'bg-gray-100 text-gray-700',
  Working: 'bg-blue-100 text-blue-700',
  Qualified: 'bg-green-100 text-green-700',
  Disqualified: 'bg-red-100 text-red-700',
  Converted: 'bg-purple-100 text-purple-700',
};

const BANT_KEYS = ['budget', 'authority', 'need', 'timeline'];
const SOURCES = ['Inbound', 'Outbound', 'Partner', 'Event', 'Referral'];

type ModalState =
  | { type: 'create'; source: string }
  | { type: 'assign'; lead: any; userId: string }
  | { type: 'qualify'; lead: any; completedKeys: string[] }
  | { type: 'disqualify'; lead: any; reason: string }
  | null;

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export default function Leads() {
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<{ id: string; error: any } | null>(null);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);

  const load = async () => {
    setLoading(true);
    const data = await api.leads.list();
    setLeads(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const submitModal = async () => {
    if (!modal) return;
    setBusy(true);
    setActionError(null);
    try {
      let res: any;
      if (modal.type === 'create') {
        res = await api.leads.create({ source: modal.source });
      } else if (modal.type === 'assign') {
        res = await api.leads.assign(modal.lead.id, { toUserId: modal.userId });
      } else if (modal.type === 'qualify') {
        res = await api.leads.qualify(modal.lead.id, {
          qualificationChecklist: { framework: 'BANT', completedKeys: modal.completedKeys },
        });
      } else if (modal.type === 'disqualify') {
        res = await api.leads.disqualify(modal.lead.id, { reason: modal.reason });
      }
      if (res?.success === false) {
        setActionError({ id: modal.type === 'create' ? '_create' : modal.lead.id, error: res });
        setModal(null);
      } else {
        setModal(null);
        await load();
      }
    } finally {
      setBusy(false);
    }
  };

  if (loading) return (
    <div className="flex items-center gap-2 text-gray-400 py-16 justify-center">
      <Spinner />
      <span className="text-sm">Loading leads…</span>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Leads</h2>
        <button
          onClick={() => setModal({ type: 'create', source: 'Inbound' })}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add Lead
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Source</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Assigned To</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {leads.map(lead => (
              <>
                <tr key={lead.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <span className="font-medium text-gray-800">{lead.source}</span>
                    <span className="ml-2 text-xs text-gray-400 font-mono">{lead.id.slice(0, 8)}…</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[lead.status] ?? 'bg-gray-100 text-gray-700'}`}>
                      {lead.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {lead.assignedToUserId ?? <span className="text-gray-300 italic">Unassigned</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => setModal({ type: 'assign', lead, userId: lead.assignedToUserId ?? '' })}
                        className="text-xs px-2 py-1 rounded-md text-indigo-600 hover:bg-indigo-50 transition-colors font-medium"
                      >
                        Assign
                      </button>
                      {lead.status !== 'Qualified' && lead.status !== 'Converted' && (
                        <button
                          onClick={() => setModal({ type: 'qualify', lead, completedKeys: [...BANT_KEYS] })}
                          className="text-xs px-2 py-1 rounded-md text-green-600 hover:bg-green-50 transition-colors font-medium"
                        >
                          Qualify
                        </button>
                      )}
                      {lead.status !== 'Disqualified' && lead.status !== 'Converted' && (
                        <button
                          onClick={() => setModal({ type: 'disqualify', lead, reason: '' })}
                          className="text-xs px-2 py-1 rounded-md text-red-600 hover:bg-red-50 transition-colors font-medium"
                        >
                          Disqualify
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                {actionError?.id === lead.id && (
                  <tr key={`${lead.id}-error`}>
                    <td colSpan={4} className="px-4 py-2 bg-red-50/40">
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
                <td colSpan={4} className="px-4 py-16 text-center">
                  <p className="text-gray-400 text-sm">No leads yet</p>
                  <p className="text-gray-300 text-xs mt-1">Leads will appear here once created</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modal?.type === 'create' && (
        <Modal
          title="Add Lead"
          onClose={() => setModal(null)}
          onConfirm={submitModal}
          confirmLabel="Create Lead"
          disabled={busy}
        >
          <p className="text-sm text-gray-500 mb-4">Select the lead source to create a new lead.</p>
          <p className="text-xs font-medium text-gray-700 mb-2">Source</p>
          <div className="grid grid-cols-2 gap-2">
            {SOURCES.map(s => (
              <button
                key={s}
                onClick={() => setModal({ ...modal, source: s })}
                className={`px-3 py-2.5 text-sm rounded-lg border-2 font-medium transition-colors ${
                  modal.source === s
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </Modal>
      )}

      {modal?.type === 'assign' && (
        <Modal
          title="Assign Lead"
          onClose={() => setModal(null)}
          onConfirm={submitModal}
          confirmLabel="Assign"
          disabled={busy || !modal.userId.trim()}
        >
          <p className="text-sm text-gray-500 mb-4">
            Assign <span className="font-medium text-gray-700">{modal.lead.source}</span> lead to a team member.
          </p>
          <label className="block text-xs font-medium text-gray-700 mb-1">User ID</label>
          <input
            type="text"
            autoFocus
            value={modal.userId}
            onChange={e => setModal({ ...modal, userId: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="e.g. user-ae-1"
          />
        </Modal>
      )}

      {modal?.type === 'qualify' && (
        <Modal
          title="Qualify Lead"
          onClose={() => setModal(null)}
          onConfirm={submitModal}
          confirmLabel="Mark Qualified"
          disabled={busy}
        >
          <p className="text-sm text-gray-500 mb-4">Select the completed BANT criteria for this lead.</p>
          <div className="space-y-1">
            {BANT_KEYS.map(key => (
              <label key={key} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={modal.completedKeys.includes(key)}
                  onChange={e => {
                    const next = e.target.checked
                      ? [...modal.completedKeys, key]
                      : modal.completedKeys.filter(k => k !== key);
                    setModal({ ...modal, completedKeys: next });
                  }}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm font-medium text-gray-700 capitalize">{key}</span>
              </label>
            ))}
          </div>
        </Modal>
      )}

      {modal?.type === 'disqualify' && (
        <Modal
          title="Disqualify Lead"
          onClose={() => setModal(null)}
          onConfirm={submitModal}
          confirmLabel="Disqualify"
          confirmVariant="danger"
          disabled={busy || !modal.reason.trim()}
        >
          <p className="text-sm text-gray-500 mb-4">Provide a reason for disqualifying this lead.</p>
          <label className="block text-xs font-medium text-gray-700 mb-1">Reason</label>
          <textarea
            autoFocus
            value={modal.reason}
            onChange={e => setModal({ ...modal, reason: e.target.value })}
            rows={3}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
            placeholder="e.g. Budget insufficient, no decision-maker access…"
          />
        </Modal>
      )}
    </div>
  );
}
