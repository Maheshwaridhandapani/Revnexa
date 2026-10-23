const API_BASE = '/api'

export async function fetchJSON(endpoint, options = {}) {
  const token = localStorage.getItem('revnexa_token')
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  }
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  // Allow absolute paths (e.g. /health) that are outside /api
  const url = endpoint.startsWith('/api') || endpoint.startsWith('http')
    ? endpoint
    : `${API_BASE}${endpoint}`
  
  const response = await fetch(url, {
    headers,
    ...options,
  })
  
  if (!response.ok) {
    if (response.status === 401) {
      // Unauthorized - clear token and redirect to login
      localStorage.removeItem('revnexa_token')
      window.location.href = '/login'
      throw new Error('Unauthorized')
    }
    let detail = `HTTP error! status: ${response.status}`
    try {
      const err = await response.json()
      if (err.detail) detail = err.detail
    } catch (_) {}
    throw new Error(detail)
  }
  return response.json()
}

export const api = {
  health: () => fetchJSON('/health'),
  meta: () => fetchJSON('/meta'),
  dashboard: (params = {}) => {
    const search = new URLSearchParams(params).toString()
    return fetchJSON(`/dashboard${search ? '?' + search : ''}`)
  },
  records: (params = {}) => {
    const search = new URLSearchParams(params).toString()
    return fetchJSON(`/records${search ? '?' + search : ''}`)
  },
  record: (id) => fetchJSON(`/records/${id}`),
  factChecks: (params = {}) => {
    const search = new URLSearchParams(params).toString()
    return fetchJSON(`/fact-checks${search ? '?' + search : ''}`)
  },
  agents: (params = {}) => {
    const search = new URLSearchParams(params).toString()
    return fetchJSON(`/agents${search ? '?' + search : ''}`)
  },
  brief: () => fetchJSON('/brief'),
  importInitial: (shuffleOrder = false) => 
    fetchJSON('/import/initial', {
      method: 'POST',
      body: JSON.stringify({ shuffle_order: shuffleOrder }),
    }),
  importUpdate: () => fetchJSON('/import/update', { method: 'POST' }),
  demoLoad: () => fetchJSON('/demo-load', { method: 'POST' }),
  reset: () => fetchJSON('/reset', { method: 'POST' }),
  replay: () => fetchJSON('/replay', { method: 'POST' }),
  export: () => fetchJSON('/export', { method: 'POST' }),
  correctRoute: (recordId, routes, note, reviewStatus) =>
    fetchJSON(`/records/${recordId}/routes`, {
      method: 'POST',
      body: JSON.stringify({ routes, note, review_status: reviewStatus }),
    }),
  reviewRecord: (recordId, action, note) =>
    fetchJSON(`/records/${recordId}/review`, {
      method: 'POST',
      body: JSON.stringify({ action, note }),
    }),
  analyzeRecord: (recordId) =>
    fetchJSON(`/records/${recordId}/analyze`, { method: 'POST' }),
  runGate: (findingId) =>
    fetchJSON(`/fact-checks/${findingId}/gate`, { method: 'POST' }),
  runRecordGate: (recordId) =>
    fetchJSON(`/records/${recordId}/gate`, { method: 'POST' }),
}
