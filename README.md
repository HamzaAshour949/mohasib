# محاسب (Mohasib)

تطبيق مكتبي عربي أولًا للمحاسبة وإدارة المخزون، مبني على Electron وReact وTypeScript وSQLite. يعمل محليًا بالكامل: لا حساب، ولا مفتاح تفعيل، ولا خادم. تُخزَّن البيانات في ملف قاعدة بيانات واحد على جهازك.

بلا ربا وبلا ضرائب: لا يحسب التطبيق فوائد أو ضرائب ولا يحتوي على حقول لها، ويرفض المصطلحات المحظورة في أسماء الحسابات والجهات حسب سياسة الامتثال (صارمة أو تحذيرية).

## المزايا

- دليل حسابات هرمي، قيود يومية متوازنة، وترحيل تلقائي من الفواتير والسندات والشيكات والمصاريف والرواتب والأصول والإشعارات وحركات المخزون والتصنيع.
- العملاء والموردون مع حسابات ذمم مدينة/دائنة تلقائية، حدود ائتمان، وآجال استحقاق.
- الأصناف والمستودعات بتكلفة متوسط مرجّح، وخمسة أسعار بيع وخمسة أسعار شراء، ودعم الباركود.
- الفواتير وعروض الأسعار والطلبيات مع التحويل بينها، والمردودات.
- الصناديق والبنوك والشيكات بدورة حياة كاملة، والسندات متعددة الأطراف.
- الأقسام والمشاريع والجهات الممولة والموازنات كأبعاد تحليلية.
- تقارير: ميزان المراجعة، الأستاذ، كشف حساب، الميزانية، قائمة الدخل، أعمار الذمم، المخزون، السيولة، الموازنة مقابل الفعلي، وتقرير تدقيق.
- إقفال الفترات، الإقفال السنوي، نسخ احتياطي واستعادة، وسجل تدقيق.
- واجهة عربية/إنجليزية كاملة مع اتجاه RTL صحيح.

## المتطلبات

- Node.js 20.19 أو أحدث.
- npm.
- لبناء حزمة macOS: جهاز macOS (التوقيع لا يعمل خارجه).

## التشغيل

```bash
npm install
npm run dev
```

## الأوامر

```bash
npm run dev         # تشغيل التطبيق في وضع التطوير
npm run build       # بناء العملية الرئيسية والـ preload والواجهة
npm run typecheck   # فحص TypeScript (مشروعان: main و renderer)
npm test            # اختبارات الوحدة والتكامل (vitest)
npm run smoke       # بناء ثم تشغيل التطبيق فعليًا واختباره عبر DevTools
npm run start       # معاينة ناتج البناء
npm run pack:mac    # حزمة macOS لمعمارية Apple Silicon
npm run pack:win    # حزمة Windows x64
npm run seed:demo   # تعبئة قاعدة البيانات ببيانات تجريبية
```

`npm test` يعمل داخل Node الخاص بـ Electron، لأن `better-sqlite3` مبني على ABI الخاص بـ Electron ولا يستطيع Node النظامي تحميله.

## البناء والتوزيع

الحزم تُبنى على أنظمة التشغيل نفسها:

- **macOS (Apple Silicon)**: `npm run pack:mac` على جهاز macOS. البناء خارج macOS ينتج حزمة غير موقّعة يرفض Apple Silicon تشغيلها.
- **Windows x64**: `npm run pack:win`. مثبّت NSIS يحتاج Windows أو Wine؛ هدف `zip` يعمل في أي مكان وينتج مجلدًا قابلًا للتشغيل مباشرة.

يوجد سير عمل GitHub Actions في `.github/workflows/package.yml` يبني الاثنين على منصتيهما الحقيقيتين. ونواتج البناء (`out/`, `release/`) خارج Git.

## بنية المشروع

| المسار | المحتوى |
| --- | --- |
| `electron/` | العملية الرئيسية، القائمة الأصلية، معالجات IPC، خدمات قاعدة البيانات والترحيل |
| `electron/preload.ts` | جسر `contextBridge` — الطريقة الوحيدة التي تصل بها الواجهة إلى أي شيء ذي صلاحية |
| `shared/` | المنطق النقي المشترك: النقود، القيد المزدوج، تكلفة المخزون، التواريخ، الامتثال، عقود IPC |
| `src/` | واجهة React: الصفحات والمكونات والترجمة |
| `scripts/` | اختبار الدخان، مشغّل الاختبارات، تعبئة البيانات التجريبية |

## الأمان

النافذة تعمل بـ `sandbox: true` و`contextIsolation: true` و`nodeIntegration: false`. لا تستطيع الواجهة الوصول إلى Node أو نظام الملفات إطلاقًا؛ كل عملية ذات صلاحية تمرّ عبر الـ preload. سياسة CSP صارمة تُحقن في نسخة الإنتاج، والتنقل خارج التطبيق يُحوَّل إلى متصفح النظام (http/https/mailto فقط).

## الترخيص

المشروع خاص (`UNLICENSED`)، فلا يُعاد توزيع الكود أو الحزم دون إذن مالكه. هذا وصف لحقوق النشر فقط: التطبيق نفسه لا يحتوي على أي بوابة ترخيص أو تفعيل، ولن يحتوي.

---

## English summary

Mohasib is an Arabic-first, local-first accounting and inventory desktop app
(Electron + React + TypeScript + SQLite). It runs with no account, no license
key and no server; data lives in a single SQLite file on the machine. It
computes no interest and no taxes by design, and blocks prohibited terminology
in account and party names under a strict or warn compliance policy.

```bash
npm install
npm run dev        # develop
npm test           # unit + IPC integration tests (runs under Electron's Node)
npm run smoke      # build, launch the real app, drive it over the DevTools protocol
npm run pack:mac   # macOS arm64 package — must run on macOS
npm run pack:win   # Windows x64 package
```

Money is stored as integer minor units in TEXT columns and handled as `bigint`;
there are no floats on any posting path. Quantities are scaled to three
decimals before they meet a cost. Domain logic that has to be right — double
entry validation, weighted-average costing, date arithmetic, compliance
matching — lives in `shared/domain/` with tests, and the IPC handlers are
tested through the same entry points the renderer calls.
