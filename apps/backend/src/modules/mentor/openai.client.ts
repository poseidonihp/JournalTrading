import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.validation';

/** Respuesta útil de una llamada al proveedor. */
export interface IOpenAiResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
}

interface IChatCompletion {
  choices?: {
    message?: { content?: string | null; refusal?: string | null };
    finish_reason?: string;
  }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    completion_tokens_details?: { reasoning_tokens?: number };
  };
}

const httpBadRequest = 400;
const httpUnauthorized = 401;
const httpForbidden = 403;
const httpRequestTimeout = 408;
const httpConflict = 409;
const httpTooManyRequests = 429;
const retryableStatuses = new Set([httpRequestTimeout, httpConflict, httpTooManyRequests]);
const serverErrorFloor = 500;
const backoffBaseMs = 500;
const backoffFactor = 2;
const providerErrorMessage = 'El proveedor de IA no pudo generar el análisis';

/**
 * Cliente mínimo de Chat Completions sobre `fetch` nativo. Se usa Chat
 * Completions y no la Responses API para que un `OPENAI_BASE_URL` distinto
 * sirva con un gateway compatible.
 * @class
 */
@Injectable()
export class OpenAiClient {
  private readonly logger = new Logger(OpenAiClient.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  /** Hay key y modelo: se puede pedir consejo. Sin esto el digest sigue vivo. */
  isEnabled(): boolean {
    return Boolean(this.apiKey() && this.model());
  }

  model(): string | null {
    return this.config.get('OPENAI_MODEL', { infer: true }) ?? null;
  }

  /**
   * Pide una respuesta estructurada al modelo configurado.
   * @param {string} system - Instrucciones fijas
   * @param {string} user - Datos del periodo
   * @param {Record<string, unknown>} schema - JSON Schema del consejo
   * @returns {Promise<IOpenAiResult>}
   */
  async complete(
    system: string,
    user: string,
    schema: Record<string, unknown>,
  ): Promise<IOpenAiResult> {
    const model = this.model();
    const apiKey = this.apiKey();
    if (!model || !apiKey) {
      throw new ServiceUnavailableException('El análisis con IA no está configurado');
    }

    const body = {
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_completion_tokens: this.config.get('OPENAI_MAX_OUTPUT_TOKENS', { infer: true }),
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'mentor_advice', strict: true, schema },
      },
    };

    const maxRetries = this.config.get('OPENAI_MAX_RETRIES', { infer: true });
    let lastError: unknown = null;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        return await this.attempt(apiKey, body);
      } catch (error) {
        lastError = error;
        if (!isRetryable(error) || attempt === maxRetries) {
          throw error;
        }
        this.logger.warn(
          `OpenAiClient > complete - reintento ${attempt + 1} tras error transitorio`,
        );
        await delay(backoffBaseMs * backoffFactor ** attempt);
      }
    }
    throw lastError instanceof Error ? lastError : new BadGatewayException(providerErrorMessage);
  }

  /**
   * Una sola llamada HTTP, con timeout propio.
   * @private
   * @param {string} apiKey - Credencial del proveedor
   * @param {object} body - Cuerpo del request
   * @returns {Promise<IOpenAiResult>}
   */
  private async attempt(apiKey: string, body: object): Promise<IOpenAiResult> {
    const baseUrl = this.config.get('OPENAI_BASE_URL', { infer: true }).replace(/\/+$/, '');
    const timeoutMs = this.config.get('OPENAI_TIMEOUT_MS', { infer: true });
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    }).catch((error: unknown) => {
      throw new RetryableProviderError(messageOf(error));
    });

    if (!response.ok) {
      throw this.toException(response.status, await safeText(response));
    }

    const payload = (await response.json()) as IChatCompletion;
    const choice = payload.choices?.[0];
    const content = choice?.message?.content;
    if (!content) {
      throw this.toEmptyContentException(choice?.finish_reason, choice?.message?.refusal, payload);
    }
    return {
      content,
      inputTokens: payload.usage?.prompt_tokens ?? 0,
      outputTokens: payload.usage?.completion_tokens ?? 0,
    };
  }

  /**
   * Una respuesta 200 sin contenido casi siempre es presupuesto agotado: en los
   * modelos de razonamiento `max_completion_tokens` cubre razonamiento + salida.
   * @private
   * @param {string | undefined} finishReason - Motivo de corte del proveedor
   * @param {string | null | undefined} refusal - Rechazo explícito del modelo
   * @param {IChatCompletion} payload - Respuesta completa, para el log
   * @returns {Error}
   */
  private toEmptyContentException(
    finishReason: string | undefined,
    refusal: string | null | undefined,
    payload: IChatCompletion,
  ): Error {
    const reasoning = payload.usage?.completion_tokens_details?.reasoning_tokens ?? 0;
    this.logger.error(
      `OpenAiClient > attempt - respuesta sin contenido (finish_reason=${finishReason}, tokens de razonamiento=${reasoning}, de salida=${payload.usage?.completion_tokens ?? 0})`,
    );
    if (refusal) {
      return new BadGatewayException('El modelo rechazó generar el análisis');
    }
    if (finishReason === 'length') {
      const budget = this.config.get('OPENAI_MAX_OUTPUT_TOKENS', { infer: true });
      return new BadGatewayException(
        `El modelo agotó los ${budget} tokens de salida razonando y no llegó a escribir el análisis. Sube OPENAI_MAX_OUTPUT_TOKENS en el .env.`,
      );
    }
    return new BadGatewayException('El proveedor de IA devolvió una respuesta vacía');
  }

  /**
   * Traduce el error del proveedor a una excepción Nest en español. El cuerpo
   * crudo se loguea, nunca se devuelve al cliente.
   * @private
   * @param {number} status - Código HTTP del proveedor
   * @param {string} detail - Cuerpo devuelto
   * @returns {Error}
   */
  private toException(status: number, detail: string): Error {
    this.logger.error(`OpenAiClient > attempt - el proveedor respondió ${status}`, detail);
    if (retryableStatuses.has(status) || status >= serverErrorFloor) {
      return new RetryableProviderError(`El proveedor de IA respondió ${status}`);
    }
    if (status === httpUnauthorized || status === httpForbidden) {
      return new ServiceUnavailableException('La credencial del proveedor de IA no es válida');
    }
    if (status === httpBadRequest) {
      return new BadGatewayException(
        'El modelo configurado rechazó la petición: revisa que soporte structured outputs y que el contexto alcance',
      );
    }
    return new BadGatewayException(providerErrorMessage);
  }

  private apiKey(): string | undefined {
    return this.config.get('OPENAI_API_KEY', { infer: true });
  }
}

/** Error transitorio: 408/409/429, 5xx o fallo de red. Sólo estos se reintentan. */
export class RetryableProviderError extends BadGatewayException {}

function isRetryable(error: unknown): boolean {
  return error instanceof RetryableProviderError;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Error de red hacia el proveedor de IA';
}
