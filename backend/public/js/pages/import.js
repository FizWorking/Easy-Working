const ImportPage = {
  step: 1,
  connections: [],
  fileData: null,
  mapping: {},
  defaults: {},
  importResult: null,
  isImporting: false,

  async init() {
    App.setActiveNav('import');
    this.step = 1;
    this.fileData = null;
    this.mapping = {};
    this.defaults = {};
    this.importResult = null;
    this.isImporting = false;

    try {
      this.connections = await API.getConnections();
      if (!this.connections.length) {
        const c = document.getElementById('pageContent');
        c.innerHTML = `
          <div class="card text-center" style="padding:64px;">
            <div style="font-size:48px;margin-bottom:16px;">&#128268;</div>
            <h3>No QuickBooks Company Connected</h3>
            <p style="color:var(--gray-500);margin:12px 0 24px;">Connect a QuickBooks Online company first to start importing.</p>
            <button class="btn btn-primary btn-lg" onclick="DashboardPage.connectQBO()">Connect to QuickBooks</button>
          </div>
        `;
        return;
      }
      this.renderStep1();
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },

  renderSteps() {
    const labels = ['Setup', 'Upload', 'Map & Import', 'Results'];
    const current = this.importResult ? 4 : this.fileData ? 3 : this.step === 2 ? 2 : 1;
    return `<div class="steps">${labels.map((l, i) =>
      `<div class="step ${i + 1 === current ? 'active' : i + 1 < current ? 'done' : ''}">${l}</div>`
    ).join('')}</div>`;
  },

  renderStep1() {
    const c = document.getElementById('pageContent');
    c.innerHTML = `
      ${this.renderSteps()}
      <div class="card">
        <div class="card-title">Import Setup</div>
        <div class="card-subtitle">Choose which QuickBooks company and transaction type.</div>
        <div class="form-group">
          <label>QuickBooks Company</label>
          <select id="connSelect">
            ${this.connections.map(co => `<option value="${co.id}">${esc(co.company_name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Transaction Type</label>
          <select id="typeSelect">
            <option value="Expense">Expense (Check / Cash / Credit Card)</option>
            <option value="Bill">Bill (Vendor Bill)</option>
          </select>
        </div>
        <button class="btn btn-primary btn-lg mt-16" onclick="ImportPage.goStep2()">Next: Upload File</button>
      </div>
    `;
  },

  goStep2() {
    this.connectionId = parseInt(document.getElementById('connSelect').value);
    this.transactionType = document.getElementById('typeSelect').value;
    this.step = 2;
    this.renderStep2();
  },

  renderStep2() {
    const c = document.getElementById('pageContent');
    c.innerHTML = `
      ${this.renderSteps()}
      <div class="card">
        <div class="card-title">Upload File</div>
        <div class="card-subtitle">Upload an Excel (.xlsx/.xls) or CSV file with your transactions.</div>
        <div class="upload-zone" id="uploadZone">
          <div class="upload-zone-icon" id="uploadIcon">&#128196;</div>
          <div class="upload-zone-text">Drag & drop your file here, or click to browse</div>
          <div class="upload-zone-hint">Supports .xlsx, .xls, .csv (max 10MB)</div>
          <div id="uploadFileName" class="upload-file-name"></div>
          <input type="file" id="fileInput" accept=".xlsx,.xls,.csv">
        </div>
        <div style="margin-top:16px;display:flex;gap:8px;">
          <button class="btn btn-outline" onclick="ImportPage.init()">Back</button>
          <button class="btn btn-primary" id="uploadBtn" onclick="ImportPage.upload()" disabled>Upload & Preview</button>
        </div>
        <div id="uploadStatus" style="margin-top:12px;"></div>
      </div>
    `;

    const zone = document.getElementById('uploadZone');
    const input = document.getElementById('fileInput');

    zone.addEventListener('click', () => input.click());
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', (e) => { e.preventDefault(); zone.classList.remove('dragover'); if (e.dataTransfer.files.length) ImportPage.setFile(e.dataTransfer.files[0]); });
    input.addEventListener('change', () => { if (input.files.length) ImportPage.setFile(input.files[0]); });
  },

  setFile(file) {
    const valid = ['.xlsx', '.xls', '.csv'];
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!valid.includes(ext)) {
      App.toast('Please select an Excel or CSV file', 'error');
      return;
    }
    this.selectedFile = file;
    document.getElementById('uploadFileName').textContent = file.name;
    document.getElementById('uploadZone').classList.add('has-file');
    document.getElementById('uploadBtn').disabled = false;
  },

  async upload() {
    if (!this.selectedFile) return;
    const btn = document.getElementById('uploadBtn');
    const status = document.getElementById('uploadStatus');
    btn.disabled = true;
    status.innerHTML = 'Parsing file...';

    try {
      const result = await API.uploadFile(this.selectedFile);
      this.fileData = result;
      this.autoMapColumns();
      this.renderStep3();
    } catch (e) {
      status.innerHTML = `<span style="color:var(--danger)">${esc(e.message)}</span>`;
      btn.disabled = false;
    }
  },

  autoMapColumns() {
    const cols = this.fileData.columns;
    this.mapping = {};
    const map = {
      'date': ['date', 'txn date', 'transaction date', 'trans date', 'posting date'],
      'vendor': ['vendor', 'vendor name', 'payee', 'supplier', 'name', 'supplier name'],
      'amount': ['amount', 'total', 'sum', 'value', 'transaction amount', 'amt'],
      'account': ['account', 'expense account', 'category', 'account name', 'expense category', 'class', 'type'],
      'description': ['description', 'memo', 'note', 'notes', 'details', 'narration', 'particulars'],
      'docNumber': ['check', 'check no', 'check number', 'reference', 'ref no', 'doc number', 'reference number'],
      'dueDate': ['due date', 'due', 'pay by'],
      'class': ['class', 'class name', 'tracking class'],
      'taxAmount': ['linetaxamount', 'taxamount', 'tax amount', 'tax amt', 'gst amount', 'vat amount', 'hst amount', 'sales tax amount'],
      'taxCode': ['linetaxcode', 'taxcode', 'tax code', 'tax category', 'gst', 'hst', 'vat', 'sales tax', 'tax rate']
    };

    cols.forEach(col => {
      const lower = col.toLowerCase().trim();
      for (const [field, aliases] of Object.entries(map)) {
        if (aliases.some(a => lower === a || lower.includes(a))) {
          this.mapping[field] = col;
          break;
        }
      }
    });
  },

  renderStep3() {
    this.step = 3;
    const c = document.getElementById('pageContent');
    const cols = this.fileData.columns;
    const preview = this.fileData.preview;
    const fieldOptions = [
      { value: '', label: '-- Skip --' },
      { value: 'date', label: 'Date' },
      { value: 'vendor', label: 'Vendor / Payee' },
      { value: 'amount', label: 'Amount' },
      { value: 'account', label: 'Account (Expense)' },
      { value: 'description', label: 'Description / Memo' },
      { value: 'docNumber', label: 'Doc Number / Check #' },
      { value: 'class', label: 'Class (Tracking)' },
      { value: 'taxCode', label: 'Tax Code' },
      { value: 'taxAmount', label: 'Tax Amount' }
    ];
    if (this.transactionType === 'Bill') {
      fieldOptions.push({ value: 'dueDate', label: 'Due Date' });
    }

    let html = this.renderSteps();

    html += `<div class="card"><div class="card-title">Preview (First ${preview.length} of ${this.fileData.totalRows} rows)</div>
    <div class="table-wrap"><table><thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>`;
    preview.forEach(row => {
      html += `<tr>${cols.map(c => `<td>${esc(row[c] || '')}</td>`).join('')}</tr>`;
    });
    html += `</tbody></table></div></div>`;

    html += `<div class="card"><div class="card-title">Map Columns to QuickBooks Fields</div>
    <div class="card-subtitle">Tell us which column in your file corresponds to each QuickBooks field.</div>`;
    cols.forEach(col => {
      const matched = Object.values(this.mapping).includes(col);
      html += `<div class="mapping-row">
        <div class="mapping-col-name">${esc(col)}</div>
        <div class="mapping-select">
          <select id="map_${esc(col)}" onchange="ImportPage.updateMapping('${esc(col)}', this.value)">
            ${fieldOptions.map(f =>
              `<option value="${esc(f.value)}" ${(!f.value && !matched) ? 'selected' : (this.mapping[f.value] === col) ? 'selected' : ''}>${esc(f.label)}</option>`
            ).join('')}
          </select>
        </div>
      </div>`;
    });
    html += `</div>`;

    html += `<div class="card"><div class="card-title">Default Values</div>
    <div class="card-subtitle">Set default values that apply to all rows (optional for mapped fields).</div>
    <div class="defaults-grid">
      <div class="form-group">
        <label>Default Date (if not mapped)</label>
        <input type="date" id="defDate">
      </div>
      <div class="form-group">
        <label>Date Format in File</label>
        <select id="defDateFormat">
          <option value="">Auto-detect</option>
          <option value="MM/DD/YYYY">MM/DD/YYYY</option>
          <option value="DD/MM/YYYY">DD/MM/YYYY</option>
          <option value="MM-DD-YYYY">MM-DD-YYYY</option>
          <option value="DD-MM-YYYY">DD-MM-YYYY</option>
          <option value="DD.MM.YYYY">DD.MM.YYYY</option>
          <option value="Mon DD, YYYY">Mon DD, YYYY</option>
          <option value="DD-Mon-YYYY">DD-Mon-YYYY</option>
        </select>
      </div>
      <div class="form-group">
        <label>Default Account Name</label>
        <input type="text" id="defAccount" placeholder="e.g. Office Expenses">
      </div>`;

    if (this.transactionType === 'Expense') {
      html += `
      <div class="form-group">
        <label>Payment Account (Bank)</label>
        <input type="text" id="defPaymentAccount" placeholder="e.g. Business Checking">
      </div>
      <div class="form-group">
        <label>Payment Type</label>
        <select id="defPaymentType">
          <option value="Check">Check</option>
          <option value="Cash">Cash</option>
          <option value="CreditCard">Credit Card</option>
        </select>
      </div>`;
    }

    if (this.transactionType === 'Bill') {
      html += `<div class="form-group"><label>Default Due Date</label><input type="date" id="defDueDate"></div>`;
    }

    html += `<div class="form-group"><label>Default Class (if not mapped)</label><input type="text" id="defClass" placeholder="e.g. Consulting"></div>
    <div class="form-group" style="grid-column:span 2">
      <label><input type="checkbox" id="defUseClass" checked> Use Class Tracking (uncheck if class not enabled in QBO)</label>
    </div>
    <div class="form-group"><label>Default Tax Code (if not mapped)</label><input type="text" id="defTaxCode" placeholder="e.g. TAX or NON"></div>
    <div class="form-group"><label>Default Tax Amount (if not mapped)</label><input type="number" step="0.01" id="defTaxAmount" placeholder="e.g. 10.00"></div>
    <div class="form-group"><label>Tax Inclusive/Exclusive</label>
      <select id="defTaxInclusive">
        <option value="false">Exclusive (tax added on top)</option>
        <option value="true">Inclusive (amount includes tax)</option>
      </select>
    </div>
    <div class="form-group"><label>Default Tax Rate Name (optional)</label><input type="text" id="defTaxRateName" placeholder="e.g. GST 10%"></div>`;

    html += `</div><div style="display:flex;gap:8px;margin-top:16px;">
      <button class="btn btn-outline" onclick="ImportPage.goStep2()">Back</button>
      <button class="btn btn-success btn-lg" id="importBtn" onclick="ImportPage.execute()">
        Import ${this.fileData.totalRows} ${esc(this.transactionType)}(s)
      </button>
    </div></div>
    <div id="importProgress"></div>`;

    c.innerHTML = html;
  },

  updateMapping(col, value) {
    for (const [k, v] of Object.entries(this.mapping)) {
      if (v === col) delete this.mapping[k];
    }
    if (value) this.mapping[value] = col;
  },

  async execute() {
    if (this.isImporting) return;
    this.isImporting = true;

    const btn = document.getElementById('importBtn');
    btn.disabled = true;
    btn.textContent = 'Importing...';

    const defaults = {
      date: document.getElementById('defDate')?.value || '',
      accountName: document.getElementById('defAccount')?.value || '',
      paymentAccount: document.getElementById('defPaymentAccount')?.value || '',
      paymentType: document.getElementById('defPaymentType')?.value || 'Check',
      dueDate: document.getElementById('defDueDate')?.value || '',
      className: document.getElementById('defClass')?.value || '',
      useClass: document.getElementById('defUseClass')?.checked ? 'true' : 'false',
      taxCode: document.getElementById('defTaxCode')?.value || '',
      taxAmount: document.getElementById('defTaxAmount')?.value || '',
      taxInclusive: document.getElementById('defTaxInclusive')?.value || 'false',
      taxRateName: document.getElementById('defTaxRateName')?.value || ''
    };
    const dateFormat = document.getElementById('defDateFormat')?.value || '';

    try {
      this.importResult = await API.executeImport({
        connectionId: this.connectionId,
        transactionType: this.transactionType,
        mapping: this.mapping,
        defaults,
        dateFormat,
        fileId: this.fileData.fileId
      });

      this.renderResults();
    } catch (e) {
      const prog = document.getElementById('importProgress');
      if (prog) prog.innerHTML = `<div style="color:var(--danger);padding:12px;">Error: ${esc(e.message)}</div>`;
      btn.disabled = false;
      btn.textContent = 'Retry Import';
    }
    this.isImporting = false;
  },

  renderResults() {
    const r = this.importResult;
    const pct = r.total > 0 ? Math.round((r.success / r.total) * 100) : 0;
    const c = document.getElementById('pageContent');

    c.innerHTML = `
      ${this.renderSteps()}
      <div class="card">
        <div class="result-summary">
          <div class="result-icon">${r.errors === 0 ? '&#9989;' : r.success > 0 ? '&#9888;&#65039;' : '&#10060;'}</div>
          <h3>${r.errors === 0 ? 'Import Completed Successfully' : r.success > 0 ? 'Import Completed with Errors' : 'Import Failed'}</h3>
          <div class="result-counts">
            <div class="result-count">
              <div class="num">${r.total}</div>
              <div class="lbl">Total Rows</div>
            </div>
            <div class="result-count">
              <div class="num" style="color:var(--success)">${r.success}</div>
              <div class="lbl">Imported</div>
            </div>
            <div class="result-count">
              <div class="num" style="color:var(--danger)">${r.errors}</div>
              <div class="lbl">Errors</div>
            </div>
          </div>
          <div class="progress-bar" style="margin-top:24px;max-width:400px;margin-left:auto;margin-right:auto;">
            <div class="progress-fill ${r.errors === 0 ? 'success' : r.success > 0 ? 'partial' : ''}" style="width:${pct}%"></div>
          </div>
          <p style="color:var(--gray-500);font-size:13px;margin-top:8px;">${pct}% success rate</p>
        </div>
        <div style="display:flex;gap:8px;justify-content:center;">
          <button class="btn btn-primary" onclick="ImportPage.init()">Import Another File</button>
          <a href="#/history" class="btn btn-outline">View Details</a>
        </div>
      </div>
    `;
  }
};

window.ImportPage = ImportPage;
