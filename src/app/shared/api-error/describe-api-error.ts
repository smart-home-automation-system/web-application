import { ApiError } from '../../core/api/api-error';
import { TranslatableText } from '../../i18n/messages';

/**
 * A sentence for the screen, as a text to translate: `t(text.key, text.params)` in the template.
 * Only a refused request (4xx) shows what the backend said - that text is written for the person
 * who sent the request, and stays in English, the one language the backend speaks; what a
 * failing service says about itself belongs in the logs.
 */
export function describeApiError(error: ApiError): TranslatableText {
  switch (error.kind) {
    case 'network':
      return { key: 'apiError.network' };
    case 'server':
      return { key: 'apiError.server', params: { status: error.status } };
    case 'invalid-response':
      return { key: 'apiError.invalidResponse' };
    case 'client':
      return error.messages.length > 0
        ? {
            key: 'apiError.backendMessage',
            params: { message: error.messages.map((entry) => entry.message).join(' ') },
          }
        : { key: 'apiError.refused', params: { status: error.status } };
    case 'unexpected':
      return { key: 'apiError.unexpected' };
  }
}
