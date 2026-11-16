export type Field = 'date' | 'time' | 'name' | 'amount' | 'debit' | 'credit' | 'fee' | 'balance' | 'id' | 'reference' | 'currency' | 'type' | 'tax';

/** Headers providers print that mark a column boundary but are not imported. */
const IGNORED = ['valuedate', 'cheque', 'chequenumber', 'chequeno', 'chqno', 'instrumentno', 'instrumentnumber', 'branch', 'channel', 'sn', 'no'];
export const isIgnoredHeader = (value: string) => IGNORED.includes(normalize(value));

const aliases: Record<Field, string[]> = {
  type: ['paymenttype', 'type', 'transactiontype', 'transtype', 'operationtype'],
  tax: ['tax', 'transactiontax', 'elevy', 'levy'],
  date: ['date', 'datetime', 'transactiondate', 'transactiondatetime', 'trandate', 'txndate', 'postdate', 'postingdate', 'bookingdate', 'transdate', 'effectivedate', 'processeddate'],
  time: ['time', 'transactiontime', 'transtime', 'postingtime'],
  name: ['name', 'description', 'details', 'recipient', 'counterparty', 'transactiondetails', 'narrative', 'particulars', 'remarks', 'transactiondescription', 'narration', 'beneficiary', 'merchant', 'memo', 'payee', 'sender', 'transactionnarrative'],
  amount: ['amount', 'signedamount', 'transactionamount', 'netamount', 'transactionvalue', 'movement'],
  debit: ['debit', 'debits', 'moneyout', 'paidout', 'withdrawal', 'withdrawals', 'debitamount', 'withdrawalamount', 'outflow', 'dr'],
  credit: ['credit', 'credits', 'moneyin', 'paidin', 'deposit', 'deposits', 'creditamount', 'depositamount', 'inflow', 'cr'],
  fee: ['fee', 'fees', 'charge', 'charges', 'transactionfee', 'servicefee', 'commission'],
  balance: ['balance', 'runningbalance', 'balanceafter', 'closingbalance', 'availablebalance', 'ledgerbalance', 'bookbalance', 'runningtotal', 'fundsleft'],
  id: ['id', 'transactionid', 'transactionno', 'transactionnumber', 'transactioncode', 'receiptno', 'receiptid'],
  reference: ['reference', 'ref', 'refno', 'referenceno', 'referencenumber', 'transactionreference', 'externalreference'],
  currency: ['currency', 'currencycode', 'ccy'],
};

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z]/g, '').replace(/ghs$/, '');

/** Exact aliases first, followed by conservative semantic matches for unfamiliar but descriptive headings. */
export function fieldFor(value: string): Field | undefined {
  const key = normalize(value);
  const exact = (Object.keys(aliases) as Field[]).find(field => aliases[field].includes(key));
  if (exact) return exact;
  if (/^(?:transaction|posting|booking|processed|effective).*date(?:time)?$/.test(key)) return 'date';
  if (/^(?:transaction|posting).*time$/.test(key)) return 'time';
  if (/^(?:transaction)?(?:description|narrative|narration|counterparty|beneficiary|recipient|merchant|payee|details|particulars)(?:details|name)?$/.test(key)) return 'name';
  if (/^(?:(?:available|closing|running|ledger|book)balance(?:after)?|balanceafter|runningtotal|fundsleft)$/.test(key)) return 'balance';
  if (/^(?:total)?(?:debit|withdrawal|moneyout|outflow|paidout)(?:amount)?$/.test(key)) return 'debit';
  if (/^(?:total)?(?:credit|deposit|moneyin|inflow|paidin)(?:amount)?$/.test(key)) return 'credit';
  if (/^(?:transaction|service)?(?:fee|charge|commission)s?$/.test(key)) return 'fee';
  if (/^(?:transaction)?(?:tax|levy)$/.test(key)) return 'tax';
  if (/^(?:signed|transaction|net)?(?:amount|value|movement)$/.test(key)) return 'amount';
  if (/^(?:transaction)?(?:currency|ccy)(?:code)?$/.test(key)) return 'currency';
  if (/^(?:transaction|external)?(?:reference|refno|referenceno)$/.test(key)) return 'reference';
  if (/^(?:transaction|receipt)(?:id|no|number|code)$/.test(key)) return 'id';
  return undefined;
}

export function validHeaders(fields: (Field | undefined)[]) {
  return fields.includes('date') && fields.includes('name') &&
    (fields.includes('amount') || (fields.includes('credit') && fields.includes('debit')));
}
