import { useEffect, useState } from 'react';
import { api } from '../api/client.ts';
import ValidationResult from '../components/ValidationResult.tsx';
import Modal from '../components/Modal.tsx';

const CONSENT_COLORS: Record<string, string> = {
  OptIn: 'bg-green-100 text-green-700',
  SoftOptIn: 'bg-yellow-100 text-yellow-700',
  OptOut: 'bg-red-100 text-red-700',
  Unknown: 'bg-gray-100 text-gray-700',
};

const CONSENT_STATUSES = ['OptIn', 'SoftOptIn', 'OptOut', 'Unknown'];
const CHANNELS = ['Email', 'Phone', 'SMS', 'InPerson'];

type ModalState =
  | { type: 'consent'; contact: any; newStatus: string; method: string; source: string }
  | { type: 'dnc'; contact: any; reason: string }
  | { type: 'outbound'; contact: any; channel: string }
  | null;

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export default function Contacts() {
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<{ id: string; error: any } | null>(null);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);

  const load = async () => {
    setLoading(true);
    const data = await api.contacts.list();
    setContacts(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const submitModal = async () => {
    if (!modal) return;
    setBusy(true);
    setActionError(null);
    try {
      let res: any;
      if (modal.type === 'consent') {
        res = await api.contacts.updateConsent(modal.contact.id, {
          newStatus: modal.newStatus,
          method: modal.method,
          source: modal.source,
        });
      } else if (modal.type === 'dnc') {
        res = await api.contacts.flagDnc(modal.contact.id, { reason: modal.reason || undefined });
      } else if (modal.type === 'outbound') {
        res = await api.contacts.outbound(modal.contact.id, { channel: modal.channel });
      }
      if (res?.success === false) {
        setActionError({ id: modal.contact.id, error: res });
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
      <span className="text-sm">Loading contacts…</span>
    </div>
  );

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Contacts</h2>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Contact</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Consent</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">DNC</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {contacts.map(contact => (
              <>
                <tr key={contact.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800">{contact.email ?? contact.phone ?? contact.id.slice(0, 8)}</p>
                    {contact.email && contact.phone && (
                      <p className="text-xs text-gray-400 mt-0.5">{contact.phone}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${CONSENT_COLORS[contact.consentStatus] ?? 'bg-gray-100 text-gray-700'}`}>
                      {contact.consentStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {contact.doNotContact
                      ? <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-700">DNC</span>
                      : <span className="text-xs text-gray-300">—</span>
                    }
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => setModal({ type: 'consent', contact, newStatus: contact.consentStatus, method: 'Web Form', source: 'Website' })}
                        className="text-xs px-2 py-1 rounded-md text-indigo-600 hover:bg-indigo-50 transition-colors font-medium"
                      >
                        Consent
                      </button>
                      {!contact.doNotContact && (
                        <button
                          onClick={() => setModal({ type: 'dnc', contact, reason: '' })}
                          className="text-xs px-2 py-1 rounded-md text-red-600 hover:bg-red-50 transition-colors font-medium"
                        >
                          Flag DNC
                        </button>
                      )}
                      <button
                        onClick={() => setModal({ type: 'outbound', contact, channel: 'Email' })}
                        className="text-xs px-2 py-1 rounded-md text-blue-600 hover:bg-blue-50 transition-colors font-medium"
                      >
                        Outbound
                      </button>
                    </div>
                  </td>
                </tr>
                {actionError?.id === contact.id && (
                  <tr key={`${contact.id}-error`}>
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
            {contacts.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-16 text-center">
                  <p className="text-gray-400 text-sm">No contacts yet</p>
                  <p className="text-gray-300 text-xs mt-1">Contacts will appear here once created</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modal?.type === 'consent' && (
        <Modal
          title="Update Consent"
          onClose={() => setModal(null)}
          onConfirm={submitModal}
          confirmLabel="Save"
          disabled={busy}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Consent Status</label>
              <select
                value={modal.newStatus}
                onChange={e => setModal({ ...modal, newStatus: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                {CONSENT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Method</label>
              <input
                type="text"
                value={modal.method}
                onChange={e => setModal({ ...modal, method: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="e.g. Web Form, Phone, Email"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Source</label>
              <input
                type="text"
                value={modal.source}
                onChange={e => setModal({ ...modal, source: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="e.g. Website, Landing Page, Sales Call"
              />
            </div>
          </div>
        </Modal>
      )}

      {modal?.type === 'dnc' && (
        <Modal
          title="Flag as Do Not Contact"
          onClose={() => setModal(null)}
          onConfirm={submitModal}
          confirmLabel="Flag DNC"
          confirmVariant="danger"
          disabled={busy}
        >
          <p className="text-sm text-gray-600 mb-4">
            Mark <span className="font-semibold text-gray-800">{modal.contact.email ?? modal.contact.id}</span> as Do Not Contact. This restricts all outbound communications.
          </p>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Reason <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <textarea
            autoFocus
            value={modal.reason}
            onChange={e => setModal({ ...modal, reason: e.target.value })}
            rows={2}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
            placeholder="e.g. Customer requested removal, legal hold…"
          />
        </Modal>
      )}

      {modal?.type === 'outbound' && (
        <Modal
          title="Log Outbound Contact"
          onClose={() => setModal(null)}
          onConfirm={submitModal}
          confirmLabel="Log Outbound"
          disabled={busy}
        >
          <p className="text-sm text-gray-500 mb-4">
            Log an outbound communication with <span className="font-medium text-gray-700">{modal.contact.email ?? modal.contact.id}</span>.
          </p>
          <p className="text-xs font-medium text-gray-700 mb-2">Channel</p>
          <div className="grid grid-cols-2 gap-2">
            {CHANNELS.map(ch => (
              <button
                key={ch}
                onClick={() => setModal({ ...modal, channel: ch })}
                className={`px-3 py-2.5 text-sm rounded-lg border-2 font-medium transition-colors ${
                  modal.channel === ch
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                {ch}
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
