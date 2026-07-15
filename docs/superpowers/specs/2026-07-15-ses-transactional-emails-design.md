# Paso 1: Notificaciones transaccionales por AWS SES

## Contexto y objetivo

Enviar un correo transaccional inmediatamente después de cada operación
financiera exitosa (depósito, transferencia P2P, exchange, gasto con
tarjeta virtual), usando AWS SES vía `@aws-sdk/client-ses`. Un fallo en el
envío del correo nunca debe afectar la transacción ya persistida en
Postgres ni producir un error 500 al usuario.

## Alcance

Las 4 operaciones que crean una fila en `transactions`:

1. Depósito (`transactions.controller.ts` → `deposit`)
2. Transferencia P2P (`p2p.controller.ts` → `transfer`) — notifica a
   remitente **y** destinatario
3. Exchange (`exchange.controller.ts` → `postExchangeController`)
4. Gasto con tarjeta virtual (`virtual-cards.controller.ts` →
   `simulateSpendController`) — solo si `status === "COMPLETED"`

Fuera de alcance para este paso: personalización con nombre del usuario
(el JWT solo trae `id` y `email`, no nombre), reintentos de envío,
cola/worker asíncrono, plantillas de otros idiomas.

## Arquitectura

Nuevo módulo `src/integrations/ses/`:

- **`ses.client.ts`**: wrapper delgado del SDK v3. Instancia un
  `SESClient` con las credenciales de `ENV` y expone
  `sendEmail(to: string, subject: string, html: string): Promise<void>`
  que arma y despacha un `SendEmailCommand`. Sigue el mismo patrón que
  `src/integrations/gemini/gemini.client.ts` (un cliente por integración
  externa, sin lógica de negocio).
- **`ses.templates.ts`**: función pura
  `buildTransactionEmailHtml(params: TransactionEmailParams): string`
  que genera el HTML responsive con: Monto, Moneda, Fecha, ID de
  transacción, Tipo de operación, Estado, y una lista opcional de filas
  extra (`extraRows?: { label: string; value: string }[]`) para el
  detalle específico de cada flujo (contraparte en P2P, tasa aplicada y
  monto convertido en exchange, comercio en gasto con tarjeta).
- **`ses.notifications.ts`**: única función que consumen los
  controllers, `notifyTransactionEmail(params): Promise<void>`. Arma el
  asunto según `type`, genera el HTML con `buildTransactionEmailHtml` y
  llama a `sendEmail`. Envuelve internamente el envío en `try/catch`:
  si falla, loguea con `logger.warn` (incluyendo `transactionId` y el
  mensaje de error) y retorna sin relanzar. Esta es la única capa de
  manejo de errores — los controllers no necesitan su propio try/catch
  para el correo, ya viene resuelto acá, evitando duplicar el mismo
  bloque en los 5 call sites.

Tipo compartido:

```ts
interface TransactionEmailParams {
  toEmail: string;
  transactionId: string;
  type: 'DEPOSIT' | 'P2P_TRANSFER' | 'EXCHANGE' | 'CARD_SPEND';
  status: string; // 'COMPLETED' en todos los casos de este paso
  amountInCents: number;
  currency: string;
  occurredAt: Date;
  extraRows?: { label: string; value: string }[];
}
```

## Configuración

`src/config/env.ts` incorpora:

```ts
AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID || '',
AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY || '',
AWS_REGION: process.env.AWS_REGION || '',
AWS_SES_FROM_EMAIL: process.env.AWS_SES_FROM_EMAIL || '',
```

`.env.example` documenta las 4 variables nuevas (sin valores reales).
Nueva dependencia en `package.json`: `@aws-sdk/client-ses`.

## Puntos de integración

Todos los controllers relevantes ya usan el middleware `isAuth`, por lo
que `req.user.email` está disponible sin consultas adicionales a la
base de datos (se confirmó revisando `exchange.routes.ts` y
`virtual-cards.routes.ts`). No se necesita tocar `UserRepository`.

En los 4 controllers, después de que el `service` correspondiente
resuelve con éxito (transacción ya persistida) y antes del
`res.status(...).json(...)`, se llama `await notifyTransactionEmail(...)`
dentro del mismo bloque `try` que ya envuelve el handler.

Caso particular P2P: se llama dos veces — una con `toEmail: senderEmail`
(mensaje "enviaste dinero") y otra con `toEmail: recipient_email`
(mensaje "recibiste dinero"), ambos datos ya disponibles en el
controller sin queries extra.

## Manejo de errores

- Errores de SES (credenciales inválidas, throttling, email no
  verificado en sandbox, etc.) se capturan dentro de
  `notifyTransactionEmail` y solo generan un log de `warn`. La respuesta
  HTTP de la operación financiera sigue su curso normal (200/201) porque
  la transacción en Postgres ya se guardó antes de intentar el envío.
- No hay reintentos en este paso — un fallo puntual de SES simplemente
  no envía el correo esa vez.

## Testing

- Unit test de `ses.templates.ts`: dado un `TransactionEmailParams`,
  el HTML generado contiene los 6 campos obligatorios.
- Unit test de `ses.notifications.ts`: si `sendEmail` (mockeado) lanza,
  `notifyTransactionEmail` no relanza y `logger.warn` es invocado.
- No se agregan tests de integración contra SES real (requiere
  credenciales); se mockea el `SESClient` en los tests existentes de
  los 4 flujos para verificar que se llama `notifyTransactionEmail` con
  los parámetros esperados y que un rechazo del mock no rompe la
  respuesta 201/200.
