import { en } from './en';

/** The shape every language has to fill in: the keys of the English texts. */
export type Messages = typeof en;

type Leaves<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

/** Every key that names a text, as a dotted path (`overview.heating.title`). */
export type MessageKey = Leaves<Messages>;

/**
 * A text that is not translated yet: what code returns when it has something to say but no
 * business knowing the language - a route title, a navigation label, the sentence for an error.
 * The template turns it into words with `t(text.key, text.params)`.
 */
export interface TranslatableText {
  readonly key: MessageKey;
  readonly params?: Readonly<Record<string, string | number>>;
}
