/**
 * Erzeugt ein VAPID-Schlüsselpaar für Web-Push (einmal pro Umgebung, Spec Abschnitt 7).
 * Aufruf: pnpm --filter @sp/api vapid.  Den privaten Schlüssel nur in die Umgebung, nie ins Repository.
 */
import webpush from 'web-push';

const keys = webpush.generateVAPIDKeys();
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
