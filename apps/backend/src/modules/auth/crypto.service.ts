import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  constants,
  createPrivateKey,
  createPublicKey,
  privateDecrypt,
  type KeyObject,
} from 'node:crypto';
import type { Env } from '../../config/env.validation';

@Injectable()
export class CryptoService implements OnModuleInit {
  private readonly logger = new Logger(CryptoService.name);
  private privateKey!: KeyObject;
  private publicKeyPem!: string;

  constructor(private readonly config: ConfigService<Env, true>) {}

  onModuleInit(): void {
    const b64 = this.config.get('RSA_PRIVATE_KEY_B64', { infer: true });
    let pem: string;
    try {
      pem = Buffer.from(b64, 'base64').toString('utf8');
    } catch {
      throw new Error('RSA_PRIVATE_KEY_B64 no es base64 válido');
    }
    if (!pem.includes('PRIVATE KEY')) {
      throw new Error('RSA_PRIVATE_KEY_B64 no contiene un PEM PKCS8 válido');
    }
    this.privateKey = createPrivateKey(pem);
    this.publicKeyPem = createPublicKey(this.privateKey)
      .export({ type: 'spki', format: 'pem' })
      .toString();
    this.logger.log('Clave RSA cargada (login con cifrado de password habilitado)');
  }

  getPublicKeyPem(): string {
    return this.publicKeyPem;
  }

  decryptPassword(cipherBase64: string): string {
    let buffer: Buffer;
    try {
      buffer = Buffer.from(cipherBase64, 'base64');
    } catch {
      throw new BadRequestException('Password cifrado inválido');
    }
    if (buffer.length === 0) {
      throw new BadRequestException('Password cifrado inválido');
    }
    try {
      const plain = privateDecrypt(
        {
          key: this.privateKey,
          padding: constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha256',
        },
        buffer,
      );
      return plain.toString('utf8');
    } catch {
      throw new BadRequestException('No se pudo descifrar el password');
    }
  }
}
