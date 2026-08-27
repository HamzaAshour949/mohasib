# Aseel App Summary

## Purpose

This file is a Claude-friendly feature map for the Aseel accounting and management system (الأصيل), distilled from the full 570-page manual after OCR over the JPG page set.

Use it as a semantic reference for:

- identifying where a feature lives in the app
- mapping Arabic UI terms to business meaning
- inferring the correct document flow for sales, purchases, inventory, finance, and payroll
- answering user questions without treating the manual as a page-by-page transcript

Do not treat this file as tax or legal advice. Treat it as an operational model of how the app is structured and what each module is for.

## AI Operating Rules

- Treat `المجموعة المحاسبية` as the main working container: one company or business dataset for one fiscal period.
- Prefer Arabic UI names in answers when the user is likely looking at the Arabic desktop app. Add English glosses only to disambiguate.
- When the user asks `where do I do X?`, first classify X as one of: master data, configuration, operational document, accounting entry, report, or maintenance tool.
- Distinguish `إضافة` or `إصدار` screens from `مراجعة` screens. `إضافة`/`إصدار` create documents. `مراجعة` browse, filter, reopen, print, and sometimes edit them.
- Orders and quotes are mostly administrative workflow documents. Shipments affect inventory. Invoices affect accounting and often inventory too.
- Checks are payment instruments inside receipt/payment flows, not the primary source document for a transaction.
- Defaults often come from `ثوابت المجموعة` or from the master card of the customer, supplier, employee, item, or warehouse. Document-level overrides are common.
- Analytical dimensions matter throughout the system: `الموازنة` (budget), `القسم/المشروع` (department/project), and `الممول` (funder/donor) can appear in many financial and operational screens.
- Cards often support notes, status flags, colors, images, and review locks. These fields are part of workflow control, not decoration.
- Reports are a first-class product surface. The manual explicitly positions reports as the final information output of the system.

## High-Level Product Model

Aseel is a document-centric accounting and management suite. The system revolves around a few core pillars:

- documents and source forms
- ledgers and journals
- chart of accounts
- master files
- reports

The manual frames the system as an accounting information system where data enters through documents and leaves through reports. Many screens are designed so that once a source document is saved, the system automatically posts accounting entries, inventory movements, or both.

### Core container: the accounting group

The `المجموعة المحاسبية` is the core working unit. It represents the full accounting and documentary environment for a business and fiscal period, including:

- chart of accounts
- journals and ledgers
- inventory and items
- customers, suppliers, employees
- reports
- group-specific constants and numbering

Typical reasons to create a new group:

- first-time system setup for a new business
- starting a new fiscal year
- migrating from manual accounting to computerized accounting
- migrating from another accounting program

## Recommended Setup Sequence

The manual strongly implies this working order:

1. Create a new accounting group.
2. Fill `ثوابت المجموعة` and `الثوابت العامة`.
3. Build the chart of accounts.
4. Define routing accounts for cash, banks, checks, tax, trading, customers, suppliers, payroll, and other recurring flows.
5. Add master data: customers, suppliers, employees, items, warehouses, budgets, departments/projects, funders, assets.
6. Set document numbering, print options, currencies, taxes, and validation behavior.
7. Start operational work through invoices, receipts, payments, shipments, checks, payroll, and reports.

## Document Semantics

The manual explicitly divides documents by effect:

- Accounting-only documents:
  - receipt vouchers (`إيصالات القبض`)
  - payment vouchers (`سندات الصرف`)
  - debit/credit notes (`الإشعارات المدينة والدائنة`)
  - service invoices (`فواتير الخدمة`)
  - expense invoices (`فواتير المصاريف`)
- Inventory-only documents:
  - outgoing shipments (`إرساليات الصادر`)
  - incoming shipments (`إرساليات الوارد`)
  - manual stock movements
- Accounting + inventory documents:
  - sales invoices
  - purchase invoices
  - sales returns
  - purchase returns
- Administrative documents:
  - sales and purchase orders (`الطلبيات`)
  - outgoing and incoming quotations (`عروض الأسعار`)

The manual also distinguishes:

- internal documents created by the business itself
- external documents received from other parties and recorded into the system

## Core Glossary

| Arabic term | Best interpretation | Notes |
| --- | --- | --- |
| المجموعة المحاسبية | accounting group / fiscal dataset | Main container for one business-period environment |
| ثوابت المجموعة | group constants | Group-level defaults and account routing |
| الثوابت العامة | system-wide constants | General behavior, validation, appearance, reports, backup, networking |
| فهرس الحسابات | chart of accounts / account index | Hierarchical GL master |
| قيد محاسبي | journal entry | Manual or auto-generated |
| سند قبض | receipt voucher | Inbound cash/check collection |
| سند صرف | payment voucher | Outbound cash/check disbursement |
| الشيكات | checks | Managed as states within finance flows |
| الأصناف | items / SKUs | Inventory master |
| المخازن | warehouses | Inventory locations |
| الطلبية | order | Usually operational/admin, not final accounting |
| عرض سعر | quotation | Pre-invoice commercial document |
| الإرسالية | shipment / delivery note / goods receipt | Inventory movement document |
| فاتورة بيع / شراء | sales / purchase invoice | Operational and accounting document |
| مرجع بيع / شراء | sales / purchase return | Reversal or return document |
| الإشعار المدين / الدائن | debit / credit note | Separate adjustment document classes |
| الموازنة | budget | Planning and variance tracking dimension |
| القسم / المشروع | department / project / cost center | Analytical dimension |
| الممول | funder / donor | Especially important for NGO-style tracking |
| كشف الرواتب والأجور | payroll sheet | Monthly salary processing document |
| كشف الإيرادات والمصروفات | revenue and expense statement | VAT-oriented monthly statement |

## Cross-Cutting Concepts

These concepts appear across many modules and should be assumed to be reusable system-wide:

- multi-currency entry and reporting
- VAT and withholding tax handling
- budgets, departments/projects, and funders
- user-level permissions and review locks
- note fields and reminder messages
- image attachments on many master cards and some documents
- external file attachments and stored image paths in some indexes/documents, not only embedded images
- document numbering by journal/ledger
- document templates, preview-before-print behavior, and multiple saved print/report designs
- drill-back from reports and review screens to the originating document or movement
- active-state, approval-state, password, and contract-end validations on some accounts and parties
- print, export, and English-copy options in many reports

## Release-History Deltas Worth Remembering

The vendor update history adds several capabilities that are easy to understate if you only read the core manual as a static product snapshot.

- reporting and output matured to include direct PDF saving and broader use of PNG images
- report and document output expanded beyond plain printing: Word/Excel/HTML/EMF export, saved designs/templates, and more places where the user can drill back to the source movement
- POS and cashier flows grew beyond simple invoice entry: warehouse-aware cashier lines, item-level discounts, point/loyalty support, and the ability to review cashier invoices through regular sales-invoice review
- POS and hospitality workflows also picked up customer-display support, waiter/table handling, multiple bills per table, cashier-to-cashier server/client behavior on slow networks, in-cashier receipt handling, and cash handoff/reconciliation steps
- order/quote conversion became more faithful: preserving warehouse, price, unit, and line sequence, with optional conversion by today's date or by the original order date
- order and quotation families became more configurable, with up to five types for each in newer update notes
- inventory gained a dedicated stock-count movement type (`جرد`) in addition to incoming, outgoing, transfer, and manufacturing movements
- barcode support became deeper than simple printing: unlimited barcodes per item, unit-aware barcodes, item navigation by barcode, and barcode-driven navigation for customer/supplier/employee records
- master-data controls became stricter: account/customer passwords, contract-end dates, lowest allowed sale price, maximum allowed discount, and alternative-item/unit-specific structures all affect document entry
- lot/batch and expiry fields became more prominent in quotes and orders, with automatic carry-forward into invoices and shipments when group constants require them
- accounting automation expanded with account distribution tables on account cards, allowing automatic split posting across accounts and cost centers
- permissions became much more granular: discount ceilings, range-based permissions for cash accounts, check-custody accounts, warehouses, budgets, departments, funders, journals, and even report access
- deployment and automation expanded with stronger LAN/WWW behavior, online exchange-rate download, backup-age reminders, and encryption/decryption in the DataPump backup/copy tool
- localization widened beyond one country profile: English UI, Hijri fields, country-specific bank lists, country-specific tax variants, and internet-fed exchange/update behavior appear in later notes
- payroll and asset handling deepened over time: social insurance, health insurance, salary-tax options, depreciation-expense routing, multi-period depreciation schedules, and declining-balance depreciation
- retail and hospitality support widened with point-of-sale syncing and the separate kitchen-display direction (`Golden Asseal KDS`)

Treat these as later-generation operational refinements layered on top of the core accounting model described elsewhere in this file.

## Files, Administration, and Base Data

The files and administration surface includes:

- group backup and restore
- system-file backup and restore
- user switching and user management
- user-specific options
- permissions for review, edit, and data entry
- currencies and exchange rates
- banks and bank branches
- warehouses
- groups list and group opening/closing
- system notes and general options
- multi-user and network settings

Important practical behavior:

- backups are a core operating discipline in the manual, not an afterthought
- backup files use Aseel-specific backup formats
- restore can target the same group, another empty group, or another machine
- there are safeguards for restore operations, including old-folder preservation when names differ

## Group and System Constants

### Group constants (`ثوابت المجموعة`)

This is effectively the control panel for how a specific group behaves.

Main areas described in the manual:

- general company identity and address
- tax registration fields and tax rates
- fiscal period start and end
- group currency and default document currency
- trading and accounting account routing
- cash, bank, and check accounts
- customer, supplier, and employee account routing
- invoice and shipment behavior
- printing behavior
- protection and confidentiality
- social insurance settings
- classification fields
- additional behavior flags

Especially important details:

- up to five cash accounts can be assigned by currency
- document behavior can depend on whether entries should be detailed or condensed
- posting behavior can differ by currency basis
- the system can force or validate cost-center completion in some flows
- account routing at the group level is often overridden by card-level routing on items, customers, suppliers, or employees

### System-wide constants (`الثوابت العامة`)

These control behavior that spans all groups.

The manual lists areas such as:

- login and exit behavior
- appearance and layout
- report behavior
- points of sale / cashier related behavior
- barcode support
- cash drawer / display settings
- calculation methods
- validation and audit checks
- backup options
- multi-user networking

Later update notes also show this surface absorbing more operational rules such as:

- font customization
- search filtering behavior in expansion windows
- staying on the last reviewed movement/document
- choosing which documents print immediately at entry time
- comparing check date with movement date
- optionally launching cashier invoice entry from barcode reads in the main window
- duplicate-document-number checks in multi-line financial movements

## Accounting (`المحاسبة`)

The accounting module is the central financial core.

### Main entities

- accounts
- journal entries
- departments/projects
- funders
- budgets
- assets

### Main features

- hierarchical chart of accounts with parent/child structure
- account cards with general, relationship, trading, employee, other, and balance/movement pages
- parent-child tree and child index views
- manual journal entry entry and review
- automatic posting from many source documents
- departmental and funder dimensions
- budget comparison and over-budget detection
- fixed asset linkage with accumulated depreciation accounts
- fixed asset registers that can also track depreciation expense routing, supplier linkage, and alternative depreciation methods/schedules

### Account-card capabilities

The account card can hold:

- account number and name
- English name
- address and contact fields
- parent account relationship
- detailed vs parent behavior
- asset-to-accumulated-depreciation linkage
- depreciation rate and routing
- default budget/department/funder values that can auto-fill downstream documents and entries
- option to include or exclude the account from exchange-difference calculations
- distribution rules that can auto-split amounts across accounts and cost centers during posting
- trading-specific data
- employee-specific data where relevant
- other classification and balance fields

### Key analytical outputs

- chart of accounts reports
- trial balance
- income statement and financial-position style outputs added in later releases
- account notes
- receivable and payable style account summaries
- budget vs actual
- exceeded budgets
- accounts with balances that conflict with their expected nature
- asset reports
- journal-entry reports
- general ledger
- department balances

## Receipts and Payments (`القبض والصرف`)

This module manages cash and check collection/disbursement.

### Main documents

- single receipt voucher
- single payment voucher
- multiple receipt voucher
- multiple payment voucher
- review of receipt movements by account
- review of payment movements by account

### Core capabilities

- collect or disburse cash
- collect or disburse checks
- record receipts/payments against customers, suppliers, employees, or generic accounts
- allocate analytical dimensions like budget, department, and funder
- record second date and Hijri date fields where relevant
- store notes, classifications, references, and review locks

### Important behavior

- these are treated as internal documents with automatic numbering
- multiple vouchers allow one document to settle or collect from many parties at once
- the same flow supports cash and checks in the same operational family
- `قابل للتعديل` is used as a workflow-control flag and can also serve as a review marker

## Checks (`الشيكات`)

The manual is explicit that checks are payment instruments rather than the primary source document.

### Incoming check lifecycle

- received into check custody
- deposited for collection
- collected immediately
- endorsed/transferred
- returned from bank
- re-deposited or moved to returned-check custody

### Outgoing check lifecycle

- issued
- cashed by bank
- returned
- canceled and reissued

### Main features

- state-based check tracking
- bank, branch, and bank-account fields
- separate accounts for custody, under collection, returned checks, and checks issued for payment
- commission and bank-fee handling on transitions
- batch deposit/cashing/endorsement flows for groups of checks under filter conditions
- trace-back from a transformed check to the original financial movement even after multiple receipt/payment actions
- review and reporting by check state

## Inventory (`المخازن`)

Inventory is a full operational subsystem, not just a stock list.

### Main entities

- item / SKU
- warehouse
- stock movement
- manufacturing recipe / formula
- meter/counter
- expiry date / batch number

### Item master capabilities

- item number and name
- English name
- catalog number and barcode use
- physical location in warehouse
- default warehouse
- three measurement units with conversion factors
- dimensions and quantity-multiplier logic for size/volume-based products
- up to five sales prices and five purchase prices
- item-level sales and purchase discounts
- VAT-included or VAT-excluded pricing behavior
- special VAT rate per item
- item-specific trading accounts
- default supplier and default seller
- branch and category-style classification
- alternative-item table for substitution scenarios
- parent-item linkage and item tree organization
- special item types
- unit-linked item definitions so different units can carry different prices/barcodes while still mapping back to the same logical product family
- minimum allowed sale price and maximum allowed discount constraints
- extra/free-quantity rules
- empty-package weight rules
- opening data, status flags, notes, images

### Special item types explicitly described

- goods (`بضاعة`)
- service with quantity significance (`خدمة`)
- work without quantity significance (`عمل`)
- transfer/manufacturing input (`تحويل`)
- minimum-invoice amount items (`حد أدنى`)
- minimum-invoice without discount effect
- assembled/bundled items (`تجميعي`)
- percentage service items (`خدمة%`)
- stacked percentage service items (`خدمة%+`)
- fixed-asset style items (`أصل`)

### Warehouse operations

- add manual stock movements
- record receipts, issues, transfers, and manufacturing movements
- move stock between warehouses
- support opening stock balances
- track item balances, movement counts, last movement date, and warehouse-specific balances
- enforce expiry-date or batch-number entry when configured

### Manufacturing features

- recipe entry for manufactured items
- automatic consumption of components when manufacturing movement is entered
- production-cost view by selected item prices
- support for industrial and assembly-like use cases

### Other notable inventory features

- item notes and timed reminders
- item images
- item tree by configurable category fields like type/color/size/manufacturer
- counters/meters for businesses like fuel stations
- reorder thresholds, maximum stock, and sales planning
- unlimited barcodes per item with unit-aware handling
- weighted/quantity barcode modes and integration with electronic scales
- search by item location and broader use of color fields in indexes and transactions
- default-warehouse behavior that can be optional, enforced, or explicitly required
- stock-count (`جرد`) movements as a distinct operational inventory action

## Sales (`المبيعات`)

Sales is built around a staged document flow, but the user can enter later-stage documents directly.

### Main entities

- customer
- quotation
- order
- outgoing shipment
- sales invoice
- sales return invoice
- service invoice
- cashier invoice

### Customer card features

- customer number, name, and English name
- address, phones, email, website, manager name
- tax and identity fields
- VAT applicability and special VAT rate
- withholding-tax percentage
- linked price tier and sales discount
- default salesperson
- invoice due days
- default warehouse
- customer-specific sales, return, and discount accounts
- branch/color classification
- active-state and approval-state fields
- credit limit and account-currency behavior
- links to corresponding supplier or employee card when the same person/entity plays multiple roles
- notes and images

### Sales document flow

Common progression:

- quote
- order
- shipment
- invoice
- receipt

The manual explicitly states that the workflow can begin at any stage when operationally needed.

### Operational sales capabilities

- outgoing quotations convertible to shipment or invoice
- customer orders with execution and remaining-quantity tracking
- item orders for scenarios where one item is ordered by many customers
- outgoing shipments with optional transport-cost handling
- conversion of shipments to invoices
- sales invoices and returns
- service invoices
- cashier mode and cashier invoices

### Important details that are easy to miss

- shipment screens can track driver, vehicle, freight-per-unit, and total freight
- orders and shipments can carry budget, department, and funder fields
- order execution can be partial across multiple stages
- quotations can also become orders before they become shipments or invoices
- invoices have due dates, export flags, offset/clearing invoice references, and additional-cost distribution support
- invoices can be linked to financial transactions so settlement/coverage can be reviewed from either side
- customers can auto-pull price tier, discount, salesperson, and default warehouse into sales documents
- customers/accounts can enforce special passwords, end-of-dealing dates, and other gating rules during document entry
- cashier workflows can become warehouse-aware, support item-level discounting, and participate in point/loyalty-style flows
- cashier workflows can also include customer-display screens, table/waiter handling, multiple invoices per table, cashier-server/client layouts, cash handoff, and in-cashier receipt entry
- reusable templates and alternate print designs exist for invoices, shipments, quotations, and orders
- quote/order conversion can preserve warehouse, price, unit, and line sequence rather than re-deriving them loosely
- item-order workflows can convert into regular sales invoices, shipments, and in newer updates even sales-return style flows
- credit-limit and estimated-balance checks can be pushed into new shipment/invoice validation flows

## Purchases (`المشتريات`)

Purchasing mirrors sales conceptually, with supplier-oriented defaults and receiving flows.

### Main entities

- supplier
- incoming quotation
- purchase order
- incoming shipment / goods receipt
- purchase invoice
- purchase return invoice
- customs statement / customs invoice data
- expense invoice

### Supplier card features

- supplier identity and contact data
- VAT and withholding configuration
- purchase price tier and purchase discount defaults
- default warehouse
- payment due days
- supplier-specific purchase, purchase-return, and discount accounts
- active-state and approval-state fields
- AP currency behavior and debt-limit behavior
- linkage to corresponding customer or employee record where needed
- notes and images

### Purchasing flow

Common progression:

- incoming quotation
- purchase order
- incoming shipment
- purchase invoice
- payment

As with sales, the manual allows starting directly at later documents when needed.

### Operational purchasing capabilities

- incoming quotations convertible to incoming shipment or purchase invoice
- purchase orders with fulfillment tracking
- incoming shipments with transport-cost allocation
- conversion of incoming shipments to purchase invoice, purchase return invoice, or customs statement
- purchase invoices and purchase returns
- customs-data invoices and expense invoices as separate classes in the invoice family

### Important details that are easy to miss

- transport cost on receiving can be assigned to driver, vehicle, budget, department, funder, and a configured freight expense account
- receiving screens can update item prices from receipt data
- shipment-to-invoice conversion can batch multiple receipts into one invoice
- purchase-side documents can also be linked back to financial transactions for settlement tracking
- supplier defaults can auto-drive price choice, discount, warehouse, and account routing
- later update notes add supplier-side conveniences such as filling the last purchase price more directly and reusing quote/order price updates similarly to invoices and shipments

## Employees, Payroll, and Other Finance Documents

This surface appears mainly under `اختيارات أخرى` and related reporting screens.

### Employees (`الموظفين / المسوقين / السائقين`)

Employee records behave similarly to customer and supplier cards, with additional finance and payroll relevance.

Important capabilities described in the manual:

- identity and contact fields
- employment-related data
- linked payable account for salaries due
- debt-limit behavior for employee advances
- multi-currency handling
- branch/color/status/approval fields
- links to matching customer or supplier roles if the same person/entity appears in multiple capacities
- images and notes

### Payroll (`كشوفات الرواتب والأجور`)

The payroll sheet is a monthly operational and accounting document.

The manual describes support for:

- payroll sheet number and dates
- payroll currency and exchange rate
- salary expense account and payment account
- employee-by-employee rows
- basic salary
- allowance
- overtime / extra amount
- additional allowances or deductions
- employer and employee insurance/savings amounts
- separate health-insurance handling and routing in later releases
- income-tax basis and monthly exemptions
- whether salary should be treated as tax-inclusive or tax-exclusive for a given employee
- income-tax withholding
- transport allowance
- net salary payable
- amount actually paid in cash
- unpaid portion staying as salary payable
- budget, department, and funder assignment for the whole sheet
- notes, classification fields, review lock, and linked accounting entry

The manual also describes a customizable payroll-screen layout, tax recalculation when one employee is spread across multiple departments/funders, and a separate payroll summary report.

### Journal vouchers and notices

The manual includes standalone `سندات القيود` and separate invoice/report families for:

- debit notes
- credit notes
- service invoices
- expense invoices
- customs-data documents

These are distinct operational/accounting document classes and should not be collapsed mentally into one generic invoice type.

### Revenue and expense statements (`كشوفات الإيرادات والمصروفات`)

This is a monthly VAT-oriented statement that automatically pulls eligible documents rather than forcing the user to re-enter them.

Key capabilities:

- summarize sales-side and purchase-side VAT
- include sales, returns, services, debit/credit notes, purchases, expenses, and customs data
- postpone selected purchase/expense invoices to a later month
- detect late invoices that belong to a prior VAT period
- produce payment/refund-oriented outputs
- provide automatic preparation modes with selection rules

### Import costing (`تكاليف الاستيراد`)

This module is for landed-cost analysis and pricing support.

The manual explicitly says it does not create accounting entries.

Main cost buckets described:

- base import value and freight/insurance/base vessel cost
- port duties and taxes
- clearing agent fees and VAT on clearing
- other fees such as health fees, bank fees, communications, internal transport, and miscellaneous costs
- chart view of cost proportions

This should be treated as a costing and decision-support tool.

### Group notes (`ملاحظات المجموعة`)

The app supports reminder-style notes tied to a group.

Important behavior:

- notes can appear on group open or group close
- visibility can be limited to all users or selected users
- notes can contain general reminders or operational warnings

## Reports (`التقارير`)

The reporting system is one of the most important surfaces in the product. The manual explicitly frames reports as the final information output of the accounting system and mentions roughly 900 reports.

### Common report behavior

Across many report screens, the manual repeats the same patterns:

- filter by range and date
- sort numerically, alphabetically, or by date
- choose simple vs detailed modes
- export report to multiple formats including Word/Excel/HTML and later direct PDF
- view report before printing
- keep filter settings for next time
- choose among standard, custom, group, or network-shared report designs where multiple layouts exist
- drill from many reports back into the underlying account, item, or source document
- generate an English copy in many cases

Later update history also confirms direct PDF storage as a first-class output path rather than treating printing as the only final destination.

### Report families explicitly described

- accounting reports
- inventory reports
- customer reports
- supplier reports
- employee reports
- receipt/payment reports
- journal-voucher reports
- invoice reports
- cashier reports
- shipment reports
- payroll reports
- driver/freight reports
- outgoing check reports
- incoming check reports
- bank liquidity reports
- exchange-rate reports
- NGO/nonprofit reports
- tax and customs reports
- special/custom reports
- graphs, archived graphs, and cross-period comparison reports

### Accounting reports called out in the manual

- chart of accounts
- trial balance
- account notes
- receivable accounts
- payable accounts
- budget comparison vs actual balances
- accounts that exceeded budget
- accounts whose balances conflict with their nature
- assets report
- journal-entry reports
- general ledger
- department balances

### Customer report set

- customer index
- customer notes
- customer balances and aging
- customer financial movements
- customer stock movements
- item-movement matrix by customer
- receipt/payment reports for customers
- salesperson reports

### Supplier report set

- supplier index
- supplier notes
- supplier balances and aging
- supplier financial movements
- supplier stock movements
- item-movement matrix by supplier
- receipt/payment reports for suppliers

### Employee report set

- employee index
- employee notes
- employee balances
- employee financial movements
- receipt/payment reports for employees

### Check and liquidity reports

- outgoing checks by state and filter
- incoming checks by state and filter
- bank liquidity based on checks under collection and checks for payment

### Invoice, VAT, and payroll reports

- reports by invoice family: sales, purchases, returns, services, expenses, debit/credit notes, customs data
- VAT/revenue-expense reports for the statutory statement
- payroll summary reports in compact or detailed styles

## Tools and Maintenance (`الأدوات`)

This is a serious maintenance toolbox, not a cosmetic utilities menu.

### Major tool families

- data maintenance and repair
- data audit and validation
- review lock / close movements and documents
- renumbering
- removal of unused accounts
- group-currency change
- carry-forward and copy from another group
- movement copy and repair from another group or branch center
- item-price copy/change
- rebuild accounting entries
- rebuild manufacturing movements

### Data maintenance and repair

The manual lists capabilities such as:

- reindex data files
- compact data / reduce fragmentation
- recalculate account balances
- recalculate customer/supplier/employee balances
- rebuild customer/supplier/employee movement files
- recalculate item balances
- rebuild item-data files
- merge groups/datasets in selected scenarios
- check relationships between files
- correct broken relationships

### Audit and validation

The validation surface includes checks for:

- transactions outside the fiscal period
- invoice dates vs shipment dates
- invoice dates vs receipt/payment statement dates
- budget/department/funder validity
- warehouse validity
- identity-number validity
- VAT consistency in invoices
- accounts whose balances moved against their defined nature
- movements entered in currencies inconsistent with the account currency
- wrong exchange-rate behavior
- wrong trading-account setup in group constants or item cards

The manual explicitly notes that this helps auditors assess internal-control quality quickly.

### Closing / locking reviewed work

Users can close reviewed ranges of:

- journal entries
- journal vouchers
- stock movements
- shipments
- invoices and returns
- receipts and payments
- service/expense invoices
- debit/credit notes
- customs documents
- payroll sheets

Closed items become protected from lower-permission users.

### Renumbering and cleanup

The system supports renumbering for:

- accounts
- budgets
- departments/projects
- funders
- assets
- customers
- suppliers
- employees
- items
- warehouses
- accounting entries
- stock movements

It also supports removing unused accounts, optionally filtered by date or whether they ever had movements.

### Group-to-group carry-forward and recovery

This is one of the most important operational capabilities in the book.

The system can copy from another group or backup:

- accounts and balances
- customers, suppliers, employees, and their balances
- items, warehouses, formulas, notes, images, device numbers, and opening balances
- unfinished documents such as unbilled shipments, unapplied VAT-period documents, uncleared checks, and active orders/quotes
- group constants, journal numbers, asset data, and special reports

This is the main mechanism for year rollover and recovery from missing movements.

### Rebuild operations

- rebuild accounting entries from source documents, especially after exchange-rate changes or corrected configuration
- rebuild manufacturing movements after changing manufacturing formulas

Related maintenance/update-history features also include:

- backup/copy encryption and decryption through the DataPump utility
- scheduled or network/FTP-oriented backup/copy behavior, including branch/POS-style deployments
- pre-group and post-group external commands for backup/encryption or other site-specific automation
- broader selective copy and repair behavior across groups, branches, and server/POS-style layouts

The manufacturing rebuild command includes an explicit warning in the manual not to use it carelessly when multiple manufacturing operations were recorded in one stock movement.

## Supported Business Scenarios and Practical Coverage

The practical case chapter makes it clear that Aseel is meant to support more than one business model.

The manual explicitly covers or references:

- transition from manual accounting to computerized accounting
- yearly rollover to a new fiscal dataset
- service institutions
- trading-service businesses
- industrial/manufacturing companies
- contracts and contracting projects
- associations and nonprofit / NGO-style organizations
- retail/POS operations and later kitchen-display style workflows

It also highlights support for:

- multiple warehouses
- fixed assets
- budgets
- exchange rates
- checks
- payroll
- VAT and customs-related reporting

## Easy-to-Miss Features That Matter

- Many master cards support status flags like `فعال`, approval state, and reminder text.
- Items can behave in unusual but intentional ways, including minimum-charge items, percentage-service items, bundled items, and manufacturing inputs.
- Freight and transport costs are modeled inside shipment flows, not only as abstract expenses.
- Receipts and payments can be entered in multiple-party form, not only one counterparty per document.
- Customers, suppliers, and employees can be linked across roles for the same real-world party.
- Item, customer, supplier, and employee cards can all influence default behavior inside documents.
- Some cards can also block or constrain entry through passwords, contract-end dates, allowed discount ceilings, or minimum permitted sale prices.
- The system distinguishes between notes on a specific card/document and group notes shown at open/close.
- Import costing is analytic only and does not post accounting entries.
- Reports often double as a navigation surface because later versions allow drilling back to the originating movement or document.
- The reporting surface is broad enough that answering `how do I see X?` often means finding the correct report family before suggesting data-entry screens.
- The tools menu is essential for data repair, year rollover, and audit control.

## Fast Routing Guide for an AI Assistant

Use this routing logic when interpreting user questions:

- If the user asks about company setup, fiscal year, currencies, tax, numbering, default accounts, or screen behavior: start with `ثوابت المجموعة` or `الثوابت العامة`.
- If the user asks about GL structure, ledger, trial balance, budget comparison, or asset-account linkage: start with `المحاسبة`.
- If the user asks about cash collection or payment: start with `القبض والصرف`.
- If the user asks about check states, deposits, returns, or clearing: start with `الشيكات`.
- If the user asks about items, warehouses, stock balances, expiry, manufacturing, barcode, or reorder thresholds: start with `المخازن`.
- If the user asks about customers, quotes, orders, outgoing shipments, sales invoices, returns, or cashier: start with `المبيعات`.
- If the user asks about suppliers, incoming quotations, purchase orders, receipts, purchase invoices, customs data, or expense invoices: start with `المشتريات`.
- If the user asks about employees, salary sheets, salary tax, insurance, or payroll reports: start with `اختيارات أخرى` and payroll/employee screens.
- If the user asks about VAT statement preparation, delayed expense invoices, or amount payable/refundable to tax authority: start with `كشوفات الإيرادات والمصروفات`.
- If the user asks about landed cost or import pricing: start with `تكاليف الاستيراد`.
- If the user asks about reminders or notices at login/logout: start with `ملاحظات المجموعة`.
- If the user asks how to inspect data rather than create it, prefer `مراجعة` screens or the appropriate report family.
- If the user asks how to fix broken balances, carry data forward, lock reviewed entries, renumber, or rebuild postings: start with `الأدوات`.

## Bottom-Line Mental Model

Think of Aseel as a layered system:

- `setup and routing` through constants and master files
- `documents` for day-to-day operations
- `automatic posting` into accounting and inventory ledgers
- `analysis and control` through reports, validations, and maintenance tools

For most questions, the right answer depends on identifying:

1. the master entity involved
2. the document type involved
3. whether the user wants entry, review, conversion, settlement, reporting, or maintenance

That three-step classification is usually enough to route the user to the right module in Aseel.