interface BlockedReason {
  code: string;
  message: string;
}

interface RequiredApproval {
  type: string;
  ownerRole: string;
}

interface ValidationResultProps {
  blockedReasons?: BlockedReason[];
  missingFields?: string[];
  requiredApprovals?: RequiredApproval[];
}

export default function ValidationResult({ blockedReasons = [], missingFields = [], requiredApprovals = [] }: ValidationResultProps) {
  if (!blockedReasons.length && !missingFields.length && !requiredApprovals.length) return null;

  return (
    <div className="rounded-md bg-red-50 border border-red-200 p-4 space-y-3">
      {blockedReasons.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-red-800 mb-1">Blocked</h4>
          <ul className="space-y-1">
            {blockedReasons.map((r) => (
              <li key={r.code} className="text-sm text-red-700">
                <span className="font-mono text-xs bg-red-100 px-1 rounded mr-2">{r.code}</span>
                {r.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {missingFields.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-red-800 mb-1">Missing Fields</h4>
          <div className="flex flex-wrap gap-1">
            {missingFields.map((f) => (
              <span key={f} className="text-xs bg-orange-100 text-orange-800 px-2 py-0.5 rounded-full font-mono">{f}</span>
            ))}
          </div>
        </div>
      )}
      {requiredApprovals.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-red-800 mb-1">Required Approvals</h4>
          <div className="flex flex-wrap gap-1">
            {requiredApprovals.map((a, i) => (
              <span key={i} className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full">
                {a.type} → {a.ownerRole}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
