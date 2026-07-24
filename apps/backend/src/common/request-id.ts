// Cabecera usada para correlacionar peticiones en logs y respuestas de error.
// Fastify la rellena en `request.id` (ver genReqId en main.ts).
export const REQUEST_ID_HEADER = 'x-request-id';
