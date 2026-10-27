import fs from 'node:fs';
import webpush from 'web-push';

const file = '.env';
const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
if (/^VAPID_PUBLIC_KEY=.+/m.test(current) && /^VAPID_PRIVATE_KEY=.+/m.test(current)) {
  console.log('Existing push keys preserved.');
} else {
  const keys = webpush.generateVAPIDKeys();
  const cleaned = current.replace(/^VAPID_(PUBLIC_KEY|PRIVATE_KEY|SUBJECT)=.*\r?\n?/gm, '');
  fs.writeFileSync(file, `${cleaned}\n# Web Push: copy these values privately to your hosting environment\nVAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}\nVAPID_SUBJECT=https://floorguard.onrender.com\n`);
  console.log('Push keys saved in ignored .env. No secret values were printed.');
}
