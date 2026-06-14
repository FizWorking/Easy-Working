const express = require('express');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const store = require('../config/store');
const auth = require('../middleware/auth');
const { parseFile } = require('../services/fileParser');
const QboService = require('../services/qboService');

const router = express.Router();

const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`)
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.xlsx', '.xls', '.csv'].includes(ext)) return cb(null, true);
    cb(new Error('Only .xlsx, .xls, and .csv files are allowed'));
  },
  limits: { fileSize: 10 * 1024 * 1024 }
});

const parseCache = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of parseCache) {
    if (now - val.ts > 3600000) parseCache.delete(key);
  }
}, 600000);

router.post('/upload', auth, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    try {
      const ext = path.extname(req.file.originalname).toLowerCase();
      const result = parseFile(req.file.path, ext);
      const fileId = uuidv4();

      parseCache.set(fileId, { data: result.allData, fileName: req.file.originalname, ts: Date.now() });

      res.json({
        fileId,
        fileName: req.file.originalname,
        columns: result.columns,
        preview: result.preview,
        totalRows: result.totalRows
      });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
});

router.post('/execute', auth, async (req, res) => {
  const { connectionId, transactionType, mapping, defaults, fileId, dateFormat } = req.body;

  if (!connectionId || !transactionType || !mapping || !fileId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const cached = parseCache.get(fileId);
  if (!cached) return res.status(400).json({ error: 'Upload session expired, please re-upload' });

  const connection = store.get('qbo_connections', { id: connectionId, user_id: req.user.id });
  if (!connection) return res.status(404).json({ error: 'QBO connection not found' });

  const imp = store.insert('imports', {
    user_id: req.user.id,
    qbo_connection_id: connectionId,
    file_name: cached.fileName,
    transaction_type: transactionType,
    total_rows: cached.data.length,
    success_count: 0,
    error_count: 0,
    status: 'processing'
  });
  const importId = imp.id;

  const qboSvc = new QboService(connection, (connId, at, rt) => {
    store.update('qbo_connections', { id: connId }, { access_token: at, refresh_token: rt });
  });

  let accounts = [], vendors = [], classes = [], taxCodes = [], taxRates = [];
  try { accounts = await qboSvc.getAccounts(); } catch (_) {}
  try { vendors = await qboSvc.getVendors(); } catch (_) {}
  try { classes = await qboSvc.getClasses(); } catch (_) {}
  try { taxCodes = await qboSvc.getTaxCodes(); } catch (_) {}
  try { taxRates = await qboSvc.getTaxRates(); } catch (_) {}

  const acctMap = {};
  accounts.forEach(a => { acctMap[a.Name.toLowerCase()] = a.Id; acctMap[a.Id] = a.Id; });
  const vendMap = {};
  vendors.forEach(v => { vendMap[v.DisplayName.toLowerCase()] = v.Id; vendMap[v.Id] = v.Id; });
  const classMap = {};
  classes.forEach(c => { classMap[c.Name.toLowerCase()] = c.Id; classMap[c.Id] = c.Id; });
  const taxCodeMap = {};
  taxCodes.forEach(t => { taxCodeMap[t.Name.toLowerCase()] = t.Id; taxCodeMap[t.Id] = t.Id; });
  console.log(`[TAX DEBUG] TaxCodes found: ${taxCodes.length}`, taxCodes.map(t => ({ Id: t.Id, Name: t.Name })));
  const taxRateMap = {};
  taxRates.forEach(r => { taxRateMap[r.Name.toLowerCase()] = r.Id; taxRateMap[r.Id] = r.Id; taxRateMap[r.RateValue?.toString()] = r.Id; });
  console.log(`[TAX DEBUG] TaxRates found: ${taxRates.length}`, taxRates.map(r => ({ Id: r.Id, Name: r.Name, RateValue: r.RateValue })));

  let success = 0, errors = 0;

  for (let i = 0; i < cached.data.length; i++) {
    const row = cached.data[i];
    const rowNum = i + 2;

    try {
      const qboData = buildQBOData(row, mapping, defaults, transactionType, acctMap, vendMap, classMap, taxCodeMap, taxRateMap, dateFormat, taxRates);
      if (i < 2 || qboData.TxnTaxDetail) console.log('Row ' + rowNum + ' JSON:', JSON.stringify(qboData, null, 2));
      let result;
      if (transactionType === 'Expense') result = await qboSvc.createPurchase(qboData);
      else if (transactionType === 'Bill') result = await qboSvc.createBill(qboData);
      else throw new Error('Unknown transaction type');

      const qboId = (result.Purchase && result.Purchase.Id) || (result.Bill && result.Bill.Id) || '';
      store.insert('import_logs', { import_id: importId, row_number: rowNum, status: 'success', qbo_id: qboId });
      success++;
    } catch (e) {
      const msg = e.message || 'Unknown error';
      store.insert('import_logs', { import_id: importId, row_number: rowNum, status: 'error', error_message: msg });
      errors++;
    }

    if ((i + 1) % 10 === 0 || i === cached.data.length - 1) {
      store.update('imports', { id: importId }, { success_count: success, error_count: errors });
    }
  }

  const status = errors === 0 ? 'completed' : (success > 0 ? 'partial' : 'failed');
  store.update('imports', { id: importId }, { success_count: success, error_count: errors, status });
  parseCache.delete(fileId);

  res.json({ importId, status, total: cached.data.length, success, errors });
});

function buildQBOData(row, mapping, defaults, type, acctMap, vendMap, classMap, taxCodeMap, taxRateMap, dateFormat, taxRates) {
  const val = (field) => {
    const col = mapping[field];
    return (col && row[col] !== undefined && row[col] !== '') ? row[col].toString().trim() : null;
  };

  const amount = parseFloat(val('amount'));
  if (isNaN(amount) || amount <= 0) throw new Error(`Invalid amount: ${val('amount')}`);

  const desc = val('description') || val('memo') || '';

  const acctName = val('account') || defaults.accountName || '';
  let acctId = acctMap[acctName.toLowerCase()] || acctMap[acctName];
  if (!acctId) throw new Error(`Could not determine account for: "${acctName}"`);

  const lineItem = {
    Amount: Math.abs(amount),
    DetailType: 'AccountBasedExpenseLineDetail',
    AccountBasedExpenseLineDetail: {
      AccountRef: { value: acctId }
    }
  };
  if (desc) lineItem.Description = desc;

  const data = { Line: [lineItem] };

  const dt = val('date') || defaults.date;
  if (dt) data.TxnDate = fmtDate(dt, dateFormat);

  const vn = val('vendor');
  if (vn) {
    const vid = vendMap[vn.toLowerCase()] || vendMap[vn];
    if (vid) {
      if (type === 'Expense') {
        data.EntityRef = { value: vid, type: 'Vendor' };
      } else {
        data.VendorRef = { value: vid };
      }
    }
  }

  if (type === 'Expense') {
    const payAcct = defaults.paymentAccount || '';
    const payId = acctMap[payAcct.toLowerCase()] || acctMap[payAcct];
    data.AccountRef = payId ? { value: payId } : { value: acctId };
    data.PaymentType = defaults.paymentType || 'Check';
    const dn = val('docNumber');
    if (dn) data.DocNumber = dn;
  }

  if (type === 'Bill') {
    const dd = val('dueDate') || defaults.dueDate;
    if (dd) data.DueDate = fmtDate(dd, dateFormat);
    const dn = val('docNumber');
    if (dn) data.DocNumber = dn;
  }

  const memo = val('memo') || desc;
  if (memo) data.PrivateNote = memo;

  // Class (only if useClass is enabled and classes exist in QBO)
  if (defaults.useClass !== 'false' && Object.keys(classMap).length > 0) {
    const cn = val('class');
    if (cn) {
      const cid = classMap[cn.toLowerCase()] || classMap[cn];
      if (cid) data.ClassRef = { value: cid };
    } else if (defaults.className) {
      const cid = classMap[defaults.className.toLowerCase()] || classMap[defaults.className];
      if (cid) data.ClassRef = { value: cid };
    }
  }

  // Tax Code on line item — QBO auto-calculates tax (like SaaSant)
  const tcn = val('taxCode') || defaults.taxCode;
  let taxCodeId = null;
  if (tcn && Object.keys(taxCodeMap).length > 0) {
    taxCodeId = taxCodeMap[tcn.toLowerCase()] || taxCodeMap[tcn];
    if (!taxCodeId) {
      const partial = Object.keys(taxCodeMap).find(k => k.toLowerCase().includes(tcn.toLowerCase()));
      if (partial) taxCodeId = taxCodeMap[partial];
    }
    if (taxCodeId) {
      lineItem.AccountBasedExpenseLineDetail.TaxCodeRef = { value: taxCodeId };
    }
  }
  if (tcn && !taxCodeId) console.log(`[TAX DEBUG] TaxCode "${tcn}" not found in taxCodeMap keys:`, Object.keys(taxCodeMap));

  // QBO auto-calculates tax from TaxCodeRef and Amount — no manual TxnTaxDetail

  // If taxAmount column is mapped, use it for documentation only (QBO calculates it)
  // If inclusive, QBO handles based on TaxCode config

  return data;
}

function fmtDate(s, format) {
  if (!s) return null;
  const str = s.toString().trim();
  if (!str) return null;

  // Already YYYY-MM-DD and valid
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, d] = str.split('-').map(Number);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return str;
  }

  // Excel serial date number (e.g. 45292 → 2024-01-01)
  if (/^\d{5}$/.test(str)) {
    const excelEpoch = new Date(1899, 11, 30);
    const d = new Date(excelEpoch.getTime() + parseInt(str) * 86400000);
    return d.toISOString().split('T')[0];
  }

  // Non-standard date like "+046301-01-01" (Excel serial misinterpreted)
  if (/^[+-]\d{5,6}/.test(str)) {
    return null;
  }

  if (format === 'DD/MM/YYYY') {
    const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  }
  if (format === 'MM/DD/YYYY') {
    const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
  }
  if (format === 'DD-MM-YYYY') {
    const m = str.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  }
  if (format === 'MM-DD-YYYY') {
    const m = str.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (m) return `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
  }
  if (format === 'DD.MM.YYYY') {
    const m = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  }
  if (format === 'Mon DD, YYYY') {
    const months = {'jan':'01','feb':'02','mar':'03','apr':'04','may':'05','jun':'06','jul':'07','aug':'08','sep':'09','oct':'10','nov':'11','dec':'12'};
    const m = str.match(/^([A-Za-z]{3})\s+(\d{1,2}),?\s*(\d{4})$/);
    if (m && months[m[1].toLowerCase()]) return `${m[3]}-${months[m[1].toLowerCase()]}-${m[2].padStart(2,'0')}`;
  }
  if (format === 'DD-Mon-YYYY') {
    const months = {'jan':'01','feb':'02','mar':'03','apr':'04','may':'05','jun':'06','jul':'07','aug':'08','sep':'09','oct':'10','nov':'11','dec':'12'};
    const m = str.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
    if (m && months[m[2].toLowerCase()]) return `${m[3]}-${months[m[2].toLowerCase()]}-${m[1].padStart(2,'0')}`;
  }

  // Auto-detect slash & dash formats
  const sep = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (sep) {
    const a = parseInt(sep[1]), b = parseInt(sep[2]), y = sep[3];
    if (a > 12) return `${y}-${sep[2].padStart(2,'0')}-${sep[1].padStart(2,'0')}`; // DD/MM/YYYY or DD-MM-YYYY
    if (b > 12) return `${y}-${sep[1].padStart(2,'0')}-${sep[2].padStart(2,'0')}`; // MM/DD/YYYY or MM-DD-YYYY
    return `${y}-${sep[1].padStart(2,'0')}-${sep[2].padStart(2,'0')}`; // ambiguous -> treat as MM/DD
  }

  // Try native Date parsing
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    const iso = d.toISOString().split('T')[0];
    const [y, m, day] = iso.split('-').map(Number);
    if (m >= 1 && m <= 12 && day >= 1 && day <= 31) return iso;
  }

  return null;
}

router.get('/history', auth, (req, res) => {
  const list = store.all('imports', { user_id: req.user.id })
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 50)
    .map(r => {
      const conn = store.get('qbo_connections', { id: r.qbo_connection_id });
      return { ...r, company_name: conn ? conn.company_name : '' };
    });
  res.json(list);
});

router.get('/history/:id', auth, (req, res) => {
  const imp = store.get('imports', { id: parseInt(req.params.id), user_id: req.user.id });
  if (!imp) return res.status(404).json({ error: 'Not found' });
  const logs = store.all('import_logs', { import_id: imp.id }).sort((a, b) => a.row_number - b.row_number);
  const conn = store.get('qbo_connections', { id: imp.qbo_connection_id });
  res.json({ ...imp, company_name: conn ? conn.company_name : '', logs });
});

module.exports = router;
