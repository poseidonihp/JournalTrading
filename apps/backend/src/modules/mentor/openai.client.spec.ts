import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.validation';
import { OpenAiClient } from './openai.client';

const settings: Partial<Record<keyof Env, unknown>> = {
  OPENAI_API_KEY: 'test-key',
  OPENAI_MODEL: 'modelo-de-prueba',
  OPENAI_BASE_URL: 'https://proveedor.test/v1',
  OPENAI_TIMEOUT_MS: 5000,
  OPENAI_MAX_RETRIES: 0,
  OPENAI_MAX_OUTPUT_TOKENS: 3000,
};

/** ConfigService mínimo que sólo resuelve las claves del bloque Mentor. */
const config = {
  get: (key: keyof Env) => settings[key],
} as unknown as ConfigService<Env, true>;

function client(): OpenAiClient {
  return new OpenAiClient(config);
}

/** Respuesta 200 del proveedor con el choice que pida la prueba. */
function respondWith(choice: unknown, usage: unknown = {}): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ choices: [choice], usage }), { status: 200 })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OpenAiClient', () => {
  it('explica que hay que subir el presupuesto cuando el razonamiento lo agota', async () => {
    respondWith(
      { message: { content: '' }, finish_reason: 'length' },
      {
        prompt_tokens: 6306,
        completion_tokens: 700,
        completion_tokens_details: { reasoning_tokens: 700 },
      },
    );
    await expect(client().complete('sys', 'user', {})).rejects.toThrow(/OPENAI_MAX_OUTPUT_TOKENS/);
  });

  it('distingue un rechazo del modelo de un presupuesto agotado', async () => {
    respondWith({ message: { content: null, refusal: 'no puedo' }, finish_reason: 'stop' });
    await expect(client().complete('sys', 'user', {})).rejects.toThrow(/rechazó/);
  });

  it('devuelve el contenido y el consumo cuando la respuesta llega completa', async () => {
    respondWith(
      { message: { content: '{"ok":true}' }, finish_reason: 'stop' },
      { prompt_tokens: 100, completion_tokens: 40 },
    );
    const result = await client().complete('sys', 'user', {});
    expect(result).toEqual({ content: '{"ok":true}', inputTokens: 100, outputTokens: 40 });
  });

  it('manda max_completion_tokens y structured outputs en modo estricto', async () => {
    respondWith({ message: { content: '{}' }, finish_reason: 'stop' });
    await client().complete('sys', 'user', { type: 'object' });

    const call = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(String(call?.[1]?.body)) as Record<string, unknown>;
    expect(call?.[0]).toBe('https://proveedor.test/v1/chat/completions');
    expect(body['max_completion_tokens']).toBe(settings.OPENAI_MAX_OUTPUT_TOKENS);
    expect(body).not.toHaveProperty('temperature');
    expect(body['response_format']).toMatchObject({
      json_schema: { name: 'mentor_advice', strict: true },
    });
  });
});
