## Current Active Plan — Mohasib v2 Electron Implementation

Last updated: 2026-04-26.

The repository currently contains a working Electron/React/SQLite implementation of Mohasib v2. The older Qt/C++ plan below remains useful as a long-range product direction, but the active implementation target is the shipped Electron app in this workspace.

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

## Plan: Islamic Golden Aseel Competitor

Build a lightweight, native C++ accounting and inventory app that competes with Golden Aseel on breadth, Arabic-first workflows, offline reliability, keyboard speed, and report depth, while differentiating through modern cross-platform support and an explicitly interest-free, tax-free Islamic accounting policy. The recommended foundation is a Qt 6 LTS/C++ app with a shared C++ domain core, native desktop packages for Windows/macOS/Linux, and tablet builds for iPadOS and Android 2020+ devices.

**Research Findings: Golden Aseel Surface**
1. Product identity: Golden Aseel is an Arabic-first Windows desktop accounting and management system from CastleSoft, positioned as a mature SME ERP for trading, import/export, retail, factories, hospitals, services, and accounting offices.
2. Platform clue: the website states it is designed specifically for Windows, with keyboard workflows similar to DOS-era systems and mouse support.
3. Download clue: public demo is about 53 MB, with separate dictionary, HR demo, income-tax reference, and TeamViewer support downloads.
4. Major modules discovered:
   - Accounts and journal entries: unlimited account tree levels, account currency, budgets, commercial discounts, withholding/source discount, opening date/user, employee account data, compound journal entries.
   - Products and warehouses: five sale prices and five purchase prices per item, per-item currency/pricing, per-item VAT, numeric and alphanumeric item codes, multiple units, min/reorder/max stock limits, extra quantity rules, item types, manufacturing formulas, unit cost calculation, multiple warehouses, item conversion, branch/warehouse transfer, fast inventory valuation.
   - Branches: per-branch and consolidated reports/balance sheets.
   - Books/serials: up to 20 books per document type, independent serial numbers, optional manual numbers.
   - Cash boxes: payment/receipt vouchers can use any cashbox or account.
   - Currencies: up to 32 currencies across accounts, journal entries, vouchers, cheques, invoices, credit/debit notes, payroll, shipments, and automatic FX-difference journal entries.
   - Vouchers: receipt/payment vouchers, source discount amount/rate, batch voucher entry.
   - Shipments: transport shipments, link one/many shipments to invoices or customs declarations, transport fees with accounting entries.
   - Invoices: sales, purchases, returns, service invoices, customs invoices, line and invoice discounts, quantity extras, attached voucher, multiple services/expenses per invoice, clearance invoice number, debit/credit notes.
   - Quotations: customer/supplier quotations, convert to invoices or shipments, reuse quote prices in invoices.
   - Orders: supplier/customer orders, convert to invoices/shipments, aggregate item orders from multiple customers then split into shipments/invoices.
   - Cheques: lifecycle tracking for deposit, withdrawal, return, endorsement, etc., with journal entries and FX differences.
   - Payroll/wages: income tax calculation, allowances/deductions from employee account, per-employee payroll accounts, cash payment or transfer to employee account.
   - Exchange rates: up to 32 currencies, date/time-specific rates, editable currency names, historical daily USD/JOD rates since 1986.
   - VAT statement: create/modify statements, calculate assets and VAT, calculate clearance invoice totals and VAT.
   - Import costs: estimate landed unit cost before sale, archive import shipment costs for future buying decisions.
   - Balance sheet: period/currency-specific balance sheet, multiple ending inventory valuation methods, closing entries.
   - Reports: 550+ built-in reports, user-added/user-edited reports without programming, company logo support, screen/print output, save report to file and reopen later.
   - Charts/analysis: item balances, item movements, month-to-month stock changes, average sale/purchase prices, account balances, month-to-month account changes, currency movement.
   - Navigation: drill from account movements to original invoice/shipment/cheque/voucher, create accounts/items inline while entering transactions.
   - Help: field tooltips, companion explanation, detailed F1 help.
   - Other: data storage/check/maintenance tools, import/export to Word/Excel and other programs, editable data entry forms, editable command menu.
5. Competitive implication: parity requires a real ERP core, not only bookkeeping. The initial MVP should cover accounting, inventory, invoices, vouchers, multi-currency, reports, and traceability, then expand to payroll, import costing, manufacturing, and advanced analytics.

**Recommended Product Direction**
1. Working positioning: "Islamic, local-first accounting for Arabic SMEs: fast like a native desktop app, portable like a tablet app, and free from riba/tax workflow assumptions."
2. Audience: Arabic-speaking SMEs, traders, distributors, wholesalers, small manufacturers, shops, and accountants who want offline reliability and Islamic accounting constraints.
3. Religious stance: implement a Salafi-oriented policy pack as product configuration and educational guidance, referencing rulings from scholars such as Ibn Baz, Ibn Uthaymeen, and Uthman Al-Khamees where applicable. Do not turn the software into a fatwa engine; include scholar-reviewed accounting rules and clear disclaimers that business/legal obligations vary by jurisdiction.
4. Important legal boundary: "No taxes" should mean no VAT/sales-tax/income-tax automation, no tax-led workflow, and no promotion of tax collection as a feature. The app should not instruct users to evade binding local law. If a user must record a government fee or tax payment, allow neutral manual expense recording without tax optimization/reporting language.
5. Interest-free boundary: block or warn on riba-related constructs: interest income, interest expense, interest-bearing loans, late-payment interest, compounding penalties, APR fields, amortization schedules with interest, and bank reconciliation categories that imply interest revenue. Support permissible alternatives as data structures: cash sales, deferred payment without interest, installments with fixed sale price, profit-sharing notes, mudarabah/musharakah-style references if scholar-reviewed, zakat/charity tracking, and penalty-to-charity workflows only after review.

**Architecture Recommendation**
1. Use C++20 or C++23 with Qt 6 LTS as the universal UI/application framework.
2. Use Qt Quick/QML for responsive desktop/tablet UI, backed by C++ models and services. This gives native Windows, macOS Intel, macOS Apple Silicon, Linux, iPadOS, and Android builds from one UI system while keeping performance far above Electron-style stacks.
3. Build the accounting/business rules as a pure C++ domain core independent of Qt UI. Qt can wrap it at the app boundary, but posting rules, inventory valuation, currency conversion, and Islamic compliance policies should be testable without UI.
4. Use SQLite as the embedded local database for MVP, with WAL mode, migrations, strict schema, and integer minor-unit money storage. Add SQLCipher or platform keystore-backed encryption for commercial builds.
5. Use an append-only audit journal/event table for every accounting-impacting action. Documents may be edited through reversals/amendments rather than destructive mutation after posting.
6. Use optional sync later, not in the first core. A future sync layer can replicate company files through an encrypted service, but the first release should be excellent offline.
7. Use CMake, vcpkg or Conan for dependencies, and CI builds for:
   - Windows x64 (Windows 7 SP1+, Windows 8.1, Windows 10, Windows 11)
   - macOS universal (x86_64 + arm64 native)
   - Linux: DEB packages (Debian/Ubuntu), RPM packages (Fedora/CentOS/RHEL), Arch PKGBUILD, AppImage, and Flatpak
   - Android arm64-v8a (Android 10+)
   - iPadOS arm64 (iPadOS 16+)
8. Avoid heavy background services. Default to on-demand calculations, incremental indexes/materialized summaries, and suspend-friendly timers to preserve tablet battery.

**Platform Targets**
1. Windows: Windows 7 SP1+, Windows 8.1, Windows 10 22H2+, and Windows 11, x64 first; consider ARM64 later only if demand appears. Ensure Visual C++ runtime compatibility for older systems.
2. macOS: universal app bundle supporting Intel x86_64 and Apple Silicon arm64 natively. Use hardened runtime, notarization, and signed auto-updates.
3. Linux: Multi-distribution support with three packaging options:
   - **DEB-based** (Debian, Ubuntu, Linux Mint, Pop!_OS): native .deb package for apt/dpkg.
   - **RPM-based** (Fedora, CentOS, Red Hat, openSUSE): native .rpm package for dnf/yum/zypper.
   - **Arch-based** (Arch Linux, Manjaro, EndeavourOS): native PKGBUILD or bin package for pacman.
   - **Universal fallback**: AppImage for broad compatibility across distributions; Flatpak for sandboxed store distribution.
   Support glibc 2.28+ and Linux kernel 5.0+; x86_64 primary, ARM64 (aarch64) secondary.
4. iPadOS: iPadOS 16+ recommended for modern Qt/iOS support and long enough device life.
5. Android tablets: Android 10+ recommended for "2020+" devices, arm64-v8a only, with adaptive tablet layouts and no 32-bit build unless a paying segment requires it.

**Feature Roadmap**
1. Phase 0: Product Definition and Compliance Rules
   - Define app name, Arabic/English terminology, target countries, and the default "no tax/no interest" policy.
   - Create a Sharia/accounting rule register: disallowed fields, warnings, allowed alternatives, and scholar references.
   - Decide whether the app will be Arabic-only at launch or Arabic-first bilingual.
2. Phase 1: Accounting Core MVP
   - Company file creation, users/roles, fiscal years, periods, chart of accounts, unlimited account tree, cost centers/departments, opening balances.
   - Compound journal entries, posting validation, audit log, reversal entries, attachments, search.
   - Multi-currency accounts and transactions, exchange rate table, automatic FX-difference entries with clear non-interest labeling.
   - No VAT/tax forms, no interest categories, and validation warnings for prohibited account names/types.
3. Phase 2: Cash, Vouchers, and Cheques
   - Multiple cash boxes/accounts, receipt/payment vouchers, batch entry, voucher printing, document numbering books.
   - Cheque lifecycle tracking without bank-interest logic: received, deposited, endorsed, returned, paid, canceled.
   - Drill-down from ledger movement to original voucher/cheque.
4. Phase 3: Inventory and Documents
   - Items/SKUs, Arabic/English names, barcodes, numeric/alphanumeric codes, units/conversions, warehouse stock, min/reorder/max levels.
   - Quotations, orders, invoices, returns, debit/credit notes, service invoices, shipments, warehouse/branch transfers.
   - Replace tax fields with optional "fees/charges" lines that are neutral and configurable, disabled by default.
   - Support discounts and fixed-price deferred payment without interest calculation.
5. Phase 4: Reporting and Printing
   - Core reports: trial balance, general ledger, account statement, customer/supplier statement, inventory balance, inventory movement, sales/purchases summaries, receivables/payables aging without interest penalties, balance sheet, income statement.
   - Report designer strategy: start with curated templates plus filters; add user-editable report templates after the core is stable.
   - PDF export, print, CSV/XLSX export, Arabic RTL layout, company logo/header/footer.
6. Phase 5: Tablet Experience
   - Touch-friendly invoice, receipt, inventory lookup, barcode scanning, customer statement, dashboard, and approval/review screens.
   - Keep dense accountant screens available on desktop, but create simplified tablet task flows.
7. Phase 6: Advanced ERP Modules
   - Payroll without income-tax automation by default; wages, allowances, deductions, salary posting, employee accounts.
   - Import costing without VAT automation: landed cost, shipping, customs fees as neutral expense categories, cost allocation.
   - Light manufacturing/BOM formulas and unit cost calculation.
   - Advanced charts and analysis.
8. Phase 7: Migration and Competitive Switching
   - Import accounts/items/customers/suppliers from Excel/CSV.
   - Build a Golden Aseel migration assistant only if legally and technically feasible through exported data, not by reverse engineering proprietary files.
   - Create onboarding templates for common SME charts of accounts.

**User Experience Plan**
1. Arabic-first RTL UI with English mode. Store names/descriptions in Arabic and English where useful, similar to Golden Aseel's bilingual account/item support.
2. Keyboard-first desktop operation with discoverable shortcuts, command palette, fast search, and predictable tab order.
3. Tablet UI uses responsive panels, bottom/side navigation depending on screen size, large touch targets, and offline-first forms.
4. Preserve "drill to source": every ledger row links back to its source document.
5. Allow inline creation of accounts, customers, suppliers, and items while entering documents, with permission checks.
6. Keep visual design quiet and operational: dense tables, clear filters, fast forms, restrained colors, no decorative dashboard bloat.
7. Build help into the UI: field help, F1/help panel on desktop, contextual help drawer on tablet, and searchable manual.

**Battery and Performance Plan**
1. Native C++/Qt instead of Electron or browser shell.
2. SQLite local database with prepared statements, indexes, and paginated/lazy table models.
3. Incremental report summaries for expensive accounting reports.
4. No continuous polling; use event-driven updates and suspend background work when app is inactive.
5. Use Qt's rendering hardware abstraction carefully: avoid unnecessary animations in accounting screens, cap chart redraws, and defer heavy exports until explicitly requested.
6. Keep startup fast by loading only company metadata, recent documents, and dashboard summaries at launch.
7. Benchmark on an older 2020 Android tablet class device before declaring the tablet target met.

**Protection and Licensing Plan**
1. Use signed license files plus online activation for commercial desktop builds.
2. License file contains customer ID, plan, device limit, expiry/support period, feature entitlements, and signature. Verify offline using embedded public key.
3. Activation server issues licenses after payment and can deactivate seats, but the app should allow a grace period for offline businesses.
4. Hardware binding should be privacy-preserving and forgiving: hash a small set of stable device signals, allow limited changes, and provide self-service reset.
5. Code-sign all builds: Windows Authenticode, Apple Developer ID/notarization, Linux package signatures where possible, Android/iPad store signatures.
6. Add tamper checks and update signature verification, but do not over-invest in "uncrackable" DRM. Focus on support, updates, cloud sync, templates, and services that make paying worthwhile.
7. For tablets, use App Store/Play Billing where practical, but also support business licenses purchased from your website and activated in-app if store rules allow.

**Monetization Options**
1. Recommended primary model: paid annual subscription per company plus seat/device limits, with offline-capable licensing.
2. Starter plan: small shop/company, one company file, one or two users, accounting + invoices + inventory basics.
3. Professional plan: multi-user, multi-branch, multi-currency, cheques, advanced reports, import/export, tablet companion.
4. Enterprise/on-prem plan: priority support, custom reports, migration help, advanced roles, optional private sync server, reseller margin.
5. One-time perpetual license is possible for markets that dislike SaaS, but pair it with annual maintenance/support. Otherwise revenue becomes lumpy and support-heavy.
6. Paid services: data migration from Excel/legacy systems, custom report templates, accountant setup package, training, priority support, branded invoice templates.
7. Partner/channel model: resellers/accountants receive commission for onboarding SMEs, similar to Golden Aseel's dealer-friendly market pattern.
8. Avoid monetizing through interest-linked financial services, tax-filing upsells, or payment products that force questionable fee/interest structures.

**Critical Files for Future Implementation**
1. Proposed `CMakeLists.txt` at repository root: project configuration, compiler standards, platform builds, dependency wiring, and Windows 7+ compatibility flags.
2. Proposed `src/domain/`: pure C++ accounting, inventory, currency, posting, compliance policy, and validation services.
3. Proposed `src/storage/`: SQLite repositories, migrations, encryption, backup/restore, audit/event tables.
4. Proposed `src/app/`: Qt application shell, dependency injection, settings, licensing, update checks.
5. Proposed `src/ui/qml/`: reusable universal QML UI, desktop/tablet adaptive layouts, Arabic RTL support.
6. Proposed `src/reports/`: report query models, template definitions, PDF/print/export pipeline.
7. Proposed `src/licensing/`: license verification, activation client, entitlement checks, grace period logic.
8. Proposed `tests/`: accounting invariants, posting rules, Islamic compliance validation, database migrations, report snapshots.
9. Proposed `docs/`: product requirements, Sharia policy register, platform support matrix, licensing/activation docs.
10. Proposed `packaging/windows/`: NSIS installer script for Windows 7+, Visual C++ runtime bundling, digital signing.
11. Proposed `packaging/macos/`: notarization script, code signing, DMG creation, universal binary handling.
12. Proposed `packaging/linux/deb/`: Debian package configuration (debian/control, debian/rules), systemd integration if needed.
13. Proposed `packaging/linux/rpm/`: RPM spec file, source RPM creation for Fedora/RHEL/CentOS.
14. Proposed `packaging/linux/arch/`: PKGBUILD file for Arch User Repository (AUR) submission.
15. Proposed `packaging/linux/flatpak/`: Flatpak manifest for universal sandboxed distribution.
16. Proposed `.github/workflows/` or `.gitlab-ci.yml`: CI/CD pipeline for multi-platform builds, signing, and distribution.

**Verification Strategy**
1. Accounting tests: every posted document must balance debits/credits, preserve currency rules, and create deterministic audit records.
2. Islamic policy tests: disallowed interest/tax fields, account types, categories, and document flows are rejected or warned according to the selected policy.
3. Golden Aseel parity checklist: verify each researched module has either MVP support, planned support, or deliberate exclusion.
4. Performance tests: startup time, invoice entry latency, ledger query speed, report generation time, memory use on desktop and tablets.
5. Battery tests: Android tablet idle/active usage, iPad background behavior, no unnecessary wakeups.
6. Platform tests: 
   - Windows 7 SP1+ installer, Windows 10/11 portable/installer variants
   - macOS universal native execution on Intel and Apple Silicon
   - Linux: DEB (Ubuntu/Debian), RPM (Fedora/CentOS), Arch PKGBUILD, AppImage, Flatpak
   - Android tablet, iPad
   - Verify minimum glibc, Qt runtime, and API level support for each target
7. RTL/layout tests: Arabic UI, Arabic PDF reports, mixed Arabic/English/numbers/currency rendering.
8. Licensing tests: offline activation grace, expired license behavior, device limit, signed update verification.

**Decisions and Assumptions**
1. Recommended UI framework is Qt 6 LTS because it is the most practical C++ answer for one universal UI across desktop, iPadOS, and Android tablets.
2. Recommended data model is local-first SQLite, not cloud-first SaaS, because the competitor must be lightweight, battery-efficient, and viable where connectivity is unreliable.
3. Recommended first release excludes VAT/tax automation and interest calculations by design.
4. Recommended release scope starts with accounting + inventory + invoicing + vouchers + reports, because those are the everyday workflows that create switching value.
5. Golden Aseel proprietary internals should not be reverse engineered. Compete via public feature research, user interviews, exported data migration, and better implementation.

**Further Considerations**
1. Qt licensing must be decided early. LGPL can work if you comply carefully with dynamic linking and redistribution obligations; commercial Qt reduces legal/operational friction, especially for iOS/App Store and closed-source commercial distribution.
2. The Salafi policy pack should be reviewed by a trusted student of knowledge/scholar and an accountant before marketing claims are made.
3. Target country matters. Even with no tax module, payroll, invoicing labels, currencies, cheque practices, and legal invoice requirements vary by market.

**Platform-Specific Build Considerations**

**Windows 7 Support**
- Use Qt 6 with MSVC 2019+ to ensure Windows 7 SP1 compatibility (Qt 6.2+ officially supports Windows 7 SP1 with appropriate compiler flags).
- Bundle Visual C++ 2019/2022 runtime redistributable in the installer.
- Test thoroughly on Windows 7 VMs during CI/CD; use GitHub Actions with Windows Server 2019 images as proxy for Windows 7 compatibility.
- Avoid Windows-only APIs introduced after Windows 7 (e.g., modern UWP, DirectX 12 features).
- Use NSIS (Nullsoft Scriptable Install System) for Windows 7+ installer; support both x64 and ARM64 builds if demand emerges.

**Linux Multi-Distribution Support**
- **DEB packages (Debian/Ubuntu/Mint)**:
  - Use `debhelper` and `dpkg-dev` tooling; generate with `stdeb` or native cmake rules.
  - Specify dependencies on Qt6 runtime libraries and SQLite3.
  - Support Ubuntu LTS versions (22.04 LTS primary, 20.04 LTS fallback).
  - Ensure glibc 2.31+ compatibility for wider distribution support.
  
- **RPM packages (Fedora/CentOS/RHEL)**:
  - Use `.spec` file format; generate with `rpm-build` or `rpmbuild` toolchain.
  - Target Fedora 37+, CentOS Stream 9+, RHEL 9+.
  - Specify dependencies on qt6-core, qt6-gui, qt6-qml, sqlite.
  - Use `fpm` (Effing Package Management) or `cpack` as alternatives for simpler packaging.
  
- **Arch PKGBUILD**:
  - Create PKGBUILD template for AUR (Arch User Repository) submission.
  - Maintain upstream PKGBUILD; community can create split packages (mohasib, mohasib-docs, etc.).
  - Depend on qt6-base, sqlite.
  
- **AppImage (universal fallback)**:
  - Bundle Qt6 runtime, SQLite, and all dependencies into a single self-contained AppImage.
  - Use `linuxdeploy` or `appimagetool` for creation.
  - Simplifies distribution for non-package-manager Linux users.
  - Include AppImage auto-updater (AppImageUpdate or Delta updates).
  
- **Flatpak**:
  - Create Flatpak manifest for universal sandboxed installation via GNOME Software, KDE Discover, Flatseal.
  - Declare permissions for file system access, networking, and hardware (for barcode scanners if applicable).
  - Simplifies dependency management; Qt and libraries managed by Flatpak runtime.

- **CI/CD Pipeline**:
  - Use GitHub Actions or GitLab CI with matrix builds: ubuntu-latest (DEB), fedora-latest (RPM), arch (PKGBUILD), generic (AppImage + Flatpak).
  - Automate package signing: GPG sign DEB/RPM, notarize AppImages, publish Flatpak to Flathub.
  - Test each package in corresponding distribution container before release.
  
- **Version Compatibility**:
  - Minimum: glibc 2.28+ (covers most distros from 2020+), Linux kernel 5.0+, Qt6.2+.
  - Primary: x86_64; secondary: aarch64 (ARM64) for server/ARM SBCs.
  - Build and test on older LTS distributions (Ubuntu 20.04, CentOS 8) to ensure broad reach.
