import type { PdfCell } from './pdf-table';
import type { StatementMeta } from './parse-statement';

type OfficialColumn = 'date' | 'fromAccount' | 'fromName' | 'fromNumber' | 'type' | 'amount' | 'fee' | 'tax' |
  'balanceBefore' | 'balanceAfter' | 'toNumber' | 'toName' | 'toAccount' | 'id' | 'reference' | 'ova';
type Line = PdfCell[];
interface Column { id: OfficialColumn; x: number; right: number }

const HEADER: { id: OfficialColumn; words: string[] }[] = [
  { id: 'date', words: ['TRANSACTION', 'DATE'] },
  { id: 'fromAccount', words: ['FROM', 'ACCT'] },
  { id: 'fromName', words: ['FROM', 'NAME'] },
  { id: 'fromNumber', words: ['FROM', 'NO.'] },
  { id: 'type', words: ['TRANS.', 'TYPE'] },
  { id: 'amount', words: ['AMOUNT'] },
  { id: 'fee', words: ['FEES'] },
  { id: 'tax', words: ['E-LEVY'] },
  { id: 'balanceBefore', words: ['BAL', 'BEFORE'] },
  { id: 'balanceAfter', words: ['BAL', 'AFTER'] },
  { id: 'toNumber', words: ['TO', 'NO.'] },
  { id: 'toName', words: ['TO', 'NAME'] },
  { id: 'toAccount', words: ['TO', 'ACCT'] },
  { id: 'id', words: ['F_ID'] },
  { id: 'reference', words: ['REF'] },
  { id: 'ova', words: ['OVA'] },
];
const DATE = /^\d{1,2}-[A-Za-z]{3}-\d{4}(?:\s|$)/;
const MONEY = /^\d[\d,]*(?:\.\d{1,2})?$/;

function pageLines(page: PdfCell[]): Line[] {
  const result: Line[] = [];
  for (const cell of [...page].sort((a, b) => b.y - a.y || a.x - b.x)) {
    let line = result.find(row => Math.abs(row[0].y - cell.y) < 1.5);
    if (!line) { line = []; result.push(line); }
    line.push(cell);
  }
  return result.map(line => line.sort((a, b) => a.x - b.x));
}

function columnsFor(page: PdfCell[]): { columns: Column[]; y: number } | null {
  for (const line of pageLines(page)) {
    const cells = line.map(cell => ({ ...cell, normalized: cell.text.trim().toUpperCase() }));
    if (!cells.some(cell => cell.normalized === 'F_ID') || !cells.some(cell => cell.normalized === 'E-LEVY')) continue;
    const columns: Column[] = [];
    let at = 0;
    for (const expected of HEADER) {
      const target = expected.words.join(' ');
      const part: typeof cells = [];
      let label = '';
      while (at < cells.length && target.startsWith(label ? `${label} ${cells[at].normalized}` : cells[at].normalized)) {
        part.push(cells[at++]);
        label = part.map(cell => cell.normalized).join(' ');
        if (label === target) break;
      }
      // MTN emits the same headings either as separate runs ("TRANSACTION", "DATE") or one run
      // ("TRANSACTION DATE"), depending on which report generator produced the PDF.
      if (!part.length || label !== target) return null;
      const last = part.at(-1)!;
      columns.push({ id: expected.id, x: part[0].x, right: last.x + (last.w ?? 0) });
    }
    return { columns, y: line[0].y };
  }
  return null;
}

function columnFor(cell: PdfCell, columns: Column[]) {
  const centre = cell.x + (cell.w ?? 0) / 2;
  for (let i = 0; i < columns.length - 1; i++) {
    const edge = (Math.max(columns[i].right, columns[i].x) + columns[i + 1].x) / 2;
    if ((cell.w ? centre : cell.x + 1) < edge) return i;
  }
  return columns.length - 1;
}

function text(cells: PdfCell[]) {
  const lines: Line[] = [];
  for (const cell of [...cells].sort((a, b) => b.y - a.y || a.x - b.x)) {
    let line = lines.find(row => Math.abs(row[0].y - cell.y) < 1.5);
    if (!line) { line = []; lines.push(line); }
    line.push(cell);
  }
  return lines.map(line => line.sort((a, b) => a.x - b.x).map(cell => cell.text).join(' ')).join(' ')
    .replace(/-\s+/g, '-').replace(/\s+/g, ' ').trim();
}

function statementMeta(page: PdfCell[]): StatementMeta & { wallet?: string } {
  const line = pageLines(page).find(row => row.some(cell => /^MSISDN:?$/i.test(cell.text)) && row.some(cell => /^ACCOUNT(?:\s+HOLDER(?:\s+NAME)?)?:?$/i.test(cell.text)));
  if (!line) return { account: 'MTN MoMo wallet', currency: 'GHS' };
  const msisdnAt = line.findIndex(cell => /^MSISDN:?$/i.test(cell.text));
  const accountAt = line.findIndex((cell, index) => index > msisdnAt && /^ACCOUNT(?:\s+HOLDER(?:\s+NAME)?)?:?$/i.test(cell.text));
  const nameAt = line.findIndex((cell, index) => index > accountAt && /^NAME:?$/i.test(cell.text));
  const wallet = line.slice(msisdnAt + 1, accountAt).find(cell => /^\d{10,15}$/.test(cell.text))?.text ?? '';
  const owner = line.slice(nameAt >= 0 ? nameAt + 1 : accountAt + 1).map(cell => cell.text).join(' ').replace(/-\s+/g, '-').trim();
  return { owner: owner || undefined, wallet: wallet || undefined, account: wallet ? `MTN MoMo ••${wallet.slice(-4)}` : 'MTN MoMo wallet', currency: 'GHS' };
}

/**
 * MTN's official landscape "Mobile Money Transaction History" report.
 *
 * Text in a visual row is emitted on several baselines because names wrap around vertically centred numbers.
 * The date baseline is therefore the row anchor. Wrapped text is bounded by neighbouring rows;
 * financial cells must sit on the date baseline, even when the report is scaled to a smaller page.
 */
export function officialMomoPdfTable(pages: PdfCell[][]): { table: string[][]; text: string; meta: StatementMeta; warnings?: string[] } | null {
  const firstText = (pages[0] ?? []).map(cell => cell.text.toUpperCase()).join(' ');
  if (!/MOBILE\s+MONEY\s+TRANSACTION\s+HISTORY/.test(firstText) || !firstText.includes('MSISDN')) return null;
  const details = statementMeta(pages[0] ?? []);
  if (!details.wallet) throw new Error('The MTN transaction-history report has no readable MSISDN. No partial import was created.');

  const rows: string[][] = [];
  const source: string[] = [];
  const balanceFailures: string[] = [];
  let ignoredZeroEvents = 0;
  for (const [pageIndex, page] of pages.entries()) {
    const header = columnsFor(page);
    if (!header) throw new Error(`MTN transaction-history page ${pageIndex + 1} has an unexpected column layout. No partial import was created.`);
    const anchors = page.filter(cell => cell.y < header.y - 2 && DATE.test(cell.text.trim()) && columnFor(cell, header.columns) === 0);
    if (!anchors.length) throw new Error(`MTN transaction-history page ${pageIndex + 1} has no readable transactions. No partial import was created.`);
    anchors.sort((a, b) => b.y - a.y);
    for (const [index, anchor] of anchors.entries()) {
      const radius = (anchor.h || 8) * 2.6;
      const top = Math.min(header.y - 2, index ? (anchors[index - 1].y + anchor.y) / 2 : anchor.y + radius);
      const bottom = index + 1 < anchors.length ? (anchor.y + anchors[index + 1].y) / 2 : anchor.y - radius;
      const band = page.filter(cell => cell.y < top && cell.y > bottom && Math.abs(cell.y - anchor.y) <= radius);
      const values = new Map<OfficialColumn, string>();
      for (const [columnIndex, column] of header.columns.entries()) {
        const cells = band.filter(cell => columnFor(cell, header.columns) === columnIndex);
        if (['amount', 'fee', 'tax', 'balanceBefore', 'balanceAfter'].includes(column.id)
          && cells.some(cell => Math.abs(cell.y - anchor.y) > Math.max(.5, (anchor.h || 8) * .25))) {
          throw new Error(`MTN transaction-history page ${pageIndex + 1} has misaligned amounts near ${anchor.text}. No partial import was created.`);
        }
        values.set(column.id, text(cells));
      }
      const get = (id: OfficialColumn) => values.get(id)?.trim() ?? '';
      const date = get('date');
      const amount = get('amount').replace(/,/g, '');
      const fee = get('fee').replace(/,/g, '');
      const tax = get('tax').replace(/,/g, '');
      const before = get('balanceBefore').replace(/,/g, '');
      const after = get('balanceAfter').replace(/,/g, '');
      if (!DATE.test(date.split(/\s+/)[0]) || ![amount, fee, tax, before, after].every(value => MONEY.test(value))) {
        throw new Error(`MTN transaction-history page ${pageIndex + 1} has an incomplete transaction near ${anchor.text}. No partial import was created.`);
      }
      if (Number(amount) === 0) {
        if (Number(fee) === 0 && Number(tax) === 0 && Math.abs(Number(before) - Number(after)) <= .011) {
          // MTN records MoMoBoost DEBT_REPAYMENT markers beside the real incoming transaction. They move no money,
          // often reuse that transaction's ID, and must not become ledger entries.
          ignoredZeroEvents++;
          continue;
        }
        throw new Error(`MTN transaction-history page ${pageIndex + 1} has a zero-amount row that changes fees or balance near ${anchor.text}.`);
      }
      const outgoing = get('fromNumber').replace(/\D/g, '') === details.wallet;
      const incoming = get('toNumber').replace(/\D/g, '') === details.wallet;
      if (outgoing === incoming) throw new Error(`MTN transaction-history page ${pageIndex + 1} has an ambiguous transaction direction near ${anchor.text}.`);
      const signed = `${outgoing ? '-' : ''}${amount}`;
      const reference = [get('reference'), get('ova')].filter(Boolean).join(' · ');
      const counterparty = outgoing
        ? get('toName') || reference || get('type')
        : get('fromName') || get('reference') || 'Money received';
      const expected = Number(before) + (incoming ? Number(amount) : -Number(amount)) - Number(fee) - Number(tax);
      if (Math.abs(expected - Number(after)) > .011) balanceFailures.push(get('id') || date);
      rows.push([date, counterparty, signed, fee, after, get('id'), reference, 'GHS', get('type'), tax]);
      source.push([...values.values()].join(' | '));
    }
  }
  if (!rows.length) throw new Error('The MTN transaction-history report contained no transactions.');
  if (balanceFailures.length > Math.max(10, rows.length * .02)) throw new Error('Too many MTN rows fail the balance-before/balance-after check. No partial import was created.');
  return {
    table: [['date', 'name', 'amount', 'fee', 'balance', 'transaction_id', 'reference', 'currency', 'payment_type', 'tax'], ...rows],
    text: source.join('\n'),
    meta: details,
    warnings: [
      ...(ignoredZeroEvents ? [`Ignored ${ignoredZeroEvents} MTN system ${ignoredZeroEvents === 1 ? 'event' : 'events'} that had zero amount, zero fees and no balance change.`] : []),
      ...(balanceFailures.length ? [`${balanceFailures.length} MTN payment rows do not follow the printed balance-before/balance-after equation. They were kept for review because the remaining rows verified. Check transaction IDs: ${balanceFailures.join(', ')}.`] : []),
    ],
  };
}
