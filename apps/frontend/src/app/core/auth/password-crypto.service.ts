import { Injectable, inject } from '@angular/core';
import * as forge from 'node-forge';
import type { PublicKeyResponse } from '@journal/shared-types';
import { ApiClient } from '../http/api.client';

/**
 * Cifra el password con la clave pública RSA del backend antes de enviarlo.
 * Defensa en profundidad sobre HTTPS: evita que el password en claro aparezca
 * en logs accidentales (nginx, APM, devtools "Copy as cURL", etc.).
 * El backend descifra y luego compara con bcrypt — el storage sigue siendo hash.
 */
@Injectable({ providedIn: 'root' })
export class PasswordCryptoService {
  private readonly api = inject(ApiClient);
  private publicKey: forge.pki.rsa.PublicKey | null = null;

  /** Cifra un password con RSA-OAEP (SHA-256) y devuelve base64. */
  async encrypt(password: string): Promise<string> {
    const key = await this.getPublicKey();
    const cipher = key.encrypt(forge.util.encodeUtf8(password), 'RSA-OAEP', {
      md: forge.md.sha256.create(),
      mgf1: { md: forge.md.sha256.create() },
    });
    return forge.util.encode64(cipher);
  }

  private async getPublicKey(): Promise<forge.pki.rsa.PublicKey> {
    if (this.publicKey) return this.publicKey;
    const res = await this.api.get<PublicKeyResponse>('auth/public-key');
    this.publicKey = forge.pki.publicKeyFromPem(res.publicKey) as forge.pki.rsa.PublicKey;
    return this.publicKey;
  }
}
