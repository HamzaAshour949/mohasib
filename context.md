# Mohasib Context

Last updated: 2026-04-26

## Current implementation

Mohasib is currently an Electron + React + SQLite local-first accounting app, not the older Qt-only concept described in the original long-range product plan. The current working package is macOS arm64 and uses:

- Electron 32.3.3, electron-vite, electron-builder
- React 18, TanStack Query, react-i18next, Tailwind
- better-sqlite3 with local DB at `~/Library/Application Support/mohasib/companies/default.db`
- Money as integer minor units stored as text strings
- Strict halal policy: riba/interest/tax terminology is blocked or warned by compliance rules; tax/VAT/withholding automation is intentionally excluded

## Aseel book audit source

The Aseel manual PDF is image-only. I used macOS Vision OCR over `aseel_book/pages/1.jpg` through `aseel_book/pages/570.jpg`, producing a temporary 29,701-line corpus at `/tmp/mohasib_aseel_ocr.txt` for this audit.

Key manual headings and terms found during the pass:

- Core: accounting groups, group constants, system constants, chart of accounts, files/tools
- Accounting: journal, departments/cost centers, funders, assets, budgets
- Cash: receipt/payment vouchers, multi-party receipts/payments, cost centers
- Cheques: incoming and outgoing lifecycle
- Inventory: item cards, warehouses, barcode, min/reorder/max, manufacturing formulas, production, stock movements
- Sales/Purchases: customers, suppliers, quotes, orders, shipments/delivery notes, cashier/POS, invoices
- Payroll: employee card and payroll sheets
- Reports: trial balance, ledger, account/customer/supplier/employee/item reports, cheque reports, liquidity, invoices/notes, payroll, income/expense
- Tools: backup/restore, audit/check, close/rollover, renumbering, copy/import, rebuild entries and manufacturing movements
- Excluded by policy: VAT/sales tax, withholding/source tax, income tax, social-insurance/tax settings, interest/riba flows

## Implemented coverage

### Core accounting

- Chart of accounts with hierarchy, account type, currency, active flag
- Manual balanced journal entries
- Automatic postings from invoices, vouchers, cheques, expenses, payroll, assets, notes, multi-vouchers, stock adjustments, manufacturing
- Audit log for important mutations
- Period locks and year-end rollover
- Backup and restore
- Islamic compliance checker in strict/warn modes

### Master data

- Accounts
- Parties: customers, suppliers, both, employees
- Items with barcode, Arabic/English names, one unit, five sale prices, five purchase prices, weighted average cost, min/reorder/max stock thresholds, service/non-stock/stock kinds, notes
- Warehouses
- Cashboxes linked to GL accounts
- Banks and branches
- Departments
- Projects
- Funders
- Expense categories
- Currencies and exchange rates
- Employees
- Fixed assets
- Manufacturing formulas / BOMs
- Account budgets

### Documents and operations

- Sales invoices
- Purchase invoices
- Sales returns
- Purchase returns
- Receipt vouchers
- Payment vouchers
- Multi-party receipt vouchers
- Multi-party payment vouchers
- Expense vouchers
- Incoming cheques
- Outgoing cheques
- Manual stock transfers
- Adjust-in, adjust-out, opening stock movements
- Stock-count UI (`جرد`) that computes and posts differences as stock adjustments
- Manufacturing production runs: consumes component stock and receives finished item stock
- Quotes: sale and purchase
- Orders: sale and purchase
- Quote/order to invoice conversion
- Debit and credit notes for customers and suppliers
- Payroll sheets without tax automation
- Fixed-asset depreciation

### Reports and analysis

- Dashboard
- Trial balance
- General ledger / account ledger
- Party statement
- Inventory balance
- Inventory movement
- Sales summary
- Purchases summary
- AR aging
- AP aging
- Income statement
- Balance sheet
- Reorder alert
- Bank liquidity
- Budget vs actual
- Audit report
- CSV export and print support through `ExportPrintBar`
- Ledger drill-back to source documents where source type is known

### Recent additions from this audit

- Manufacturing formulas and production runs
  - Tables: `manufacturing_formulas`, `manufacturing_formula_lines`, `manufacturing_runs`
  - IPC: `mfg:formulas:*`, `mfg:runs:*`
  - UI: `src/routes/Manufacturing.tsx`
  - Nav route: `/manufacturing`
  - Journal source: `manufacturing`

- Budgets and budget-vs-actual reporting
  - Table: `account_budgets`
  - IPC: `budget:list`, `budget:save`, `budget:delete`, `budget:report`
  - UI: `src/routes/Budgets.tsx`
  - Report tab: `/reports/budget`
  - Nav route: `/budgets`

## Covered by superior/current alternatives

These Aseel concepts are covered by a simpler or safer current Mohasib equivalent rather than copied exactly:

- Large report catalog: Mohasib uses curated core reports with CSV/print export instead of hundreds of static report names.
- Cashier basics: barcode-driven cash invoices cover the halal accounting core; hospitality/KDS/loyalty/table service are outside the current accounting scope.
- Shipments/delivery notes: current workflows use orders, invoices, and stock movements. A dedicated unbilled shipment document remains a possible enhancement, but current stock movement + order/invoice conversion covers inventory/accounting consequences without tax/shipment-specific complexity.
- Customs/import-cost VAT pages: neutral fees can be recorded through purchase invoice fees and expense vouchers. VAT/customs-tax reporting is intentionally excluded.
- Data maintenance/rebuild tools: period locks, audit report, backup/restore, and deterministic posting cover the main safety need without destructive repair utilities.

## Intentional halal exclusions

Do not implement these as first-class features:

- VAT / sales tax automation
- Withholding / source tax workflows
- Income-tax payroll calculations
- Social-insurance tax pages
- Interest income, interest expense, late-payment interest, APR, amortization, compounding penalties
- Tax statement generation or tax filing helpers

Neutral government or service payments may be recorded as ordinary expenses, but the app should not optimize, calculate, or promote tax/interest workflows.

## Remaining optional gaps

These are not blockers for the current halal parity pass, but may be future enhancements:

- Multi-company / accounting-group switcher
- Multi-user login and granular permissions
- Dedicated shipment/delivery note documents with unbilled shipment follow-up
- Advanced item units/conversions and multiple barcodes per unit
- Batch/lot/expiry tracking
- Salesperson/driver/vehicle/freight operational fields
- User-editable report designer/templates
- Image/file attachments on cards and documents
- Document numbering books beyond prefix-based serials
- Full multi-currency realized/unrealized FX revaluation

## Verification commands

Use these before shipping changes:

```bash
npx tsc --noEmit
npm rebuild better-sqlite3
npx tsx scripts/e2e-test.ts
npx electron-builder install-app-deps
npx electron-vite build
npx electron-builder --mac --arm64 -c.compression=store
codesign --force --deep --sign - release/mac-arm64/Mohasib.app
xattr -cr release/mac-arm64/Mohasib.app
```
