// SQL SELECT fragments that alias snake_case columns to camelCase keys
// to match the shared TS interfaces.

export const ACCOUNT_COLS = `
  id,
  code,
  name,
  name_en AS nameEn,
  type,
  parent_code AS parentCode,
  currency,
  is_party AS isParty,
  party_id AS partyId,
  is_active AS isActive
`;

export const PARTY_COLS = `
  id,
  code,
  name,
  name_en AS nameEn,
  kind,
  phone,
  email,
  address,
  ar_account_id AS arAccountId,
  ap_account_id AS apAccountId,
  notes
`;

export const WAREHOUSE_COLS = `
  id, code, name, name_en AS nameEn, is_default AS isDefault
`;

export const ITEM_COLS = `
  id, code, barcode, name, name_en AS nameEn, unit,
  sale_price_1 AS salePrice1, sale_price_2 AS salePrice2, sale_price_3 AS salePrice3,
  sale_price_4 AS salePrice4, sale_price_5 AS salePrice5,
  purchase_price_1 AS purchasePrice1, purchase_price_2 AS purchasePrice2, purchase_price_3 AS purchasePrice3,
  purchase_price_4 AS purchasePrice4, purchase_price_5 AS purchasePrice5,
  currency,
  avg_cost_minor AS avgCostMinor,
  min_qty AS minQty,
  reorder_qty AS reorderQty,
  max_qty AS maxQty,
  item_type AS itemType,
  notes
`;

export const CASHBOX_COLS = `
  id, code, name, currency, account_id AS accountId, is_default AS isDefault
`;

export const INVOICE_COLS = `
  id, kind, serial, date, party_id AS partyId, warehouse_id AS warehouseId,
  payment_mode AS paymentMode, cashbox_id AS cashboxId, currency,
  subtotal_minor AS subtotalMinor, inv_discount_minor AS invDiscountMinor,
  fees_minor AS feesMinor, grand_total_minor AS grandTotalMinor,
  notes, journal_id AS journalId
`;

export const INVOICE_LINE_COLS = `
  id, invoice_id AS invoiceId, item_id AS itemId, qty,
  unit_price_minor AS unitPriceMinor, discount_minor AS discountMinor, total_minor AS totalMinor
`;

export const VOUCHER_COLS = `
  id, kind, serial, date, party_id AS partyId, cashbox_id AS cashboxId,
  currency, amount_minor AS amountMinor, notes, journal_id AS journalId
`;

export const CHEQUE_COLS = `
  id, serial, number, bank, date, due_date AS dueDate,
  party_id AS partyId, cashbox_id AS cashboxId, direction, status,
  currency, amount_minor AS amountMinor, notes
`;

export const JOURNAL_COLS = `
  id, date, reference, memo, source_type AS sourceType,
  source_id AS sourceId, total_minor AS totalMinor, currency, created_at AS createdAt
`;

export const JLINE_COLS = `
  id, entry_id AS entryId, account_id AS accountId,
  debit_minor AS debitMinor, credit_minor AS creditMinor, currency, memo
`;
