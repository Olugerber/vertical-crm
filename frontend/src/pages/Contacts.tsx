import { useEffect, useState } from 'react';
import { api } from '../api/client.ts';
import ValidationResult from '../components/ValidationResult.tsx';

const CONSENT_COLORS: Record<string, string> = {
  OptIn: 'bg-green-100 text-green-700',
  SoftOptIn: 'bg-yellow-100 text-yellow-700',
  OptOut: 'bg-red-100 text-red-700',
  Unknown: 'bg-gray-100 text-gray-700',
};

export default function Contacts() {
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<{ id: string; error: any } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const data = await api.contacts.list();
    setContacts(Array.isArray(data) ? data : []);
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

  const handleConsent = (contact: any) => {
    const newStatus = window.prompt('New consent status (OptIn/SoftOptIn/OptOut/Unknown):', 'OptIn');
    if (!newStatus) return;
    const method = window.prompt('Consent method:', 'Web Form') ?? 'Web Form';
    const source = window.prompt('Consent source:', 'Website') ?? 'Website';
    doAction(contact.id, () => api.contacts.updateConsent(contact.id, { newStatus, method, source }));
  };

  const handleDnc = (contact: any) => {
    if (!window.confirm(`Flag contact ${contact.email ?? contact.id} as Do-Not-Contact?`)) return;
    const reason = window.prompt('Reason (optional):') ?? undefined;
    doAction(contact.id, () => api.contacts.flagDnc(contact.id, { reason }));
  };

  const handleOutbound = (contact: any) => {
    const channel = window.prompt('Channel (Email/Phone/SMS/InPerson):', 'Email');
    if (!channel) return;
    doAction(contact.id, () => api.contacts.outbound(contact.id, { channel }));
  };

  if (loading) return <div className="text-gray-500">Loading...</div>;

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Contacts</h2>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Contact</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Consent</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">DNC</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {contacts.map(contact => (
              <>
                <tr key={contact.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="text-gray-800">{contact.email ?? contact.phone ?? contact.id.slice(0, 8)}</p>
                    <p className="text-xs text-gray-400">{contact.phone ?? ''}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${CONSENT_COLORS[contact.consentStatus] ?? 'bg-gray-100 text-gray-700'}`}>
                      {contact.consentStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {contact.doNotContact
                      ? <span className="text-xs font-semibold text-red-600">DNC</span>
                      : <span className="text-xs text-gray-400">—</span>
                    }
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleConsent(contact)}
                        disabled={busy === contact.id}
                        className="text-xs text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
                      >
                        Consent
                      </button>
                      {!contact.doNotContact && (
                        <button
                          onClick={() => handleDnc(contact)}
                          disabled={busy === contact.id}
                          className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
                        >
                          Flag DNC
                        </button>
                      )}
                      <button
                        onClick={() => handleOutbound(contact)}
                        disabled={busy === contact.id}
                        className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50"
                      >
                        Outbound
                      </button>
                    </div>
                  </td>
                </tr>
                {actionError?.id === contact.id && (
                  <tr key={`${contact.id}-error`}>
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
            {contacts.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-400">No contacts found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
