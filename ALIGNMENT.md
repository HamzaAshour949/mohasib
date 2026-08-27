# Mohasib v2 ↔ Aseel Alignment Audit

Last updated: 2026-04-26.

Source material: Aseel 570-page manual under `aseel_book/`. The PDF is scanned/image-only, so this pass used macOS Vision OCR over `aseel_book/pages/1.jpg` through `aseel_book/pages/570.jpg`, producing a temporary 29,701-line corpus at `/tmp/mohasib_aseel_ocr.txt`.

Legend:

- Done: implemented in Mohasib v2 backend and UI.
- Alternative: covered by a simpler/current Mohasib workflow rather than copied exactly.
- Excluded: intentionally omitted because it is tax/riba-oriented or conflicts with the halal product policy.
- Future: optional later enhancement, not required for the current halal parity pass.

## Done

### Accounting Core

- Hierarchical chart of accounts with Arabic/English names, type, parent code, currency, active flag.
- Manual journal vouchers with balanced debit/credit validation.
- Automatic posting from invoices, vouchers, cheques, expenses, payroll, assets, notes, multi-vouchers, stock adjustments, and manufacturing.
- Trial balance, account ledger, income statement, balance sheet, dashboard.
- Period locks, audit report, year-end rollover.
- Account budgets and budget-vs-actual report.

### Cash, Cheques, Banks

- Cashbox master linked to GL accounts.
- Receipt vouchers and payment vouchers.
- Multi-party receipt/payment vouchers.
- Incoming and outgoing cheques with lifecycle posting.
- Bank/branch master used by cheque entry.
- Bank-liquidity report.

### Inventory and Manufacturing

- Item master with barcode, one unit, five sale prices, five purchase prices, weighted-average cost, min/reorder/max levels, stock/service/non-stock kind, notes.
- Warehouse master and item stock by warehouse.
- Barcode scanner support in invoice entry.
- Stock movements: transfer, adjust-in, adjust-out, opening balance.
- Stock-count (`جرد`) UI that posts only quantity differences.
- Reorder-alert report.
- Manufacturing formulas/BOMs, component lines, waste percentage, production runs, stock consumption/receipt, and inventory-value reclassification entry.

### Sales and Purchases

- Sales invoices, purchase invoices, sales returns, purchase returns.
- Cash and credit invoice posting.
- Credit-limit and due-days enforcement for credit sales.
- Sale and purchase quotations.
- Sale and purchase orders.
- Quote/order to invoice conversion.
- Sales and purchases summary reports.

### Parties and Dimensions

- Customer/supplier/both/employee party master.
- AR/AP account linkage for parties.
- Due days, credit limit, price tier, default warehouse fields.
- Departments, projects, and funders.
- Expense categories.

### Notes, Payroll, Assets

- Debit/credit notes for customers and suppliers.
- Employee master and payroll sheets without tax automation.
- Fixed assets and straight-line depreciation.
- Group notes shown once at app open.
- Hijri date display in Arabic dashboard context.

### Reports and Output

- Core reports: trial balance, ledger, party statement, inventory balance, inventory movement, sales/purchases summaries, AR/AP aging, income statement, balance sheet, reorder alert, bank liquidity, budget-vs-actual, audit report.
- CSV export and print support for reports.
- Invoice print support and app-level print menu.
- Drill-back from ledger rows to known source document routes.

## Alternative Coverage

- Aseel's very large static report catalog is represented by curated core reports with filtering, CSV export, and print. This is intentionally leaner and easier to maintain.
- Aseel cashier/POS basics are covered by cash invoices plus barcode entry. Hospitality/KDS/tables/loyalty are outside current accounting scope.
- Shipments/delivery notes are covered operationally by orders, invoices, and stock movements. A dedicated unbilled shipment document is a possible later enhancement, but stock/accounting consequences are already supported.
- Import landed costs and customs/tax pages are represented by purchase invoice fees plus neutral expense vouchers. Tax/customs reporting remains excluded.
- Data repair/rebuild tooling is represented by audit checks, deterministic posting, period locks, backup/restore, and rollover instead of destructive repair utilities.

## Excluded by Halal Policy

- VAT / sales tax automation.
- Withholding/source tax workflows.
- Income-tax payroll calculations.
- Social-insurance tax pages.
- Interest income, interest expense, late-payment interest, APR, amortization, compounding penalties.
- Tax statement generation, tax filing helpers, and tax optimization/reporting language.

Neutral government or service payments may be entered as ordinary expenses, but Mohasib should not calculate or promote tax/interest workflows.

## Future Enhancements

- Multi-company/accounting-group switcher.
- Multi-user login and granular permissions.
- Dedicated shipment/delivery note documents with unbilled follow-up.
- Advanced item units/conversions and multiple barcodes per unit.
- Batch/lot/expiry stock tracking.
- Salesperson, driver, vehicle, freight, and route fields.
- User-editable report designer/templates.
- Image/file attachments on master cards and documents.
- Document numbering books beyond simple prefix serials.
- Full realized/unrealized FX revaluation.

## Current Verdict

Mohasib v2 now covers the halal accounting, cash, cheque, inventory, quote/order/invoice, note, payroll, asset, budget, manufacturing, and core-report surface identified from the Aseel manual. Remaining gaps are either deliberately excluded because they are tax/riba-oriented, covered by simpler current workflows, or optional advanced operational breadth for later releases.
