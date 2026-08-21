# Mentor Mode — coaching con IA sobre los datos del journal

## Context

El journal está completo hasta Fase 4 y en producción, pero toda la interpretación de los
datos sigue siendo manual: el dashboard y Reports muestran números y el trader saca sus
propias conclusiones. `Mentor Mode` existe desde el primer commit como ítem de menú
deshabilitado ([app-shell.component.ts:112](apps/frontend/src/app/core/layout/app-shell.component.ts#L112),
`disabled: true`) — nunca se desarrolló. No hay ruta, ni backend, ni tipos: es greenfield.

El objetivo es cerrar ese hueco: una página que tome los datos reales del journal, los mande a
OpenAI y devuelva coaching accionable y breve — diagnóstico, fugas, **qué eliminar** y reglas
concretas, en 200 palabras. No otro dashboard: una nota de mentor sobre tus números, guardada en
historial para comparar mes a mes.

### Materia prima

Cuantitativo por trade: `enteredAt`, `exitedAt`, `durationSeconds`, `contracts`, `direction`,
`pointsTotal`, `gross`, `commission`, `net`, instrumento, cuenta.

Cualitativo — esto es lo que hace posible un mentor de verdad:
- `emotion` (obligatorio): `CONFIDENT` / `MISTAKE` / `PARAM_ERROR` / `EMOTIONAL_ERROR`
- `exitReason`: `TARGET` / `TRAILING_STOP` / `INITIAL_STOP` / `MANUAL` — proxy de disciplina
- `entryReason` (texto libre ≤2000) y `notes` (≤10 000)
- `tradeType`: el playbook del usuario, tabla editable
- `Session`: notebook, una nota libre por día (≤20 000) + `mood`

### Límite de fondo

**No hay** precio de entrada/salida, ni stop/target planeado, ni MAE/MFE, ni R-múltiplo. No se
puede calcular R, ni "cuánto dejaste sobre la mesa", ni planeado-vs-ejecutado. El análisis se
apoya en P&L, duración, tamaño, hora y los campos cualitativos. Conviene saberlo antes de
esperar métricas tipo TradeZella que necesitan precios.

## Decisiones tomadas

| Tema | Decisión |
| --- | --- |
| Alcance v1 | Informe estructurado + historial. Sin chat de seguimiento. |
| Privacidad | Se envía todo el texto libre solo después de consentimiento explícito; se informa qué se envía y que el digest queda guardado en el historial. |
| "Qué eliminar" | La IA deduce y prioriza el impacto a partir de los netos por segmento. |
| Periodo | Selector mes / año / todo, reutilizando `MonthPickerComponent`. |
| Longitud de la **salida** | **≤200 palabras en total para el texto generado por OpenAI.** No cuenta el JSON estructural, los IDs, las cifras del digest ni el disclaimer fijo de la UI. |
| Longitud de la **entrada** | Completa mientras quepa en el presupuesto de contexto; si no, degradación ordenada y explícita. |

Las dos longitudes son asimétricas a propósito: **entrada generosa, salida quirúrgica.** El
modelo recibe todo lo que necesita para tener criterio, y devuelve solo el criterio. Los números
los lleva la pantalla desde el digest determinista; el modelo aporta un veredicto corto y
afilado, no un informe largo que nadie relee.

El límite de 200 palabras aplica **solo a la suma del texto de `diagnosis`, `leaks[].text`,
`eliminate[].text`, `rules[].text` y `focus` generado por OpenAI**. No limita el digest, la
tabla, el historial, las etiquetas, las cifras verificadas ni el disclaimer constante del
frontend. El backend cuenta las palabras sobre la respuesta final normalizada; los límites por
carácter son una primera barrera, no la garantía única.

Eso significa que, mientras el digest quepa en el presupuesto, el input **no** se muestrea ni se
resume: van todas las notas de todos los trades del periodo, todo el notebook, todos los buckets
de todas las dimensiones, la serie diaria completa y el consejo del informe anterior. Si se
alcanza el tope, se aplica únicamente la degradación ordenada descrita en "El input lleva todo
el contexto".

Sobre "qué eliminar": el backend igual calcula los netos por segmento, porque si no el modelo
tendría que sumar miles de números y ahí sí falla. La IA hace la deducción y el ranking.

El backend también construye una lista de candidatos elegibles con `confidence` `HIGH` o
`MEDIUM`, P&L negativo y el contrafáctico `netWithoutBucket`. La IA elige y redacta como máximo
dos candidatos; no calcula `delta`, no inventa candidatos `LOW` y no se suman impactos entre
dimensiones. La tabla de la UI se construye siempre con esos datos deterministas.

## Qué se implementa

Tres capas, en este orden. Cada una es útil sola y se puede probar antes de la siguiente.

### Capa 1 — El digest determinista (sin IA)

El corazón del feature. El backend calcula **todo** número server-side; la IA nunca hace
aritmética. `GET /api/mentor/digest` devuelve esto y funciona aunque no haya API key.

Lo nuevo es un **motor genérico de cortes**: una función que, dada una forma de agrupar,
devuelve por bucket `{ trades, wins, losses, breakEven, netBeforeDataFees, winRate, avgWin,
avgLoss, expectancy, profitFactor, sharePct, confidence }`. Con eso cada dimensión cuesta ~3
líneas de config:

| Dimensión | Buckets | Para qué |
| --- | --- | --- |
| `TRADE_TYPE` | los tipos del usuario | ¿qué setup del playbook gana? |
| `EMOTION` | los 4 valores | fugas psicológicas |
| `EXIT_REASON` | los 4 valores | ¿cortas ganadores? ¿respetas el stop? |
| `DIRECTION` | LONG / SHORT | sesgo direccional |
| `INSTRUMENT` | símbolos operados | ¿hay uno que solo te cuesta? |
| `HOUR` | horas UTC con datos | ventana horaria real de tu edge |
| `WEEKDAY` | Dom–Sáb | días malos |
| `CONTRACTS` | 1, 2, 3, 4-5, 6-10, 11+ | disciplina de tamaño |
| `DURATION` | [0,1m), [1,5m), [5,15m), [15,60m), ≥60m | ¿aguantas o te sales temprano? |
| `TRADE_ORDINAL` | 1, 2, 3, 4, 5, 6+ del día | **detector de overtrading** |
| `PRIOR_OUTCOME` | primero del día / tras ganar / tras una pérdida / tras 2+ pérdidas | **detector de tilt** |

Las dos últimas son las que un dashboard normal no da y donde suele estar el dinero.

**Invariante obligatorio:** cada dimensión es una *partición* — todo trade cae en exactamente
un bucket y `sum(buckets.trades) === overall.trades`. El builder lo verifica y lanza si no
cuadra; sin eso cualquier razonamiento de "qué pasaría si quito X" es inválido.

Las fronteras son explícitas y no se solapan: duración usa intervalos semiabiertos; `HOUR`,
`WEEKDAY`, ordinal y resultado previo usan UTC; el día se determina por `enteredAt`; los empates
se resuelven por `enteredAt` y luego por `trade.id`. `PRIOR_OUTCOME` significa exactamente
`FIRST_OF_DAY`, `AFTER_WIN`, `AFTER_ONE_LOSS` o `AFTER_TWO_PLUS_LOSSES`, nunca categorías
acumulativas. Las dimensiones con datos no utilizables tienen bucket `UNREVIEWED`.

Los imports no se consideran observaciones válidas de emoción ni de salida: aunque el modelo
`Trade` guarde los defaults `CONFIDENT` y `MANUAL`, el digest los marca como `UNREVIEWED` o los
excluye de esas conclusiones y expone la cobertura manual/importada en `sourceMix`.

Además de las dimensiones, el digest lleva:
- `overall` — los mismos KPIs del dashboard, para poder cruzarlos.
- `behavior` — overtrading (trades/día vs neto del día), tilt (neto y tamaño medio tras ganar
  vs tras perder, segundos hasta la siguiente entrada) y disciplina (cuota de cierre manual, de
  stop inicial, de trades sin `entryReason` escrito).
- `notes` — **todo** el texto libre del periodo: `entryReason` y `notes` de cada trade, y cada
  nota del notebook con su `mood`. Sin muestreo (ver abajo).
- `daily` — serie diaria completa: fecha, trades, neto, win rate. Es lo que deja ver rachas,
  ritmo y qué días se rompió la disciplina.
- `previousAdvice` — el `diagnosis`, las `rules` y el `focus` del informe anterior, si existe.
  Barato y es lo que convierte esto en un mentor: puede preguntarte si cumpliste lo que te dijo
  el mes pasado, en vez de analizar cada mes desde cero. **Tiene que ser el último informe de un
  periodo estrictamente anterior**, no "el más reciente": si fuera lo segundo, al regenerar
  agosto el previo pasaría a ser el propio informe de agosto, el hash cambiaría y el cache no
  acertaría nunca. Con la definición correcta, para agosto siempre es el de julio y el hash
  queda estable.
- `sourceMix` — trades `MANUAL` vs importados (ver riesgo 3).
- `dataGaps` — lista fija en español de lo que el journal NO registra, para que el modelo no
  invente R-múltiplos ni hable de stops planificados.

**Los netos por bucket van sin el fee de data.** El fee se cobra por cuenta y periodo, no por
operación, así que no es imputable a un setup ni a una hora — mismo criterio que `feesApply()`
en [insights.service.ts](apps/backend/src/modules/insights/insights.service.ts). El fee vive
solo en `capital.dataFees` y en `netAfterFees`. Hay que etiquetarlo en la UI o el "neto del
periodo" del mentor parecerá contradecir al del dashboard.

Para evitar ambigüedad, `overall` expone ambos valores con nombre explícito:
`netBeforeDataFees` y `netAfterDataFees`. Los buckets exponen `netBeforeDataFees` porque el fee
no es imputable; expectancy y profit factor documentan si usan neto antes de fee, y `PF` es
`null` cuando no existen pérdidas pero sí ganancias, igual que Insights. La UI nunca etiqueta un
bucket sin fee simplemente como "neto total".

**Confianza por bucket:** `HIGH` con ≥30 trades, `MEDIUM` con ≥10, `LOW` por debajo; degrada un
nivel si un solo trade explica más del 50% del **P&L absoluto** del bucket. Si el P&L absoluto
es cero, la concentración es `null` y no degrada. `sharePct` también se define sobre P&L
absoluto; no se fuerza a sumar 100% cuando el neto total es cero o hay signos opuestos. Esto
evita que 4 operaciones parezcan un patrón. Los `LOW` se renderizan en gris con la advertencia
visible y no son candidatos para "qué eliminar".

#### El input lleva todo el contexto

Mientras no se alcance el presupuesto, el digest **no se muestrea ni se resume**. Van todos los
buckets de las 11 dimensiones (incluidas las horas con pocos trades), los resúmenes mensuales
del rango seleccionado, la serie diaria completa y, sobre todo,
**todo el texto libre**: el `entryReason` y las `notes` de cada trade del periodo, y cada nota
del notebook con su `mood`. Ahí está el "por qué" que ningún número captura, y recortarlo era
justo lo que dejaba al mentor sin criterio.

`MENTOR_MAX_DIGEST_CHARS` sigue existiendo pero cambia de propósito: **ya no es ahorro de
tokens, es una válvula contra el límite de contexto del modelo.** El límite de caracteres es
conservador y debe dejar margen para el prompt y la salida; no se presenta como equivalencia
exacta de tokens. El digest debe incluir un presupuesto efectivo de entrada o una configuración
equivalente para no enviar un año completo a un modelo pequeño. Cuentas de referencia: las
11 dimensiones son ~30-40 KB de JSON, y las notas reales suelen ser de unos cientos de
caracteres por trade — un mes entero cabe de sobra.

Si el tope se alcanza (por ejemplo, un año completo con notas larguísimas), la degradación es
ordenada y **el texto libre es lo último que se toca**: primero se recorta la serie diaria a los
últimos 120 días, luego los meses a los últimos 24, y solo entonces se empiezan a truncar las
notas — priorizando conservar íntegras las de trades perdedores y peores días, que es donde está
el diagnóstico. Se marca `notes.truncated = true` y se loguea, para que nunca sea silencioso.

Los límites de 2000 chars en `entryReason` y 10 000 en `notes` son los que ya impone el propio
formulario de trades, así que el techo real por trade ya está acotado en origen.

### Capa 2 — La llamada a OpenAI

`POST /api/mentor/reports` construye el digest, lo serializa y pide un informe estructurado.

- **`fetch` nativo, sin SDK.** `AbortSignal.timeout()` para el timeout; reintentos con backoff
  exponencial solo en `408/409/429/5xx` y errores de red, nunca en `4xx` deterministas. Errores
  mapeados a excepciones Nest con mensaje en español; el cuerpo del proveedor se loguea con el
  request-id pero no se devuelve al cliente.
- **Structured outputs con `strict: true`**, con el JSON Schema derivado del Zod compartido vía
  `z.toJSONSchema()`. Una sola fuente de verdad: el mismo schema arma el request y valida la
  respuesta. Structured Outputs exige objetos con `additionalProperties: false` y todos los
  campos en `required`; los valores opcionales se representan como unión con `null`. Ver
  [OpenAI Docs](https://developers.openai.com/api/docs/guides/structured-outputs). Hay que
  quitar la clave `$schema` si el gateway/modelo la rechaza y probar el schema contra el modelo
  configurado antes de producción. Las restricciones `maxLength`/`maxItems` no se usan en el
  schema del proveedor por compatibilidad entre modelos y gateways; la longitud se valida y se
  normaliza localmente, pero no se afirma que sean rechazadas por todo modelo compatible.
  Sigue habiendo una sola fuente de verdad semántica en Zod: del mismo schema se deriva una
  proyección compatible para el proveedor y una validación local más estricta para la respuesta.
- **Chat Completions**, no la Responses API, solo por compatibilidad: así un `OPENAI_BASE_URL`
  distinto sirve para un gateway local o un proxy si respeta el contrato de `/chat/completions`.
  Azure puede requerir ruta, versión de API y autenticación propias; si se soporta, se prueba
  explícitamente con un adapter o una prueba de integración, no se asume que cambiar la URL baste.
- **Sin `temperature`** en el body por portabilidad; omitirlo evita depender de diferencias entre
  modelos y no se vende como mecanismo de determinismo.
- **Cache por hash del digest.** `sha256` del digest canónico (claves ordenadas, excluyendo
  `generatedAt`) + versión de prompt. Mismo hash → se devuelve el informe guardado, sin llamar
  ni pagar. En régimen estacionario es **una llamada pagada por día de trading**, porque el
  hash solo cambia cuando cambian los trades. Es el control de coste que de verdad importa.
  Con periodo "todo", `period.to` hay que recortarlo al último trade y no a `now()`, o el hash
 nunca repite.

  El cache no sustituye la idempotencia: dos `POST` simultáneos pueden leer antes de que exista
  el informe. `MentorReport` debe tener una clave única que incluya `userId`, `accountId` o
  `accountSetKey`, periodo, `digestVersion`, `digestHash` y `promptVersion`; además, el servicio
  debe resolver carreras y hacer el límite diario de forma atómica. Todas las lecturas, detalles
  y borrados se filtran siempre por `userId`, y cada cuenta solicitada se valida como propiedad
  del usuario.
- **Degradación limpia:** sin `OPENAI_API_KEY`, el `POST` responde **200** con `advice: null` y
  el digest completo, y la página muestra todos los números en modo sólo-datos. Un 503 aquí
  sería peor producto.

El system prompt (español) fija las reglas que hacen el trabajo: todos los números ya están
calculados, cópialos literal; si no está en el digest no lo supongas; **no hables de R ni de
ratio riesgo/beneficio porque no existen en los datos**; ignora los buckets `LOW` salvo para
señalar falta de muestra; las horas son UTC; cada afirmación debe citar referencias
`dimensionId` + `bucketKey` reales. Y la regla de estilo: **frases cortas, sin preámbulo, sin
motivación genérica, sin repetir la pregunta.** El texto libre del trader se serializa como
datos dentro de un bloque delimitado, nunca como instrucciones. Se escapan delimitadores y el
prompt repite que esas notas no pueden cambiar las reglas del sistema.

#### La respuesta de OpenAI cabe en 200 palabras porque el contrato no deja otra

Esto aplica **solo al texto de la salida de OpenAI**. La entrada conserva todo el contexto hasta
el presupuesto de contexto; si se alcanza, se aplica la degradación descrita arriba.

Pedirle "máximo 200 palabras" a un modelo no funciona: no las cuenta bien. El límite se hace
**estructural**, con un tope de caracteres por campo cuya suma da el presupuesto:

| Campo | Tope | Palabras aprox. |
| --- | --- | --- |
| `diagnosis` | 1-2 frases, 240 chars | ~40 |
| `leaks[]` | máx **3**, 120 chars cada una | ~60 |
| `eliminate[]` | máx **2**, 120 chars cada una | ~40 |
| `rules[]` | máx **3**, 80 chars cada una | ~40 |
| `focus` | 100 chars | ~17 |
| **Total** | **1180 chars** | **~197** |

Los topes de caracteres son una barrera práctica, pero no garantizan por sí solos 200 palabras:
una respuesta con palabras muy cortas puede superar el límite. Por eso el backend también cuenta
las palabras de todos los campos textuales después de normalizar la respuesta.

Cada `leaks[]` y `eliminate[]` es `{ dimensionId, bucketKey, text }`: el bucket es lo que
permite renderizar los números reales al lado, así que el `text` solo tiene que aportar el
criterio, nunca repetir cifras. Eso es lo que hace que 120 chars alcancen.

Se cae todo lo que no cabe: `strengths`, `experiments`, `metricsToTrack`, `summary` largo, el
scorecard de 4 ejes y las justificaciones. El `score` 0-100 solo sobrevive si se define una
rúbrica estable y comparable; si lo genera libremente el modelo, se elimina de v1. El
`disclaimer` es **constante nuestra en el frontend, no un campo que el modelo escriba** — así no
consume presupuesto.

Detalles de implementación:
- **Los topes de longitud no se envían en el JSON Schema del proveedor.** Se mantienen en el
  prompt como instrucciones y en la normalización local para conservar compatibilidad entre
  modelos y gateways.
- **Se parsea primero con un schema estructural sin límites de longitud**, se normaliza después y
  se valida una segunda vez con el schema de dominio. Si un campo se pasa, se trunca en el último
  espacio sin romper palabras; la elipsis cuenta dentro del límite.
- Los máximos de arrays se aplican con `.slice()` después del parseo y antes de la validación
  final.
- Se ejecuta un contador determinista de palabras sobre la suma de los campos textuales. Si aún
  supera 200, se recortan en orden `focus`, reglas, fugas, eliminación y diagnóstico; no se
  reintenta ni se cobra una segunda llamada.
- `OPENAI_MAX_OUTPUT_TOKENS` baja a **700** por defecto: ~200 palabras en español son ~300
  tokens, más el andamiaje JSON. Sube de paso el margen contra el 524 de Cloudflare.

**Cómo se verifica cada cifra.** Cada elemento textual que haga una afirmación (`diagnosis`,
`rules`, `focus`, `leaks[]` y `eliminate[]`) lleva referencias estructuradas a uno o más
`{ dimensionId, bucketKey }` reales. Backend y frontend validan esas referencias contra el
digest; una referencia inexistente se marca como no verificable y no puede presentarse como
evidencia. Los números siempre se renderizan desde el digest, nunca desde el texto del modelo.

### Capa 3 — La página

Ruta `/mentor`, lazy, dentro de la rama de `authGuard`. El ítem del menú solo pierde
`disabled: true` y se mueve junto a Reports.

Con una respuesta de 200 palabras la página se acorta sola: el texto de la IA ocupa una tarjeta,
y el resto del espacio es el digest determinista. Queda más parecido a una nota del coach pegada
sobre tus números que a un informe.

1. **Header + toolbar** — `journal-month-picker` con `allowAllYears`/`allowAllMonths` y el botón
   "Generar análisis", más el nombre del modelo configurado como texto discreto (viene de
   `GET /api/mentor/status`, es informativo, no editable). Si la cuenta es `ALL`, aviso de que
   mezclar una evaluación de prop firm con una cuenta real da consejos poco accionables. Si
   mezcla monedas, la generación se bloquea hasta elegir una cuenta o definir conversión.
   El aviso de cuentas homogéneas informa, no bloquea.
2. **Veredicto** — una sola tarjeta con todo lo que dijo la IA: `diagnosis` en serif, un `score`
   0-100 solo si usa una rúbrica estable, las 3 reglas numeradas y el `focus` en un callout. Cabe entero sin scroll. Aquí ya no
   va radar: con cuatro ejes menos, un número grande comunica igual y elimina un gráfico.
3. **Qué eliminar** — la tabla rankeada, que es lo que pediste, construida **desde el digest**:
   qué, cuántas ops, neto actual, neto sin eso, delta y confianza. Donde la IA citó ese bucket,
   su frase de ≤120 chars se muestra como nota de la fila. **Al expandir se ven los stats reales
   del bucket** — la afirmación y su aritmética a un clic. Un `journal-chart` de barras
   horizontales para el impacto de los 6 primeros: es el único sitio donde un gráfico gana a una
   tabla. Nota obligatoria de que es un contrafáctico, no una predicción.
4. **Fugas** — las 3 líneas de la IA, cada una con los stats reales de su bucket al lado. Sin
   fortalezas: con 200 palabras, el presupuesto se gasta en lo que hay que corregir.
5. **Los números** — tabla del digest con selector de dimensión, ordenada por neto ascendente
   (lo que más sangra primero). Es la superficie de verificación; a propósito sin gráfico.
6. **Historial** — riel derecho sticky en `xl`, abajo en móvil.

La generación **nunca es automática**. Los `effect()` de `reports.page.ts` se disparan con cada
cambio de cuenta; copiar eso aquí lanzaría una llamada al modelo cada vez que cambias de
cuenta. El effect recarga el historial y limpia el informe; solo el clic genera. Y si ya existe
informe de ese periodo, `ConfirmService.ask` antes de gastar otra llamada.

## Archivos

### Backend

```
apps/backend/src/modules/mentor/
├── mentor.module.ts
├── mentor.controller.ts
├── mentor.service.ts        orquesta: guards, cache por hash, persistencia, toDto
├── digest.stats.ts          helpers Decimal: winRate, PF, expectancy, dateKeyUtc
├── digest.segments.ts       motor genérico de cortes + assertPartition
├── digest.dimensions.ts     las 11 definiciones + bucketing
├── digest.builder.ts        carga datos y ensambla el MentorDigest
├── digest.notes.ts          recolección del texto libre + degradación si se pasa del tope
├── openai.client.ts         fetch nativo: timeout, reintentos, mapeo de errores
└── mentor.prompt.ts         versión de prompt + system/user + JSON Schema
```

Ningún archivo pasa de ~180 líneas. `MentorModule` se registra en
[app.module.ts](apps/backend/src/app.module.ts) después de `InsightsModule`; no necesita
`imports` porque `PrismaModule` y `ConfigModule` son globales.

Otros cambios:
- [prisma/schema.prisma](apps/backend/prisma/schema.prisma) — modelo `MentorReport` (`digest
  Json`, `advice Json?`, `digestHash`, `digestVersion`, `promptVersion`, periodo/cuenta, tokens,
  coste estimado) + enum `MentorReportStatus` + back-relations en `User` y `Account`. Índices
  `[userId, createdAt]` y una restricción única sobre usuario, cuenta o conjunto de cuentas,
  periodo, versiones y hash. Sería la primera columna `Json` del schema. Migración:
  `pnpm --filter @journal/backend prisma:migrate --name mentor_reports`.
- [config/env.validation.ts](apps/backend/src/config/env.validation.ts) — `OPENAI_API_KEY`
  (opcional: sin ella degrada), `OPENAI_BASE_URL`, `OPENAI_MODEL`, `OPENAI_TIMEOUT_MS`,
  `OPENAI_MAX_RETRIES`, `OPENAI_MAX_OUTPUT_TOKENS`, `MENTOR_MIN_TRADES`,
  `MENTOR_MAX_DIGEST_CHARS`, presupuesto efectivo de contexto, `MENTOR_DAILY_LIMIT` y las tarifas
  `MENTOR_PRICE_INPUT_PER_MTOK` / `MENTOR_PRICE_OUTPUT_PER_MTOK` (default 0) solo para estimar
  coste. **Nada entra en el `superRefine` de producción** — el feature es opcional.

#### El modelo se elige en el `.env`, y es uno solo

`OPENAI_MODEL` es **el** modelo que se usa, y va **sin default en el código**: lo define quien
despliega. Dos razones: no hornear un ID que puede no existir o quedar deprecado, y que cambiar
de modelo sea editar una línea del `.env` y reiniciar, sin tocar código.

Consecuencias deliberadas:
- **No hay selector en la UI**, ni allowlist, ni lista traída de la API del proveedor. El
  frontend no manda nunca un nombre de modelo en el body — si lo hiciera habría que validarlo
  server-side para que nadie pida por API un modelo mucho más caro. Al vivir solo en el `.env`,
  ese problema no existe.
- `GET /api/mentor/status` devuelve el modelo configurado y la página lo muestra **solo como
  información** (una línea discreta junto al botón), para que sepas con qué se generó sin poder
  cambiarlo desde ahí.
- Si `OPENAI_API_KEY` está presente, el backend valida al arrancar que `OPENAI_MODEL` también
  exista y ejecuta una comprobación de compatibilidad del formato en el primer uso. El modelo
  se puede fijar a un snapshot en producción; cambiar el `.env` incrementa la versión de modelo
  registrada, pero no altera informes históricos.
- La columna `model` de `MentorReport` guarda con qué modelo se generó cada informe. Así, si
  algún día cambias el `.env`, el historial sigue siendo honesto sobre qué produjo cada uno.
- Si el modelo configurado no soporta structured outputs, el proveedor devuelve `400` y el
  cliente lo mapea a un error claro en español en vez de a un 500 opaco.
- [.env.example](apps/backend/.env.example) — espejo del bloque, con `OPENAI_API_KEY=` vacía y
  la nota de que en blanco deshabilita la mitad IA pero `GET /api/mentor/digest` sigue viva.

Endpoints, todos detrás del `JwtAuthGuard` global, **ningún `@Public()`**:

| Ruta | Notas |
| --- | --- |
| `GET /api/mentor/status` | habilitado, modelo, mínimo de trades, consumo del mes |
| `GET /api/mentor/digest` | siempre disponible, no depende de OpenAI |
| `GET /api/mentor/reports` | historial (sin el digest, para que pese poco) |
| `GET /api/mentor/reports/:id` | informe completo |
| `POST /api/mentor/reports` | genera. `@Throttle({ default: { ttl: seconds(3600), limit: 10 } })` |
| `DELETE /api/mentor/reports/:id` | 204 |

Tres capas de control de gasto se acumulan: el throttle global de 100/min, el de 10/hora en el
POST y `MENTOR_DAILY_LIMIT` por usuario y día UTC en el servicio. El límite se reserva de forma
atómica solo para llamadas no cacheadas; las respuestas cacheadas no consumen cuota. Más el
cache por hash, que es el que evita pagar dos veces. El caso "no hay suficientes trades" devuelve
**`422` con
`{ code: 'NOT_ENOUGH_TRADES', minTrades }`** — el frontend lo necesita como código, no como
string, para pintar un estado vacío en vez de un banner rojo.

#### Privacidad y contenido no confiable

Antes de la primera generación, la UI muestra una confirmación breve: se enviarán al proveedor
las notas de trades y sesiones del periodo, y el digest completo se guardará en el historial.
La generación requiere consentimiento explícito; si no se acepta, el digest determinista sigue
disponible. Nunca se loguean la API key, el prompt, las notas ni el cuerpo completo de un error
del proveedor: solo request-id, código, estado y un mensaje sanitizado. El frontend renderiza
texto de IA y notas con interpolación segura, nunca con `innerHTML` ni Markdown sin sanitizar.

### shared-types

`packages/shared-types/src/mentor.ts` con todos los schemas, re-exportado desde
[index.ts](packages/shared-types/src/index.ts) con un bloque de named re-exports (el estilo de
los bloques nuevos, no `export *`).

El schema de `advice` separa el contrato estructural del contrato de evidencia: cada elemento
textual que pueda afirmar algo lleva `refs` con `{ dimensionId, bucketKey }`. `diagnosis`, cada
regla y `focus` pueden llevar varias referencias; `leaks[]` y `eliminate[]` llevan al menos una.
Los `bucketKey` son dinámicos, así que el backend los valida contra el digest concreto antes de
persistir y el frontend vuelve a validarlos antes de mostrarlos como evidencia.

Los enums nuevos van en **MAYÚSCULAS en inglés** con etiqueta española, como todo el repo — no
`high|medium|low`. Se agregan a `enumLabels`: `mentorSeverity` y `mentorConfidence`
(`{ HIGH: 'Alta', MEDIUM: 'Media', LOW: 'Baja' }`). Las etiquetas de las dimensiones van en
`mentor.ts` como `mentorDimensionLabels`, **no** en `enumLabels` — ese mapa refleja enums de
Prisma y `MentorDimensionId` no lo es. Para `EMOTION`/`EXIT_REASON`/`DIRECTION` se reutiliza el
`enumLabels` existente, para no tener las traducciones en dos sitios.

### Frontend

```
apps/frontend/src/app/features/mentor/
├── mentor.page.ts / .html / .scss   shell, toolbar, máquina de estados, grid
├── mentor.store.ts                  signals + API + toasts
├── mentor.labels.ts                 bucketLabel, optional scoreClass, winRateClass, pfClass, formatPct
├── mentor-verdict.component.*       diagnosis + optional score + reglas + foco (todo el texto de la IA)
├── mentor-eliminate.component.*     la tabla rankeada + barra de impacto + drill-down
├── mentor-leaks.component.*         las 3 fugas, cada una con los stats reales de su bucket
├── mentor-digest.component.*        tabla de verificación con selector de dimensión
└── mentor-history.component.*       riel de informes anteriores
```

Cinco hijos en vez de seis, y con templates bastante más chicos: al caber la respuesta en 200
palabras, `verdict` absorbe lo que iban a ser dos componentes (veredicto y plan) y `findings` se
reduce a `leaks`. Nadie se acerca al budget de 16 kB.

El estado "generando" se queda en el template de la página con `journal-skeleton` con la forma
del informe real más un contador de segundos — no merece componente propio.

Cambios fuera de la carpeta:
- [app.routes.ts](apps/frontend/src/app/app.routes.ts) — hijo lazy `mentor` en la rama de
  `authGuard`, antes del `**`, con la forma `(m) => m.MentorPage`.
- [app-shell.component.ts:112](apps/frontend/src/app/core/layout/app-shell.component.ts#L112) —
  quitar `disabled: true` y mover el ítem junto a Reports. El template no se toca: ya bindea
  `pointer-events-none`/`opacity-50` contra `item.disabled`.
- `apps/frontend/src/styles.scss` — subir `.card-panel` (hoy local en `dashboard.page.scss`) al
  bloque de utilidades compartidas. Los estilos globales no cuentan para el budget de
  componente, así que es la forma más barata de que seis componentes lo usen.
- [shared/months.ts](apps/frontend/src/app/shared/months.ts) — `weekdayNamesShort`, hoy
  duplicado dos veces en `reports.page.ts` y una en `time-perf-chart.component.ts`. Migrar esos
  call sites es opcional y va aparte.

Detalle del store que importa: `ApiClient.messageFromError` devuelve solo un string, pero "no
hay suficientes trades" tiene que ser un **estado vacío informativo**, no un banner rojo. El
store importa el *tipo* `HttpErrorResponse` para leer `err.error.code` y ramificar. Es la única
desviación deliberada de la regla de no tocar HTTP fuera de `ApiClient`, va con comentario, y
tiene precedente en `auth-refresh.interceptor.ts`.

## Piezas existentes a reutilizar

| Pieza | Ruta | Para qué |
| --- | --- | --- |
| `classifyTradeResult`, `breakEvenPointsThreshold` | `packages/shared-types/src/insights.ts` | Clasificar WIN/LOSS/BREAKEVEN igual que el resto (±1 punto = scratch). |
| `enumLabels` | `packages/shared-types/src/enums.ts` | Etiquetas español para prompt y UI. Nunca traducir a mano. |
| `MonthPickerComponent` | `shared/ui/month-picker.component.ts` | Selector de periodo. `allowAllYears`/`allowAllMonths` ya dan el modo "todo". |
| `yearRange`, `monthKey`, `shiftMonthKey` | `shared/months.ts` | Rangos de año y comparativa con el mes anterior. |
| `formatUsd`, `pnlClass`, `formatDuration` | `shared/format.ts` | Presentación. Todos formatean en UTC — no introducir hora local. |
| `Skeleton`, `EmptyState`, `ErrorBanner`, `SubmitButton` | `shared/ui/` | Carga / vacío / error / botón con spinner. |
| `journal-chart` | `shared/ui/chart.component.ts` | Gráficos. Nunca `echarts.init` en la feature. |
| `NotificationService`, `ConfirmService` | `core/notifications/`, `core/confirm/` | Toasts y confirmaciones. Prohibido `window.alert`/`confirm`. |
| `ApiClient` | `core/http/api.client.ts` | Prefija `/api/`, manda cookies, `messageFromError`. |
| `InsightsStore.loadAvailableMonths` | `features/dashboard/insights.store.ts` | Poblar el month-picker, como hace `reports.page.ts`. |

Lectura de datos en el backend: `TradesModule` y `SessionsModule` **no exportan** sus
servicios, y `TradesService.toDto` convierte los `Decimal` a string. El digest necesita
aritmética precisa, así que lee filas crudas con Prisma directo (`PrismaModule` es `@Global()`)
en vez de reusar los DTOs o tocar módulos existentes. Se opera con `Prisma.Decimal` (`.plus()`,
`.minus()`, `.toFixed(2)`) como en `insights.service.ts` y se convierte a string solo al armar
la respuesta — nada de `Number()` intermedio.

Logging: el repo no tiene objeto `log` global, usa el `Logger` de Nest
(`new Logger(MentorService.name)`, ver `crypto.service.ts:14`). Se mantiene esa clase con el
formato de mensaje `Clase > método - descripción`. Nunca loguear la API key ni el prompt.

## Orden de trabajo

| # | Paso | Cómo se comprueba |
| --- | --- | --- |
| 1 | `shared-types/src/mentor.ts` + `index.ts` + `enumLabels` | `pnpm --filter @journal/shared-types build`, luego borrar `apps/frontend/.angular/cache` |
| 2 | Modelo `MentorReport` + back-relations + migración | `prisma generate` limpio |
| 3 | Env vars + `.env.example` | el backend arranca |
| 4 | `digest.stats.ts`, `digest.segments.ts`, `digest.dimensions.ts` + tests unitarios | `tsc --noEmit` + pruebas de particiones, límites, UTC, fees y confianza |
| 5 | `digest.builder.ts`, `digest.notes.ts` | — |
| 6 | Servicio (solo digest) + controller + módulo + `app.module.ts` | **`GET /api/mentor/digest` funciona sin OpenAI.** Cruzar `netAfterFees` contra `GET /api/insights/kpis` del mismo rango: deben coincidir al centavo |
| 7 | `openai.client.ts` + `mentor.prompt.ts` | probar el `POST` desde `/docs` |
| 8 | `generate` + cache por hash + persistencia + historial | segundo `POST` idéntico devuelve `cached: true` sin llamar |
| 9 | `mentor.store.ts` + `mentor.labels.ts` | verificar contra el backend en devtools antes de tocar un template |
| 10 | `mentor-eliminate` primero: es el feature, el layout más riesgoso y el primer uso real de ECharts. Luego `verdict`, `leaks`, `digest`, `history` | contar las palabras de una respuesta real: debe quedar en ≤200 |
| 11 | Página, ruta y shell | — |
| 12 | `pnpm format` desde la raíz | — |

Construir la capa 1 completa antes de tocar OpenAI es lo que permite validar que los números
del mentor cuadran con el dashboard **antes** de meter un LLM en la ecuación.

## Verificación

Los gates existentes de `pnpm lint` y `pnpm test` están rotos en este repo (no hay ESLint
instalado ni un solo `*.spec.ts`), pero el feature no acepta esa ausencia para la parte
estadística. Antes de conectar OpenAI se añade un runner mínimo y tests para `digest.stats`,
`digest.segments`, `digest.dimensions`, normalización de la respuesta y cache concurrente.

1. `pnpm --filter @journal/shared-types build`
2. `pnpm --filter @journal/frontend build` — chequea tipos en AOT **y** el budget de CSS. Leer
   la salida buscando avisos de `anyComponentStyle`: 8 kB avisa, 16 kB falla.
3. `pnpm build` en la raíz.

Auditoría de convenciones, grepeable:
- `grep -rn 'style="' apps/frontend/src/app/features/mentor` → vacío.
- `grep -rn '\[style\.' apps/frontend/src/app/features/mentor` → vacío.
- `grep -rniE '#[0-9a-f]{3,6}' apps/frontend/src/app/features/mentor` → vacío, nada de hex.
- `grep -rn 'HttpClient\|window.alert\|window.confirm' .../features/mentor` → solo el import
  del *tipo* `HttpErrorResponse` en el store.

Manual con `pnpm dev`:
1. **Cuadre de números (el importante).** Tomar la fila #1 de "qué eliminar", expandirla y
   comparar `trades`/`net` contra el mismo bucket en la tabla del digest; y el neto del periodo
   contra `/reports` para la misma cuenta y rango. Si no cuadran, la UI está mostrando los
   números del modelo en vez de los del digest.
2. **El límite de 200 palabras.** Copiar el texto de `advice` de una respuesta real y contar
   palabras: debe ser ≤200, sin contar el JSON, IDs, cifras del digest ni disclaimer de la UI.
   Probar respuestas con palabras muy cortas, muchos buckets y 201 palabras; confirmar que la
   normalización final actúa en el último espacio y no corta una palabra a la mitad.
3. `GET /api/mentor/digest` con `OPENAI_API_KEY` vacía → responde igual. Luego `POST` → 200 con
   `advice: null` y la página en modo sólo-datos.
4. Doble clic en Generar → un solo `POST` en Network.
5. Regenerar el mismo periodo → aparece el confirm; cancelar no hace request.
6. Segundo `POST` idéntico → `cached: true`, sin latencia y sin tokens.
7. Dos `POST` idénticos simultáneos → una sola llamada al proveedor y un solo informe persistido.
8. Cambiar de cuenta con un informe en pantalla → se limpia, se recarga el historial, **no sale
   ningún POST**.
9. Un mes vacío → estado vacío informativo con el mínimo de trades, **sin banner rojo**.
10. Backend caído → banner rojo + toast, y el informe anterior sigue en pantalla.
11. Cambiar de tema con un informe abierto → **la barra de impacto se recolorea**. Es el bug más
    probable, por ser el primer uso real de `journal-chart`.
12. 390 px de ancho → el riel baja, la tabla scrollea dentro de su `overflow-x-auto` y la página
     no scrollea en horizontal.
13. Devtools: el `POST` va con cookies, **sin header Authorization**, y el `x-request-id` vuelve
     en la respuesta.
14. Sin consentimiento → el digest funciona, pero no se envía texto libre al proveedor.
15. Imports sin revisar → no generan coaching positivo basado en `CONFIDENT`/`MANUAL` falsos.

## Riesgos

1. **No hay precio, ni stop, ni R — es el techo del feature.** El mentor no puede evaluar
   colocación de stops, riesgo por operación, R-múltiplos ni cuánto devolviste de un ganador. Se
   mitiga con `dataGaps` y la regla de prompt que le prohíbe hablar de R. **La mejora con más
   retorno sería agregar `entryPrice`, `exitPrice`, `plannedStop` y `plannedTarget` al modelo
   `Trade`**: desbloquea R-múltiplo y calidad de stop, y aproximadamente duplica el valor de
   esta pantalla. Conviene versionar el digest para poder añadir un bloque `R` en la v2 sin
   invalidar el cache.
2. **Sobreajuste.** Unos cientos de trades cortados en 11 dimensiones producen buckets de 4
   operaciones que parecen edges. Para eso están los niveles de confianza, el chequeo de
   concentración y el gris en los `LOW`.
3. **La emoción de los trades importados es relleno, no dato.** `imports.service.ts:9,185`
   asigna `emotion = 'CONFIDENT'` y `exitReason = 'MANUAL'` a todo lo que entra por CSV de
   NinjaTrader. Si el periodo tiene muchos importados sin revisar, un corte por emoción "tal
   cual" produce coaching directamente equivocado ("operas con seguridad el 90% del tiempo").
   De ahí el `sourceMix` en el digest y el conteo explícito en el prompt.
4. **Los deltas de eliminación no son sumables entre dimensiones.** "Deja de operar tras una
   pérdida" y "deja de operar en MISTAKE" se solapan fuerte. Va como regla explícita del prompt;
   es el sitio más probable donde el modelo produzca un número seguro pero mal, y por eso la UI
   muestra el bucket real al lado.
5. **Un contrafáctico no es un pronóstico.** Quitar el bucket perdedor asume que el resto de la
   operativa no cambia, y es falso: esos trades eran parte de cómo se dio el día. El
   `disclaimer` es obligatorio y todo se redacta en pasado condicional.
6. **Coste, y es el trade-off consciente de este diseño.** La salida es trivial (~300 tokens),
   pero la entrada va completa a propósito: con todo el texto libre de un mes, del orden de
   20-40k tokens por llamada. Los tokens de entrada son bastante más baratos que los de salida y
   suelen tener descuento por cacheo del proveedor, así que sigue siendo razonable — pero es
   dinero real y conviene mirarlo. **El cache por hash es lo que lo hace sostenible**: en régimen
   estacionario se paga ~una llamada por día de trading, porque el hash solo cambia cuando
   cambian los trades. Vigilar `monthEstimatedCostUsd` en `GET /mentor/status` las primeras
   semanas; si molesta, la palanca es analizar por mes en vez de por año, no recortar el input.
   Las tarifas van por env var con default 0 — el código no asume ningún precio.
7. **La ventana de contexto es ahora una restricción real al elegir el modelo.** Al ir el input
   completo, analizar "todo el histórico" con años de notas puede no caber en un modelo de
   contexto pequeño. El proveedor devolvería un error de longitud, que el cliente ya mapea a un
   mensaje claro. Dos cosas que lo hacen manejable: el `MENTOR_MAX_DIGEST_CHARS` recorta antes de
   llegar ahí, y el periodo por defecto es el mes. Al elegir el `OPENAI_MODEL` conviene tener en
   cuenta su contexto, no solo su precio.
8. **Timeouts en producción.** La topología es Cloudflare Tunnel → nginx → backend. nginx está
   bien (`PLAN-DESPLIEGUE.md:65` pone `proxy_read_timeout 300s`), pero CLAUDE.md advierte que
   `deploy/nginx-journal.conf` **nunca se commiteó**, así que hay que verificar que la config
   viva en el mini-PC lo tenga (el default de nginx es 60s). Y **Cloudflare devuelve 524 a los
   ~100 s**, así que la generación debe terminar bien por debajo — se acota con los tokens de
   salida y el tamaño del prompt. Fastify no impone timeout propio.
9. **`journal-chart` sin estrenar.** `echarts` lo importa solo el wrapper; todos los gráficos
   actuales son SVG a mano. Mentor sería su primer consumidor real: presupuestar tiempo, y
   acordarse de que el `computed<EChartsOption>` debe depender de `ThemeService.theme()` o no se
   recolorea al cambiar de tema. Al caer el radar queda **un solo gráfico** en toda la pantalla,
   así que el riesgo baja bastante. Aparte: **`.qp-card` y `.qp-input` no existen** en ningún
   SCSS — `reports.page.html` las usa pero lo que estiliza esas cajas son los `style="..."`
   inline de al lado, así que ese template **no es el modelo a copiar**.
10. **Almacenamiento.** Cada informe guarda el digest completo. Con uno al día es del orden de
   100 MB/año: aceptable para un solo usuario, y para eso está el `DELETE`.
11. **`shared-types` y el cache de Vite.** Agregar `mentor.ts` son exports nuevos, justo el caso
    donde el dev server sirve un `dist/` rancio y tira `X is not a function`. Recompilar el
    paquete, borrar `apps/frontend/.angular/cache`, reiniciar `pnpm dev`. **No** tocar
    `prebundle` en `angular.json`: el `dist/` es CJS y excluirlo rompe la app.
12. **Privacidad y prompt injection.** Las notas pueden contener PII o texto que parezca una
    instrucción. Se mitiga con consentimiento, serialización como datos, delimitadores escapados,
    logs sanitizados y renderizado seguro. El usuario puede seguir usando el digest sin enviar
    texto al proveedor.
13. **Score no comparable.** Un número generado libremente por el modelo puede cambiar sin que
    cambien los datos. Se elimina en v1 o se calcula con una rúbrica determinista versionada.
14. **Semántica de KPIs.** El digest debe declarar explícitamente neto antes/después de fees,
    expectancy, profit factor, `null` e importes en moneda. La opción `ALL` no puede mezclar
    cuentas con monedas distintas sin conversión o bloqueo.
