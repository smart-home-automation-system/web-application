import { ApiError } from '../../core/api/api-error';

/**
 * A sentence for the screen. Only a refused request (4xx) shows what the backend said - that
 * text is written for the person who sent the request; what a failing service says about itself
 * belongs in the logs.
 */
export function describeApiError(error: ApiError): string {
  switch (error.kind) {
    case 'network':
      return 'The server cannot be reached. Check the Wi-Fi or VPN connection.';
    case 'server':
      return `The service is not available right now (error ${error.status}).`;
    case 'invalid-response':
      return 'The server sent an answer the application does not understand.';
    case 'client':
      return error.messages.length > 0
        ? error.messages.map((entry) => entry.message).join(' ')
        : `The request was refused (error ${error.status}).`;
    case 'unexpected':
      return 'Something went wrong in the application.';
  }
}
