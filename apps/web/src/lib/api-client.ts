'use client';
import { CSRF_HEADER } from '@sp/shared';

export interface ApiProblem {
  status: number;
  title: string;
  errors?: { field: string; message: string }[];
}

export class ApiError extends Error {
  constructor(readonly problem: ApiProblem) {
    super(problem.title);
  }
}

/** POST an die API (gleicher Origin). `csrfToken` ist bei angemeldeten Sitzungen Pflicht. */
export async function apiPost<T = unknown>(
  path: string,
  body?: unknown,
  csrfToken?: string,
): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    method: 'POST',
    credentials: 'same-origin',
    // Content-Type nur mit Body: Fastify lehnt "application/json" ohne Inhalt mit 400 ab.
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(csrfToken ? { [CSRF_HEADER]: csrfToken } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  const data: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const p = data as Partial<ApiProblem>;
    throw new ApiError({ status: res.status, title: p.title ?? 'Fehler', errors: p.errors });
  }
  return data as T;
}
