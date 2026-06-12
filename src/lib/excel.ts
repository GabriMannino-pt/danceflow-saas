/**
 * Utility to export table data as a UTF-8 BOM CSV file with semicolon delimiters.
 * This ensures native compatibility when importing into Excel or Google Sheets.
 */
export function exportToCSV(filename: string, headers: string[], rows: string[][]) {
  const content = [headers, ...rows]
    .map(row => 
      row.map(cell => {
        // Escape quotes and wrap in quotes if it contains delimiter, newline or double quotes
        const cleanCell = String(cell ?? '').trim();
        const escaped = cleanCell.replace(/"/g, '""');
        if (escaped.includes(';') || escaped.includes('\n') || escaped.includes('\r') || escaped.includes('"')) {
          return `"${escaped}"`;
        }
        return escaped;
      }).join(';')
    )
    .join('\r\n');

  // prepend UTF-8 BOM (\uFEFF)
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
