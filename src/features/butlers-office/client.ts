import type { ApiError } from '../../shared/concierge/types';
export class OfficeError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function officeRequest<T>(
  path: string,
  body?: unknown,
  method?: 'POST' | 'PATCH',
): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...(body !== undefined
      ? {
          method: method ?? 'POST',
          headers: {
            'content-type': 'application/json',
            'x-concierge-request': '1',
          },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const result = (await response.json()) as T & ApiError;
  if (!response.ok)
    throw new OfficeError(
      response.status,
      result.message ?? 'The Butler is unavailable. Try again.',
    );
  return result;
}
