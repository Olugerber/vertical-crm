import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client.ts';
import ValidationResult from '../components/ValidationResult.tsx';

const APPROVAL_STATUS_COLORS: Record<string, string> = {
  NotRequired: 'bg-gray-100 text-gray-600',
  Pending: 'bg-yellow-100 text-yellow-700',
  Approved: 'bg-green-100 text-green-700',
  Rejected: 'bg-red-100 text-red-700',
};

export default function QuotePage() {
  const { id: opportunityId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [opp, setOpp] = useState<any>(null);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<any>(null);
  const [discountInput, setDiscountInput] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);

  const userRoles = (localStorage.getItem('x-user-roles') ?? 'SalesManager').split(',');
  const canApprove = userRoles.some(r => ['SalesDirector', 'Admin', 'SalesManager'].includes(r.trim()));

  const load = async () => {
    setLoading(true);
    const [oppData, quotesData] = await Promise.all([
      api.opportunities.get(opportunityId!),
      api.quotesByOpp(opportunityId!),
    ]);
    setOpp(oppData);
    setQuotes(Array.isArray(quotesData) ? quotesData : []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [opportunityId]);

  const currentQuote = quotes[0] ?? null;

  const doAction = async (fn: () => Promise<any>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fn();
      if (res?.success === false) {
        setError(res);
      } else {
        await load();
      }
    } finally {
      setBusy(false);
    }
  };

  const createQuote = () => doAction(() => api.quotes.create({ opportunityId }));
  const updateDiscount = () => {
    const d = parseFloat(discountInput);
    if (isNaN(d)) return;
    doAction(() => api.updateQuote(currentQuote.id, { discountPercent: d }));
  };
  const submitQuote = () => doAction(() => api.quotes.submit(currentQuote.id));
  const approveQuote = () => doAction(() => api.quotes.approve(currentQuote.id));
  const rejectQuote = () => doAction(() => api.quotes.reject(currentQuote.id, { reason: rejectReason }));

  if (loading) return (
    <div className="flex items-center gap-2 text-gray-400 py-16 justify-center">
      <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
      </svg>
      Loading…
    </div>
  );

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-2 mb-6">
        <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-gray-600 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Quote</h2>
          {opp && <p className="text-sm text-gray-500">{opp.name} · {opp.stageKey}</p>}
        </div>
      </div>

      {/* Opportunity summary */}
      {opp && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 shadow-sm">
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div><p className="text-xs text-gray-500 mb-0.5">Amount</p><p className="font-semibold text-gray-800">${opp.amount?.toLocaleString()}</p></div>
            <div><p className="text-xs text-gray-500 mb-0.5">Close Date</p><p className="font-medium text-gray-700">{opp.expectedCloseDate ? new Date(opp.expectedCloseDate).toLocaleDateString() : '—'}</p></div>
            <div><p className="text-xs text-gray-500 mb-0.5">Stage</p><p className="font-medium text-gray-700">{opp.stageKey}</p></div>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4">
          <ValidationResult
            blockedReasons={error.blockedReasons}
            missingFields={error.missingFields}
            requiredApprovals={error.requiredApprovals}
          />
        </div>
      )}

      {!currentQuote ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center shadow-sm">
          <p className="text-gray-500 mb-4">No quote exists for this opportunity.</p>
          <button
            onClick={createQuote}
            disabled={busy}
            className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {busy ? 'Creating…' : 'Create Quote'}
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-base font-semibold text-gray-900">Quote</h3>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${APPROVAL_STATUS_COLORS[currentQuote.approvalStatus] ?? 'bg-gray-100 text-gray-600'}`}>
              {currentQuote.approvalStatus}
            </span>
          </div>

          <div className="px-6 py-4 space-y-4">
            {/* Discount row */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Discount %</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0" max="100" step="1"
                  defaultValue={currentQuote.discountPercent}
                  onChange={e => setDiscountInput(e.target.value)}
                  disabled={currentQuote.approvalStatus === 'Approved' || currentQuote.approvalStatus === 'Rejected'}
                  className="w-32 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50"
                />
                {currentQuote.approvalStatus !== 'Approved' && currentQuote.approvalStatus !== 'Rejected' && (
                  <button
                    onClick={updateDiscount}
                    disabled={busy || !discountInput}
                    className="px-3 py-1.5 text-sm font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
                  >
                    Update
                  </button>
                )}
              </div>
              {currentQuote.discountPercent >= 20 && currentQuote.approvalStatus === 'NotRequired' && (
                <p className="text-xs text-amber-600 mt-1">Warning: Discount &ge; 20% — requires SalesDirector approval after submission</p>
              )}
            </div>

            {/* Margin */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Margin</p>
                <p className="font-medium text-gray-700">{currentQuote.marginPercent != null ? `${currentQuote.marginPercent}%` : '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Quote ID</p>
                <p className="text-xs font-mono text-gray-400">{currentQuote.id.slice(0, 12)}…</p>
              </div>
            </div>

            {/* Rejection reason */}
            {currentQuote.approvalStatus === 'Rejected' && currentQuote.rejectionReason && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-xs font-medium text-red-700 mb-1">Rejection Reason</p>
                <p className="text-sm text-red-600">{currentQuote.rejectionReason}</p>
              </div>
            )}
          </div>

          {/* Actions footer */}
          <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex flex-wrap gap-2">
            {currentQuote.approvalStatus === 'NotRequired' && (
              <button
                onClick={submitQuote}
                disabled={busy}
                className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {busy ? 'Submitting…' : 'Submit for Approval'}
              </button>
            )}

            {currentQuote.approvalStatus === 'Pending' && canApprove && (
              <>
                <button
                  onClick={approveQuote}
                  disabled={busy}
                  className="px-4 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {busy ? '…' : 'Approve'}
                </button>
                {!showRejectInput ? (
                  <button
                    onClick={() => setShowRejectInput(true)}
                    className="px-4 py-2 text-sm font-medium bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
                  >
                    Reject
                  </button>
                ) : (
                  <div className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={rejectReason}
                      onChange={e => setRejectReason(e.target.value)}
                      placeholder="Rejection reason…"
                      className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                    <button
                      onClick={rejectQuote}
                      disabled={busy || !rejectReason.trim()}
                      className="px-3 py-1.5 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                    >
                      Confirm Reject
                    </button>
                  </div>
                )}
              </>
            )}

            {(currentQuote.approvalStatus === 'Approved' || currentQuote.approvalStatus === 'Rejected') && (
              <p className="text-sm text-gray-500 py-1">
                Quote is {currentQuote.approvalStatus.toLowerCase()}. {currentQuote.approvalStatus === 'Rejected' ? 'Update discount and resubmit.' : ''}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
