'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiPost } from '../../lib/api-client';
import { clearOfflineData, db } from '../../offline/db';

/** Abmelden leert den lokalen Speicher (Spec Abschnitt 12); offene Änderungen vorher ansagen. */
export function useLogout(csrfToken: string) {
  const router = useRouter();
  const [unsynced, setUnsynced] = useState(0);
  async function logout(force = false) {
    if (!force) {
      const pending = await db()
        .outbox.count()
        .catch(() => 0);
      if (pending > 0) {
        setUnsynced(pending);
        return;
      }
    }
    setUnsynced(0);
    await clearOfflineData().catch(() => undefined);
    await apiPost('/auth/logout', undefined, csrfToken).catch(() => undefined);
    router.replace('/login');
    router.refresh();
  }
  return { logout, unsynced, cancel: () => setUnsynced(0) };
}
