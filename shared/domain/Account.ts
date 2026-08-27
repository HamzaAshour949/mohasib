export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export const isDebitNormal = (t: AccountType): boolean =>
  t === 'asset' || t === 'expense';

export const accountTypeAr = (t: AccountType): string => ({
  asset: 'أصول',
  liability: 'التزامات',
  equity: 'حقوق ملكية',
  revenue: 'إيرادات',
  expense: 'مصروفات'
}[t]);

export const accountTypeEn = (t: AccountType): string => ({
  asset: 'Assets',
  liability: 'Liabilities',
  equity: 'Equity',
  revenue: 'Revenue',
  expense: 'Expenses'
}[t]);
