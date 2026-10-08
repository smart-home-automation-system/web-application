import { LANGUAGES } from '../core/i18n/languages';
import { en } from './en';
import { pl } from './pl';

interface Tree {
  readonly [key: string]: string | Tree;
}

/** `{ a: { b: 'x' } }` -> `{ 'a.b': 'x' }` */
function flatten(tree: Tree, prefix = ''): Record<string, string> {
  return Object.entries(tree).reduce<Record<string, string>>((flat, [key, value]) => {
    const path = prefix + key;
    return typeof value === 'string'
      ? { ...flat, [path]: value }
      : { ...flat, ...flatten(value, `${path}.`) };
  }, {});
}

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((match) => match[1]).sort();
}

const texts: Record<string, Record<string, string>> = { en: flatten(en), pl: flatten(pl) };

describe('translations', () => {
  it('exist for every language the interface offers', () => {
    expect(Object.keys(texts).sort()).toEqual(LANGUAGES.map((language) => language.code).sort());
  });

  // the compiler checks this too (pl.ts is typed with the keys of en.ts); the test is what
  // still holds when somebody loosens that type, and what names the key in its failure
  it('have exactly the same keys in English and Polish', () => {
    expect(Object.keys(texts['pl']).sort()).toEqual(Object.keys(texts['en']).sort());
  });

  it('are never empty', () => {
    for (const [language, flat] of Object.entries(texts)) {
      const empty = Object.keys(flat).filter((key) => flat[key].trim() === '');

      expect(empty, `empty texts in "${language}"`).toEqual([]);
    }
  });

  // a placeholder renamed or dropped in one language shows up on screen as "{{ time }}"
  it('use the same placeholders in both languages', () => {
    const different = Object.keys(texts['en']).filter(
      (key) =>
        placeholders(texts['en'][key]).join() !== placeholders(texts['pl'][key] ?? '').join(),
    );

    expect(different).toEqual([]);
  });

  // an untranslated text is usually a copy of the English one; these are the same on purpose
  it('are translated: Polish differs from English except where it is meant to be the same', () => {
    const sameOnPurpose = ['about.commit', 'profiles.role.admin', 'presence.duration.minutes'];
    const untranslated = Object.keys(texts['en']).filter(
      (key) => texts['en'][key] === texts['pl'][key] && !sameOnPurpose.includes(key),
    );

    expect(untranslated).toEqual([]);
  });

  describe('the comparison itself', () => {
    it('notices a key missing from one language', () => {
      const complete = flatten({ group: { first: 'a', second: 'b' } });
      const incomplete = flatten({ group: { first: 'a' } });

      expect(Object.keys(incomplete).sort()).not.toEqual(Object.keys(complete).sort());
    });

    it('notices a placeholder that differs', () => {
      expect(placeholders('Switched on: {{ time }}')).not.toEqual(
        placeholders('Włączono: {{czas}}'),
      );
      expect(placeholders('{{ a }} of {{b}}')).toEqual(['a', 'b']);
    });
  });
});
