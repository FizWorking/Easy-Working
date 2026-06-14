const XLSX = require('xlsx');
const { parse } = require('csv-parse/sync');
const fs = require('fs');

function parseExcel(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(worksheet, { defval: '' });
}

function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true
  });
}

function parseFile(filePath, ext) {
  let data;
  if (ext === '.xlsx' || ext === '.xls') {
    data = parseExcel(filePath);
  } else if (ext === '.csv') {
    data = parseCSV(filePath);
  } else {
    throw new Error('Unsupported format. Use .xlsx, .xls, or .csv');
  }

  if (!data || data.length === 0) {
    throw new Error('File is empty or has no valid data rows');
  }

  const columns = Object.keys(data[0]);
  const preview = data.slice(0, 10);

  return { columns, preview, totalRows: data.length, allData: data };
}

module.exports = { parseFile };
