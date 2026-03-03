import { useEffect, useState } from 'react';
import { api } from '../api/client.ts';
import ValidationResult from '../components/ValidationResult.tsx';

const STAGES = ['Prospect', 'Qualified', 'Proposal', 'Negotiation', 'ClosedWon', 'ClosedLost'];

const STAGE_TRANSITIONS: Record<string, string> = {
  'Prospect': 'Qualified',
  'Qualified': 'Proposal',
  'Proposal': 'Negotiation',
  'Negotiation': 'ClosedWon',
};

const REQUIRED_FIELDS: Record<string, string[]> = {
  'Prospect->Qualified': ['budget', 'timeline'],
  'Qualified->Proposal': ['proposalSentDate'],
};

export default function Pipeline() {
  const [opps, setOpps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpp, setDialogOpp] = useState<any>(null);
  const [formFields, setFormFields] = useState<Record<string, string>>({});
  const [validationError, setValidationError] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    const data = await api.opportunities.list();
    setOpps(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openTransition = (opp: any) => {
    const nextStage = STAGE_TRANSITIONS[opp.stageKey];
    if (!nextStage) return;
    setDialogOpp({ ...opp, toStageKey: nextStage });
    const key = `${opp.stageKey}->${nextStage}`;
    const fields = REQUIRED_FIELDS[key] ?? [];
    const initial: Record<string, string> = {};
    fields.forEach(f => { initial[f] = ''; });
    setFormFields(initial);
    setValidationError(null);
  };

  const submitTransition = async () => {
    if (!dialogOpp) return;
    setSubmitting(true);
    setValidationError(null);
    try {
      const res = await api.opportunities.transition(dialogOpp.id, {
        toStageKey: dialogOpp.toStageKey,
        providedFields: formFields,
      });
      if (res.success === false) {
        setValidationError(res);
      } else {
        setDialogOpp(null);
        await load();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const byStage = (stage: string) => opps.filter(o => o.stageKey === stage);

  if (loading) return <div className="text-gray-500">Loading...</div>;

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Pipeline</h2>

      {/* Kanban board */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {STAGES.map(stage => (
          <div key={stage} className="flex-shrink-0 w-64">
            <div className="bg-gray-200 rounded-t-md px-3 py-2">
              <h3 className="text-sm font-semibold text-gray-700">{stage}</h3>
              <span className="text-xs text-gray-500">{byStage(stage).length} deals</span>
            </div>
            <div className="bg-gray-50 rounded-b-md min-h-32 p-2 space-y-2">
              {byStage(stage).map(opp => (
                <div key={opp.id} className="bg-white rounded-md border border-gray-200 p-3 shadow-sm">
                  <p className="text-sm font-medium text-gray-900 mb-1">{opp.name}</p>
                  <p className="text-xs text-gray-500">${opp.amount?.toLocaleString()}</p>
                  <p className="text-xs text-gray-400">
                    Close: {opp.expectedCloseDate ? new Date(opp.expectedCloseDate).toLocaleDateString() : '—'}
                  </p>
                  {STAGE_TRANSITIONS[opp.stageKey] && (
                    <button
                      onClick={() => openTransition(opp)}
                      className="mt-2 text-xs bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-2 py-1 rounded transition-colors"
                    >
                      Advance → {STAGE_TRANSITIONS[opp.stageKey]}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Transition Dialog */}
      {dialogOpp && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Advance Stage</h3>
            <p className="text-sm text-gray-500 mb-4">
              {dialogOpp.name}: {dialogOpp.stageKey} → {dialogOpp.toStageKey}
            </p>

            {validationError && (
              <div className="mb-4">
                <ValidationResult
                  blockedReasons={validationError.blockedReasons}
                  missingFields={validationError.missingFields}
                  requiredApprovals={validationError.requiredApprovals}
                />
              </div>
            )}

            {Object.keys(formFields).length > 0 && (
              <div className="space-y-3 mb-4">
                {Object.keys(formFields).map(field => (
                  <div key={field}>
                    <label className="block text-xs font-medium text-gray-700 mb-1">{field}</label>
                    <input
                      type="text"
                      value={formFields[field] ?? ''}
                      onChange={e => setFormFields(prev => ({ ...prev, [field]: e.target.value }))}
                      className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder={`Enter ${field}`}
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDialogOpp(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                onClick={submitTransition}
                disabled={submitting}
                className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
              >
                {submitting ? 'Advancing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
