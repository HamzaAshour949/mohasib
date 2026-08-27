import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import arCommon from '../locales/ar/common.json';
import arNav from '../locales/ar/nav.json';
import arForms from '../locales/ar/forms.json';
import enCommon from '../locales/en/common.json';
import enNav from '../locales/en/nav.json';
import enForms from '../locales/en/forms.json';

const saved = (typeof localStorage !== 'undefined' && localStorage.getItem('lang')) || 'ar';

void i18n.use(initReactI18next).init({
  lng: saved,
  fallbackLng: 'en',
  defaultNS: 'common',
  ns: ['common', 'nav', 'forms'],
  resources: {
    ar: { common: arCommon, nav: arNav, forms: arForms },
    en: { common: enCommon, nav: enNav, forms: enForms }
  },
  interpolation: { escapeValue: false }
});

export const setLanguage = (lng: 'ar' | 'en'): void => {
  void i18n.changeLanguage(lng);
  localStorage.setItem('lang', lng);
  document.documentElement.lang = lng;
  document.documentElement.dir = lng === 'ar' ? 'rtl' : 'ltr';
};

document.documentElement.lang = saved;
document.documentElement.dir = saved === 'ar' ? 'rtl' : 'ltr';

export default i18n;
