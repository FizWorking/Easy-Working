const App = {
  currentPage: null,

  init() {
    this.user = { id: 1, name: 'User', email: 'user@local' };
    localStorage.setItem('token', 'no-auth-required');
    window.addEventListener('hashchange', () => this.router());
    this.router();
  },

  router() {
    const hash = window.location.hash.slice(1) || '/dashboard';
    const [path, qs] = hash.split('?');
    const params = {};
    if (qs) {
      qs.split('&').forEach(p => { const [k, v] = p.split('='); params[k] = v; });
    }

    this.showSidebar(true);
    const page = path.replace('/', '') || 'dashboard';

    if (page === 'dashboard') {
      DashboardPage.init(params);
    } else if (page === 'import') {
      ImportPage.init();
    } else if (page === 'history') {
      this.renderHistory();
    } else {
      window.location.hash = '#/dashboard';
    }
  },

  showSidebar(show) {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    if (show) {
      sidebar.classList.remove('hidden');
      const userName = document.querySelector('#userInfo .user-name');
      if (userName) userName.textContent = this.user?.name || '';
    } else {
      sidebar.classList.add('hidden');
    }
  },

  setActiveNav(page) {
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.page === page);
    });
  },

  toast(msg, type = 'info') {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = `toast ${type}`;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 4000);
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());

App.renderHistory = async function() {
  this.setActiveNav('history');
  const c = document.getElementById('pageContent');
  c.innerHTML = '<h2>Import History</h2><p style="color: var(--gray-400); margin-top: 8px;">Loading...</p>';
  try {
    const data = await API.getHistory();
    if (!data.length) {
      c.innerHTML = '<div class="empty-state"><div style="font-size:40px;margin-bottom:12px;">&#128203;</div><p>No imports yet. <a href="#/import" style="color:var(--primary)">Start your first import</a></p></div>';
      return;
    }
    let html = '<h2>Import History</h2><div class="table-wrap mt-16"><table><thead><tr><th>Date</th><th>File</th><th>Company</th><th>Type</th><th>Rows</th><th>Success</th><th>Errors</th><th>Status</th><th></th></tr></thead><tbody>';
    data.forEach(r => {
      const statusClass = r.status === 'completed' ? 'badge-success' : r.status === 'partial' ? 'badge-warning' : r.status === 'failed' ? 'badge-danger' : 'badge-info';
      html += `<tr>
        <td>${new Date(r.created_at).toLocaleDateString()}</td>
        <td>${esc(r.file_name || '-')}</td>
        <td>${esc(r.company_name || '-')}</td>
        <td>${esc(r.transaction_type || '-')}</td>
        <td>${r.total_rows}</td>
        <td style="color:var(--success);font-weight:600;">${r.success_count}</td>
        <td style="color:var(--danger);font-weight:600;">${r.error_count}</td>
        <td><span class="badge ${statusClass}">${r.status}</span></td>
        <td><button class="btn btn-sm btn-outline" onclick="App.viewHistory(${r.id})">Details</button></td>
      </tr>`;
    });
    html += '</tbody></table></div>';
    c.innerHTML = html;
  } catch (e) {
    c.innerHTML = `<div class="empty-state"><p style="color:var(--danger)">Error: ${esc(e.message)}</p></div>`;
  }
};

App.viewHistory = async function(id) {
  try {
    const data = await API.getHistoryDetail(id);
    const c = document.getElementById('pageContent');
    let html = `<div class="card"><div class="flex items-center justify-between mb-16">
      <div><div class="card-title">Import #${data.id}</div>
      <div class="card-subtitle">${esc(data.file_name)} &mdash; ${new Date(data.created_at).toLocaleString()}</div></div>
      <button class="btn btn-sm btn-outline" onclick="App.renderHistory()">&larr; Back</button>
    </div>`;
    html += `<div class="stats" style="grid-template-columns:repeat(4,1fr);">
      <div class="stat-card"><div class="stat-value">${data.total_rows}</div><div class="stat-label">Total Rows</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--success)">${data.success_count}</div><div class="stat-label">Success</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--danger)">${data.error_count}</div><div class="stat-label">Errors</div></div>
      <div class="stat-card"><div class="stat-value" style="font-size:16px;font-weight:500"><span class="badge ${data.status === 'completed' ? 'badge-success' : data.status === 'partial' ? 'badge-warning' : 'badge-danger'}">${esc(data.status)}</span></div><div class="stat-label">Status</div></div>
    </div>`;
    if (data.logs && data.logs.length) {
      html += '<div class="table-wrap"><table><thead><tr><th>Row</th><th>Status</th><th>QBO ID</th><th>Error</th></tr></thead><tbody>';
      data.logs.forEach(l => {
        html += `<tr><td>${l.row_number}</td><td><span class="badge ${l.status === 'success' ? 'badge-success' : 'badge-danger'}">${l.status}</span></td><td>${esc(l.qbo_id || '-')}</td><td style="color:var(--danger);font-size:13px">${esc(l.error_message || '-')}</td></tr>`;
      });
      html += '</tbody></table></div>';
    }
    html += '</div>';
    c.innerHTML = html;
  } catch (e) {
    App.toast(e.message, 'error');
  }
};
