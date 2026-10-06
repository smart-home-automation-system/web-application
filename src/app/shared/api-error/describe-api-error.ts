import { ApiError } from '../../core/api/api-error';
import { DisplayText } from '../../i18n/messages';

/**
 * A sentence for the screen: `{{ describeApiError(error) | displayText }}` in the template.
 * Only a refused request (4xx) shows what the backend said - that text is written for the person
 * who sent the request. It is shown as it came, in English, the one language the backend speaks;
 * what a failing service says about itself belongs in the logs.
 */
export function describeApiError(error: ApiError): DisplayText {
  switch (error.kind) {
    case 'network':
      return { key: 'apiError.network' };
    case 'server':
      return { key: 'apiError.server', params: { status: error.status } };
    case 'invalid-response':
      return { key: 'apiError.invalidResponse' };
    case 'client':
      return error.messages.length > 0
        ? { literal: error.messages.map((entry) => entry.message).join(' ') }
        : { key: 'apiError.refused', params: { status: error.status } };
    case 'unexpected':
      return { key: 'apiError.unexpected' };
  }
}
