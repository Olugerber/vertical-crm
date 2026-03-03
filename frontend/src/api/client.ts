const BASE_URL = import.meta.env['VITE_API_URL']
  ? `${import.meta.env['VITE_API_URL']}/api`
  : '/api';

function getAuth() {
  const orgId = localStorage.getItem('x-org-id') ?? 'org-acme';
  const userId = localStorage.getItem('x-user-id') ?? 'user-demo';
  const roles = localStorage.getItem('x-user-roles') ?? 'AE';
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
};
