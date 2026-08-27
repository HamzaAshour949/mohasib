import type { AccountType } from '../domain/Account';

// Plain serializable types used over IPC. bigint is encoded as string at the IPC boundary
// (Electron's structured-clone supports bigint, but we standardize on strings for forward-compat
// with electron-builder ASAR and JSON tools). The renderer wraps API calls and converts.

export interface Account {
  id: number;
  code: string;
  name: string;
  nameEn: string | null;
  type: AccountType;
  parentCode: string | null;
  currency: string;
  isParty: 0 | 1;
  partyId: number | null;
  isActive: 0 | 1;
}

export type PartyKind = 'customer' | 'supplier' | 'both' | 'employee';

export interface Party {
  id: number;
  code: string;
  name: string;
  nameEn: string | null;
  kind: PartyKind;
  phone: string | null;
  email: string | null;
  address: string | null;
  taxId: null; // intentionally always null — no tax workflows
  arAccountId: number | null;
  apAccountId: number | null;
  notes: string | null;
}

export interface Warehouse {
  id: number;
  code: string;
  name: string;
  nameEn: string | null;
  isDefault: 0 | 1;
}

export interface Item {
  id: number;
  code: string;
  barcode: string | null;
  name: string;
  nameEn: string | null;
  unit: string;
  // 5 sale prices + 5 purchase prices (minor units, as strings over IPC)
  salePrices: [string, string, string, string, string];
  purchasePrices: [string, string, string, string, string];
  currency: string;
  minQty: string;       // decimal string
  reorderQty: string;
  maxQty: string;
  itemType: 'stock' | 'service' | 'non_stock';
  notes: string | null;
}

export interface Cashbox {
  id: number;
  code: string;
  name: string;
  currency: string;
  accountId: number;
  isDefault: 0 | 1;
}

export type InvoiceKind = 'sale' | 'purchase' | 'sale_return' | 'purchase_return';
export type PaymentMode = 'cash' | 'credit';

export interface InvoiceLine {
  id?: number;
  itemId: number;
  itemCode: string;
  itemName: string;
  qty: string;            // decimal as string
  unitPriceMinor: string; // bigint as string
  discountMinor: string;  // bigint as string
  totalMinor: string;     // bigint as string
}

export interface Invoice {
  id?: number;
  kind: InvoiceKind;
  serial: string;
  date: string;
  partyId: number;
  warehouseId: number;
  paymentMode: PaymentMode;
  cashboxId: number | null;
  currency: string;
  subtotalMinor: string;
  invDiscountMinor: string;
  feesMinor: string;       // neutral fees (NEVER tax)
  grandTotalMinor: string;
  notes: string | null;
  journalId: number | null;
  lines: InvoiceLine[];
}

export type VoucherKind = 'receipt' | 'payment';

export interface Voucher {
  id?: number;
  kind: VoucherKind;
  serial: string;
  date: string;
  partyId: number;
  cashboxId: number;
  currency: string;
  amountMinor: string;
  notes: string | null;
  journalId: number | null;
}

export type ChequeStatus =
  | 'received'    // we received a customer cheque
  | 'deposited'   // sent to bank for collection
  | 'cleared'     // bank confirmed funds
  | 'returned'    // bounced
  | 'endorsed'    // we transferred to a supplier
  | 'cancelled'
  // outgoing cheques we issued
  | 'issued'
  | 'paid';

export interface Cheque {
  id?: number;
  serial: string;
  number: string;            // bank cheque number
  bank: string | null;
  date: string;              // cheque face date
  dueDate: string;           // when collectable
  partyId: number;
  cashboxId: number | null;  // null for issued
  direction: 'in' | 'out';
  status: ChequeStatus;
  currency: string;
  amountMinor: string;
  notes: string | null;
}

export interface JournalLineDto {
  accountId: number;
  debitMinor: string;
  creditMinor: string;
  currency: string;
  memo?: string;
}

export interface JournalEntryDto {
  id?: number;
  date: string;
  reference?: string;
  memo?: string;
  sourceType?: string; // 'manual' | 'invoice' | 'voucher' | 'cheque'
  sourceId?: number | null;
  lines: JournalLineDto[];
}

export interface SaveResult {
  ok: boolean;
  id?: number;
  error?: string;
  warning?: string;
}

export interface AppSettings {
  companyName: string;
  companyNameEn: string;
  defaultCurrency: string;
  language: 'ar' | 'en';
  policyMode: 'strict' | 'warn';
  fiscalYearStart: string; // 'MM-DD'
  logoPath: string | null;
  groupNotes: string;
}
