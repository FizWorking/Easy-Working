function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

const API = {
  async request(method, path, data) {
    const opts = {
      method,
      headers: {
        'Authorization': 'Bearer no-auth-required'
      }
    };

    if (data instanceof FormData) {
      opts.body = data;
    } else if (data) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(data);
    }

    const res = await fetch(path, opts);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Request failed');
    return json;
  },

  get(path) { return this.request('GET', path); },
  post(path, data) { return this.request('POST', path, data); },
  delete(path) { return this.request('DELETE', path); },

  getQboAuthUrl() { return this.get('/api/qbo/auth-url'); },
  getConnections() { return this.get('/api/qbo/connections'); },
  disconnectConnection(id) { return this.delete(`/api/qbo/connections/${id}`); },

  uploadFile(file) {
    const fd = new FormData();
    fd.append('file', file);
    return this.post('/api/import/upload', fd);
  },
  executeImport(data) { return this.post('/api/import/execute', data); },
  getHistory() { return this.get('/api/import/history'); },
  getHistoryDetail(id) { return this.get(`/api/import/history/${id}`); }
};
