import { generateKeyPairSync } from 'node:crypto';

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const b64 = Buffer.from(privateKey).toString('base64');

process.stdout.write(
  [
    '# Pega esta línea en apps/backend/.env',
    '# (la clave pública se deriva automáticamente al iniciar el backend)',
    `RSA_PRIVATE_KEY_B64=${b64}`,
    '',
  ].join('\n'),
);
