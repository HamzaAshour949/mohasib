import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(here, '..');
const NAMESPACES = ['common', 'nav', 'forms'] as const;
const LANGUAGES = ['ar', 'en'] as const;

type Bundle = Record<string, unknown>;

const load = (lang: string, ns: string): Bundle =>
  JSON.parse(readFileSync(join(here, lang, `${ns}.json`), 'utf8')) as Bundle;

/** Flatten so nested groups (errors.*) are compared like any other key. */
const flatten = (value: Bundle, prefix = ''): string[] =>
  Object.entries(value).flatMap(([key, child]) =>
    child !== null && typeof child === 'object'
      ? flatten(child as Bundle, `${prefix}${key}.`)
      : [`${prefix}${key}`]
  );

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'locales' ? [] : sourceFiles(full);
    return /\.tsx?$/.test(entry.name) && !entry.name.endsWith('.test.ts') ? [full] : [];
  });

describe('translation bundles', () => {
  it.each(NAMESPACES)('%s has the same keys in every language', (ns) => {
    const [first, ...rest] = LANGUAGES.map((lang) => ({ lang, keys: flatten(load(lang, ns)).sort() }));
    for (const other of rest) {
      // A key present in one language and missing in the other silently falls
      // back to the other language's text mid-sentence.
      expect({ lang: other.lang, keys: other.keys }).toEqual({ lang: other.lang, keys: first.keys });
    }
  });

  it.each(LANGUAGES)('%s has no empty strings', (lang) => {
    for (const ns of NAMESPACES) {
      const bundle = load(lang, ns);
      const empty = flatten(bundle).filter((key) => {
        const value = key.split('.').reduce<unknown>((acc, part) => (acc as Bundle)?.[part], bundle);
        return typeof value !== 'string' || value.trim() === '';
      });
      expect({ ns, empty }).toEqual({ ns, empty: [] });
    }
  });

  it('every key referenced in the UI exists', () => {
    const available = new Set(
      NAMESPACES.flatMap((ns) => flatten(load('en', ns)))
    );
    // Nested groups are addressed by their full path from code (errors.foo).
    const referenced = new Set<string>();
    const call = /\b(?:t|tc|tf|tn|navT|tCommon)\(\s*'([A-Za-z][\w.]*)'/g;

    for (const file of sourceFiles(srcRoot)) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(call)) referenced.add(match[1]);
    }

    // Keys built at runtime from a lookup table rather than written literally.
    const dynamic = new Set(['errors']);
    const missing = [...referenced].filter(
      (key) => !available.has(key) && !dynamic.has(key) && ![...available].some((a) => a.startsWith(`${key}.`))
    ).sort();

    expect(missing).toEqual([]);
  });

  it('has no hardcoded bilingual ternaries left in the UI', () => {
    // `lang === 'ar' ? 'نص' : 'text'` bypasses the translation layer entirely:
    // the string cannot be corrected without a code change and never reaches a
    // translator. There were 30 of these.
    //
    // Choosing a direction or a locale tag from the language is not the same
    // thing, so only prose counts as an offence: a branch containing a space
    // or a non-ASCII character. 'rtl', 'en' and 'border-l' pass.
    const isProse = (literal: string): boolean => / /.test(literal) || /[^\u0000-\u007F]/.test(literal);
    const ternary = /language === '(?:ar|en)'\s*\??\s*\n?\s*\?\s*(['"`])([^'"`]*)\1\s*:\s*(['"`])([^'"`]*)\3/g;

    const offenders: string[] = [];
    for (const file of sourceFiles(srcRoot)) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(ternary)) {
        if (isProse(match[2]) || isProse(match[4])) {
          offenders.push(`${file.slice(srcRoot.length + 1)}: ${match[0].slice(0, 60)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
