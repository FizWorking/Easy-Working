const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'store.json');

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return {
      users: [],
      qbo_connections: [],
      imports: [],
      import_logs: [],
      _ids: { users: 1, qbo_connections: 1, imports: 1, import_logs: 1 }
    };
  }
}

let data = load();

function save() {
  const dir = path.dirname(FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

function match(obj, where) {
  for (const [k, v] of Object.entries(where)) {
    if (obj[k] !== v) return false;
  }
  return true;
}

const store = {
  all(table, where = {}) {
    return data[table].filter(r => match(r, where));
  },

  get(table, where) {
    return data[table].find(r => match(r, where)) || null;
  },

  insert(table, fields) {
    const id = data._ids[table]++;
    const record = { id, ...fields, created_at: new Date().toISOString() };
    data[table].push(record);
    save();
    return record;
  },

  update(table, where, fields) {
    let count = 0;
    data[table] = data[table].map(r => {
      if (match(r, where)) {
        count++;
        return { ...r, ...fields };
      }
      return r;
    });
    if (count) save();
    return { changes: count };
  },

  delete(table, where) {
    const before = data[table].length;
    data[table] = data[table].filter(r => !match(r, where));
    const changes = before - data[table].length;
    if (changes) save();
    return { changes };
  }
};

module.exports = store;
