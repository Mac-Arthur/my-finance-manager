import type { PdfCell } from './pdf-table';
import type { StatementMeta } from './parse-statement';

const DATE = /^(\d{1,2}) ([A-Za-z]{3}) (\d{4}) (\d{2}:\d{2}(?::\d{2})?)$/;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const HEADERS = ['Date &', 'Payment', 'To/From', 'Account', 'Amount', 'Transaction ID', 'Fees', 'Tax', 'Balance', 'Reference'];

/** MTN MoMo's ten-column export. Continuation lines can span page boundaries. */
export function momoPdfTable(pages: PdfCell[][]): { table: string[][]; text: string; meta: StatementMeta } | null {
  if (!pages[0]?.some(c => c.text === 'Wallet number:') || !pages[0]?.some(c => c.text === 'Date &')) return null;
  const records: string[][] = [];
  const source: string[] = [];
  let current: string[] | null = null;
  for (const [pageIndex, page] of pages.entries()) {
    const anchor = page.find(c => c.text === 'Date &');
    if (!anchor) throw new Error(`MoMo page ${pageIndex + 1} has no transaction header. No partial import was created.`);
    const headers = HEADERS.map(label => page.find(c => c.text === label && Math.abs(c.y - anchor.y) < 2));
    if (headers.some(c => !c)) throw new Error(`MoMo page ${pageIndex + 1} has an unexpected column layout.`);
    const x = headers.map(c => c!.x);
    if (x.some((position, i) => i > 0 && position <= x[i - 1])) throw new Error('MoMo columns are not in the expected order.');
    const time = page.find(c => c.text === 'Time' && Math.abs(c.x - anchor.x) < 2 && c.y < anchor.y && c.y > anchor.y - 20);
    if (!time) throw new Error('MoMo date/time header is incomplete.');
    const footer = page.find(c => /^Page \d+ of \d+$/.test(c.text));
    if (!footer) throw new Error(`MoMo page ${pageIndex + 1} is missing its page footer.`);
    const pageNumbers = /^Page (\d+) of (\d+)$/.exec(footer.text)!;
    if (+pageNumbers[1] !== pageIndex + 1 || +pageNumbers[2] !== pages.length) throw new Error('MoMo statement pages are missing or out of order.');
    const cells = page.filter(c => c.y < time.y - 2 && c.y > footer.y + 2).sort((a, b) => b.y - a.y || a.x - b.x);
    const lines: PdfCell[][] = [];
    for (const cell of cells) {
      let line = lines.find(line => Math.abs(line[0].y - cell.y) < 2);
      if (!line) { line = []; lines.push(line); }
      line.push(cell);
    }
    for (const line of lines) {
      const values = HEADERS.map(() => '');
      for (const cell of line.sort((a, b) => a.x - b.x)) {
        let col = -1;
        for (let i = 0; i < x.length; i++) if (cell.x >= x[i] - 2) col = i;
        if (col < 0) throw new Error(`Unexpected text outside the MoMo columns on page ${pageIndex + 1}.`);
        values[col] = [values[col], cell.text].filter(Boolean).join(' ');
      }
      source.push(values.join(' | '));
      if (values[0]) {
        const match = DATE.exec(values[0]);
        if (!match || !MONTHS.includes(match[2])) throw new Error(`Unrecognised MoMo transaction date on page ${pageIndex + 1}: ${values[0]}`);
        values[0] = `${match[3]}-${String(MONTHS.indexOf(match[2]) + 1).padStart(2, '0')}-${match[1].padStart(2, '0')}T${match[4]}`;
        current = values;
        records.push(current);
      } else {
        if (!current) throw new Error('MoMo statement starts with an incomplete transaction.');
        // The exporter wraps account names, numbers, references and sometimes IDs.
        for (let i = 1; i < values.length; i++) if (values[i]) current[i] = [current[i], values[i]].filter(Boolean).join(' ');
      }
    }
  }
  for (const [i, row] of records.entries()) {
    if (!row[1] || !row[3] || !/^[+-]\d[\d,]*(?:\.\d{1,2})?$/.test(row[4]) || !/^\d+$/.test(row[5])) throw new Error(`MoMo transaction ${i + 1} has incomplete or ambiguous details.`);
    for (const col of [6, 7, 8]) if (!/^GHS\s+[+-]?\d[\d,]*(?:\.\d{1,2})?$/.test(row[col])) throw new Error(`MoMo transaction ${i + 1} has an invalid fee, tax or balance.`);
  }
  return {
    table: [['date', 'name', 'amount', 'fee', 'balance', 'transaction_id', 'reference', 'currency', 'payment_type', 'tax'],
      ...records.map(row => [row[0], row[3], row[4], row[6].replace(/^GHS\s+/, ''), row[8].replace(/^GHS\s+/, ''), row[5], row[9], 'GHS', row[1], row[7].replace(/^GHS\s+/, '')])],
    text: source.join('\n'),
    meta: momoMeta(pages[0]),
  };
}

/** Account holder and wallet from the statement header, e.g. "MTN MoMo ••3863". */
function momoMeta(page: PdfCell[]): StatementMeta {
  const holder = page.find(c => c.text === 'Account holder:');
  const wallet = page.find(c => c.text === 'Wallet number:');
  const details = page.find(c => c.text === 'Statement Details');
  if (!holder || !wallet) return {};
  const right = details?.x ?? holder.x + 150;
  const owner = page.filter(c => c.x > holder.x + 10 && c.x < right - 1 && c.y <= holder.y + 1 && c.y > wallet.y + 1)
    .sort((a, b) => b.y - a.y).map(c => c.text).join(' ').replace(/-\s+/g, '-');
  const number = page.find(c => Math.abs(c.y - wallet.y) < 2 && c.x > wallet.x + 10 && c.x < right - 1)?.text.replace(/\D/g, '') ?? '';
  return { owner: owner || undefined, account: number.length >= 4 ? `MTN MoMo ••${number.slice(-4)}` : 'MTN MoMo wallet' };
}
