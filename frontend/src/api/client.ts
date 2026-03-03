const BASE_URL = import.meta.env['VITE_API_URL']
  ? `${import.meta.env['VITE_API_URL']}/api`
  : '/api';

function getAuth() {
  const orgId = localStorage.getItem('x-org-id') ?? 'org-acme-sales';
  const userId = localStorage.getItem('x-user-id') ?? 'user-sm';
  const roles = localStorage.getItem('x-user-roles') ?? 'SalesManager';
  return { orgId, userId, roles };
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { orgId, userId, roles } = getAuth();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Org-Id': orgId,
      'X-User-Id': userId,
      'X-User-Roles': roles,
      ...(options.headers ?? {}),
    },
  });
  const data = await res.json();
  return data as T;
}

export const api = {
  leads: {
    list: () => request<any[]>('/leads'),
    get: (id: string) => request<any>(`/leads/${id}`),
    create: (body: any) => request<any>('/leads', { method: 'POST', body: JSON.stringify(body) }),
    assign: (id: string, body: any) => request<any>(`/leads/${id}/assign`, { method: 'POST', body: JSON.stringify(body) }),
    qualify: (id: string, body: any) => request<any>(`/leads/${id}/qualify`, { method: 'POST', body: JSON.stringify(body) }),
    disqualify: (id: string, body: any) => request<any>(`/leads/${id}/disqualify`, { method: 'POST', body: JSON.stringify(body) }),
    convert: (id: string, body: any) => request<any>(`/leads/${id}/convert`, { method: 'POST', body: JSON.stringify(body) }),
  },
  opportunities: {
    list: () => request<any[]>('/opportunities'),
    get: (id: string) => request<any>(`/opportunities/${id}`),
    create: (body: any) => request<any>('/opportunities', { method: 'POST', body: JSON.stringify(body) }),
    transition: (id: string, body: any) => request<any>(`/opportunities/${id}/transition`, { method: 'POST', body: JSON.stringify(body) }),
    closeWon: (id: string, body: any) => request<any>(`/opportunities/${id}/close-won`, { method: 'POST', body: JSON.stringify(body) }),
    closeLost: (id: string, body: any) => request<any>(`/opportunities/${id}/close-lost`, { method: 'POST', body: JSON.stringify(body) }),
  },
  contacts: {
    list: () => request<any[]>('/contacts'),
    get: (id: string) => request<any>(`/contacts/${id}`),
    create: (body: any) => request<any>('/contacts', { method: 'POST', body: JSON.stringify(body) }),
    updateConsent: (id: string, body: any) => request<any>(`/contacts/${id}/consent`, { method: 'POST', body: JSON.stringify(body) }),
    flagDnc: (id: string, body: any) => request<any>(`/contacts/${id}/dnc`, { method: 'POST', body: JSON.stringify(body) }),
    outbound: (id: string, body: any) => request<any>(`/contacts/${id}/outbound`, { method: 'POST', body: JSON.stringify(body) }),
  },
  quotes: {
    list: () => request<any[]>('/quotes'),
    get: (id: string) => request<any>(`/quotes/${id}`),
    create: (body: any) => request<any>('/quotes', { method: 'POST', body: JSON.stringify(body) }),
    submit: (id: string) => request<any>(`/quotes/${id}/submit`, { method: 'POST', body: JSON.stringify({}) }),
    approve: (id: string) => request<any>(`/quotes/${id}/approve`, { method: 'POST', body: JSON.stringify({}) }),
    reject: (id: string, body: any) => request<any>(`/quotes/${id}/reject`, { method: 'POST', body: JSON.stringify(body) }),
  },
  handoffs: {
    list: () => request<any[]>('/handoffs'),
    get: (id: string) => request<any>(`/handoffs/${id}`),
    create: (body: any) => request<any>('/handoffs', { method: 'POST', body: JSON.stringify(body) }),
    accept: (id: string) => request<any>(`/handoffs/${id}/accept`, { method: 'POST', body: JSON.stringify({}) }),
    reject: (id: string, body: any) => request<any>(`/handoffs/${id}/reject`, { method: 'POST', body: JSON.stringify(body) }),
  },
  policies: {
    list: () => request<any>('/policies'),
    select: (policyId: string) => request<any>('/policies/select', { method: 'POST', body: JSON.stringify({ policyId }) }),
  },
  audit: {
    list: () => request<any[]>('/audit'),
  },
  // Admin API
  admin: {
    getOrg: () => request<any>('/admin/org'),
    updateOrg: (body: any) => request<any>('/admin/org', { method: 'PUT', body: JSON.stringify(body) }),
    getActivePolicy: () => request<any>('/admin/policy/active'),
    activatePolicy: (config: any) => request<any>('/admin/policy/activate', { method: 'POST', body: JSON.stringify({ config }) }),
    getUsers: () => request<any[]>('/admin/users'),
    createUser: (body: any) => request<any>('/admin/users', { method: 'POST', body: JSON.stringify(body) }),
    updateRoles: (id: string, roles: string[]) => request<any>(`/admin/users/${id}/roles`, { method: 'POST', body: JSON.stringify({ roles }) }),
  },
  // Quotes by opportunity
  quotesByOpp: (opportunityId: string) => request<any[]>(`/quotes/by-opportunity/${opportunityId}`),
  // Quote update
  updateQuote: (id: string, body: any) => request<any>(`/quotes/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  // Audit with filters
  auditList: (params?: { entityType?: string; entityId?: string; from?: string; to?: string }) => {
    const qs = new URLSearchParams();
    if (params?.entityType) qs.set('entityType', params.entityType);
    if (params?.entityId) qs.set('entityId', params.entityId);
    if (params?.from) qs.set('from', params.from);
    if (params?.to) qs.set('to', params.to);
    return request<any[]>(`/audit${qs.toString() ? '?' + qs.toString() : ''}`);
  },
  auditExportCsv: async (params?: { entityType?: string; entityId?: string; from?: string; to?: string }) => {
    const { orgId, userId, roles } = getAuth();
    const qs = new URLSearchParams();
    if (params?.entityType) qs.set('entityType', params.entityType);
    if (params?.entityId) qs.set('entityId', params.entityId);
    if (params?.from) qs.set('from', params.from);
    if (params?.to) qs.set('to', params.to);
    const url = `${BASE_URL}/audit/export.csv${qs.toString() ? '?' + qs.toString() : ''}`;
    const res = await fetch(url, {
      headers: { 'X-Org-Id': orgId, 'X-User-Id': userId, 'X-User-Roles': roles },
    });
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `audit-export-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  },
};
