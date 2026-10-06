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
 * business knowing the language - the sentence for an error, a status. Shown with the
 * `displayText` pipe.
 */
export interface TranslatableText {
  readonly key: MessageKey;
  /** Values for the placeholders: numbers, or text this application produced itself. */
  readonly params?: Readonly<Record<string, string | number>>;
  readonly literal?: undefined;
}

/**
 * A text that came from outside - what the backend said - and is shown exactly as it is. It is
 * never passed through the translations: a placeholder-looking `{{ … }}` inside it would be
 * interpreted as one, and such text is not ours to interpret.
 */
export interface LiteralText {
  readonly literal: string;
  readonly key?: undefined;
  readonly params?: undefined;
}

/** Something to put on screen: either a text of ours to translate, or somebody else's words. */
export type DisplayText = TranslatableText | LiteralText;
