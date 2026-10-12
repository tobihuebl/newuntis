import { describe, expect, it } from 'vitest';
import { buildCsp, createNonce } from './csp';

describe('Content-Security-Policy', () => {
  it('keine Fremdquellen, Skripte nur mit Nonce, keine Einbettung', () => {
    const csp = buildCsp('abc', { dev: false, https: true });
    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain('upgrade-insecure-requests');
    expect(csp).not.toMatch(/https?:\/\//);
  });

  it('Entwicklungsmodus erlaubt Hot Reload, ohne HTTPS kein Upgrade', () => {
    const csp = buildCsp('n', { dev: true, https: false });
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain('ws:');
    expect(csp).not.toContain('upgrade-insecure-requests');
  });

  it('Nonce ist zufällig und Base64', () => {
    const a = createNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(createNonce()).not.toBe(a);
  });
});
