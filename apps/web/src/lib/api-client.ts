'use client';
import { CSRF_HEADER } from '@sp/shared';

export interface ApiProblem {
  status: number;
  title: string;
  errors?: { field: string; message: string }[];
  [key: string]: unknown;
}

export class ApiError extends Error {
  constructor(readonly problem: ApiProblem) {
    super(problem.title);
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

/** Aufruf der API (gleicher Origin). `csrfToken` ist bei angemeldeten Sitzungen für schreibende Methoden Pflicht. */
export async function apiRequest<T = unknown>(
  method: Method,
  path: string,
  body?: unknown,
  csrfToken?: string,
): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    method,
    credentials: 'same-origin',
    // Content-Type nur mit Body: Fastify lehnt "application/json" ohne Inhalt mit 400 ab.
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(csrfToken && method !== 'GET' ? { [CSRF_HEADER]: csrfToken } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  const data: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const p = data as Partial<ApiProblem>;
    throw new ApiError({ ...p, status: res.status, title: p.title ?? 'Fehler' });
  }
  return data as T;
}

export const apiPost = <T = unknown>(path: string, body?: unknown, csrfToken?: string) =>
  apiRequest<T>('POST', path, body, csrfToken);
