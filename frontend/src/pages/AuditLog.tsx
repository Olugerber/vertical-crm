import { useEffect, useState } from 'react';
import { api } from '../api/client.ts';

export default function AuditLog() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.audit.list().then(data => {
      setEvents(Array.isArray(data) ? data : []);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="text-gray-500">Loading...</div>;

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Audit Log</h2>

      {events.length === 0 ? (
        <p className="text-gray-400">No audit events yet.</p>
      ) : (
        <div className="space-y-3">
          {events.map((evt, i) => (
            <div key={evt.id ?? i} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{evt.what}</p>
                  <div className="flex items-center gap-4 mt-1">
                    <span className="text-xs text-gray-500">
                      <span className="font-medium">By:</span> {evt.who}
                    </span>
                    {evt.beforeStageKey && evt.afterStageKey && (
                      <span className="text-xs text-indigo-600 font-medium">
                        {evt.beforeStageKey} → {evt.afterStageKey}
                      </span>
                    )}
                    {!evt.beforeStageKey && evt.afterStageKey && (
                      <span className="text-xs text-green-600 font-medium">
                        → {evt.afterStageKey}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    Policy v{evt.policyVersion}
                  </p>
                </div>
                <span className="text-xs text-gray-400 ml-4 whitespace-nowrap">
                  {new Date(evt.when).toLocaleString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
