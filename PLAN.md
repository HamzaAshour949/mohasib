# Mohasib v2 — Active Plan

Last updated: 2026-04-26.

The repository contains a working Electron/React/SQLite implementation of Mohasib v2. This is the only implementation target.

The app runs with no license key, no account and no activation server, and it must stay that way: there is no gate to satisfy, so there is nothing to add one for.

**Current shipped scope:** local-first halal accounting, Arabic-first with English mode, strict no-riba/no-tax compliance, SQLite company database, macOS arm64 package, and deterministic posting/audit behavior.

**Aseel manual coverage pass:** the 570-page Aseel manual is image-only, so the book was OCRed with macOS Vision into a temporary text corpus. The audit covered accounting groups, files/tools, group/system constants, accounts, vouchers, cheques, inventory, manufacturing, sales, purchases, payroll, reports, and maintenance tools. See [context.md](context.md) for the current coverage matrix and implementation context.

**Implemented since the earlier gap analysis:**
- Departments, projects, funders, currencies, exchange rates, expense categories
- Stock movements: transfer, adjust in/out, opening balance, stock count (`جرد`)
- Quotes and orders for sales/purchases, including conversion to invoices
- Expense vouchers
- Employee master and payroll sheets without tax automation
- Fixed-asset register and straight-line depreciation
- Period locks, backup/restore, audit report, year-end rollover
- Banks/branches, debit/credit notes, multi-party receipt/payment vouchers
- Credit-limit and due-days enforcement on credit invoices
- Reorder-alert and bank-liquidity reports
- Group notes shown once at app open
- Hijri date display in Arabic dashboard context
- Ledger drill-back to source document routes
- Manufacturing formulas/BOMs and production runs
- Account budgets plus budget-vs-actual report

**Deliberate halal exclusions:** VAT/sales tax, withholding/source tax, income-tax payroll automation, social-insurance/tax pages, interest income/expense, late-interest, APR, amortization, and any tax filing/optimization workflow. Neutral fees and ordinary government/service expenses can be recorded as expenses without tax automation.

**Remaining optional enhancements after the current parity pass:** multi-company switcher, multi-user permissions, dedicated shipment/delivery-note documents, advanced item units/conversions, multiple barcodes per unit, batch/expiry tracking, salesperson/driver/freight fields, user-editable report templates, file/image attachments, document numbering books, and full FX revaluation.

**Deliberately not planned:** license files, activation servers, entitlement
checks, device binding, seat limits, trial periods, and paid tiers. Mohasib is
a local-first application that opens straight into the ledger. An earlier
revision of this file specified all of it in detail — signed license payloads,
an online activation service, `src/licensing/`, offline grace periods, and a
per-company annual subscription. None of it was ever built, and it is not going
to be. The full text stays recoverable from git history.
