function download(filename, contents, type) {
  const url = URL.createObjectURL(new Blob([contents], {type}));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadJSON(filename, data) {
  download(filename, JSON.stringify(data, null, 2), 'application/json');
}

export function downloadCSV(filename, headers, rows) {
  const field = value => {
    let text = String(value ?? '');
    if (typeof value === 'string' && /^[\s\uFEFF]*[=+@-]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  const csv = [headers, ...rows].map(row => row.map(field).join(',')).join('\r\n');
  download(filename, '\uFEFF' + csv, 'text/csv;charset=utf-8');
}
