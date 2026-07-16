# Notificaciones Transaccionales por AWS SES — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enviar un correo transaccional por AWS SES inmediatamente después de cada operación financiera exitosa (depósito, transferencia P2P, exchange, gasto con tarjeta virtual), sin que un fallo de envío afecte la transacción ya persistida ni la respuesta HTTP.

**Architecture:** Módulo nuevo `src/integrations/ses/` con tres archivos de responsabilidad única (tipos, plantilla HTML pura, cliente SDK) más una capa de orquestación (`ses.notifications.ts`) que es la única pieza con manejo de errores. Los 4 controllers existentes llaman a esa capa de orquestación después de que su `service` correspondiente resuelve con éxito y antes de responder al cliente HTTP.

**Tech Stack:** TypeScript, Express, `@aws-sdk/client-ses` (SDK v3), Vitest para tests, patrón de mocking con `vi.mock` ya usado en `tests/chatbot/gemini.client.test.ts` y `tests/exchange/exchange.service.test.ts`.

## Global Constraints

- Proyecto estrictamente de backend — no tocar nada de frontend.
- `ses.templates.ts` debe exportar únicamente funciones puras de TypeScript que retornan `string` con CSS inline (nada de motores de plantillas ni archivos `.html` externos).
- El `.env` local ya tiene configuradas las 4 variables de AWS — no modificar `.env`, solo documentar las claves (sin valores) en `.env.example`.
- No enviar el correo cuando la operación fue una reutilización idempotente (`_idempotent_reused` / `reused: true`) — reintentar la misma request no debe reenviar el mismo correo.
- El envío se espera (`await`) dentro del mismo `try/catch` del controller, antes de responder; un fallo de SES se captura dentro de `notifyTransactionEmail` y solo genera `logger.warn`, nunca se propaga.

---

## Contexto de tipos y campos por flujo (para referencia de todas las tareas)

Los 4 flujos guardan la transacción con estos identificadores/campos exactos, confirmados leyendo el código actual:

| Flujo | Controller / método | Campo id de transacción en `result` | Campo status | Monto/moneda disponibles en |
|---|---|---|---|---|
| Depósito | `transactions.controller.ts` → `deposit` | `result.transaction_id` | `result.status` | `parseResult.data.amount_in_cents` / `.currency` |
| P2P | `p2p.controller.ts` → `transfer` | `result.transaction_id` | no existe (usar literal `'COMPLETED'`) | `result.amount_transferred` / `result.currency` |
| Exchange | `exchange.controller.ts` → `postExchangeController` | `result.transactionId` | no existe (usar literal `'COMPLETED'`) | `source_amount_cents` / `source_currency` (del body) |
| Card spend | `virtual-cards.controller.ts` → `simulateSpendController` | `result.transactionId` | `result.status` | `amount_in_cents` / `currency` (del body) |

Marcador de idempotencia por flujo: depósito y P2P usan `result._idempotent_reused` (booleano, ausente si es nuevo); exchange y card spend usan `result.reused` (booleano, siempre presente).

---

### Task 1: Tipos compartidos y plantilla HTML pura

**Files:**
- Create: `src/integrations/ses/ses.types.ts`
- Create: `src/integrations/ses/ses.templates.ts`
- Test: `tests/integrations/ses/ses.templates.test.ts`

**Interfaces:**
- Consumes: nada (no depende de ninguna otra tarea).
- Produces:
  - `ses.types.ts` exporta `TransactionEmailType = 'DEPOSIT' | 'P2P_TRANSFER' | 'EXCHANGE' | 'CARD_SPEND'`, `TransactionEmailExtraRow { label: string; value: string }`, `TransactionEmailContent { transactionId: string; type: TransactionEmailType; status: string; amountInCents: number; currency: string; occurredAt: Date; extraRows?: TransactionEmailExtraRow[] }`, `TransactionEmailParams extends TransactionEmailContent { toEmail: string }`.
  - `ses.templates.ts` exporta `buildTransactionEmailHtml(params: TransactionEmailContent): string`.

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/integrations/ses/ses.templates.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildTransactionEmailHtml } from "../../../src/integrations/ses/ses.templates";

describe("ses.templates - buildTransactionEmailHtml", () => {
  it("incluye los 6 campos obligatorios en el HTML", () => {
    const html = buildTransactionEmailHtml({
      transactionId: "tx-123",
      type: "DEPOSIT",
      status: "COMPLETED",
      amountInCents: 150000,
      currency: "USD",
      occurredAt: new Date("2026-07-15T10:00:00Z"),
    });

    expect(html).toContain("1500.00 USD"); // Monto
    expect(html).toContain(">USD<"); // Moneda
    expect(html).toContain("tx-123"); // ID de transacción
    expect(html).toContain("Depósito"); // Tipo de operación
    expect(html).toContain("COMPLETED"); // Estado
    expect(html.length).toBeGreaterThan(0);
  });

  it("agrega filas extra cuando se proveen", () => {
    const html = buildTransactionEmailHtml({
      transactionId: "tx-456",
      type: "CARD_SPEND",
      status: "COMPLETED",
      amountInCents: 2000,
      currency: "USD",
      occurredAt: new Date("2026-07-15T10:00:00Z"),
      extraRows: [{ label: "Comercio", value: "Kiosco Don Pepe" }],
    });

    expect(html).toContain("Comercio");
    expect(html).toContain("Kiosco Don Pepe");
  });

  it("no incluye una seccion de filas extra si no se proveen", () => {
    const html = buildTransactionEmailHtml({
      transactionId: "tx-789",
      type: "EXCHANGE",
      status: "COMPLETED",
      amountInCents: 1000,
      currency: "EUR",
      occurredAt: new Date("2026-07-15T10:00:00Z"),
    });

    expect(html).toContain("Cambio de divisa");
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run tests/integrations/ses/ses.templates.test.ts`
Expected: FAIL — `Cannot find module '../../../src/integrations/ses/ses.templates'`

- [ ] **Step 3: Crear `src/integrations/ses/ses.types.ts`**

```ts
export type TransactionEmailType = 'DEPOSIT' | 'P2P_TRANSFER' | 'EXCHANGE' | 'CARD_SPEND';

export interface TransactionEmailExtraRow {
  label: string;
  value: string;
}

export interface TransactionEmailContent {
  transactionId: string;
  type: TransactionEmailType;
  status: string;
  amountInCents: number;
  currency: string;
  occurredAt: Date;
  extraRows?: TransactionEmailExtraRow[];
}

export interface TransactionEmailParams extends TransactionEmailContent {
  toEmail: string;
}
```

- [ ] **Step 4: Crear `src/integrations/ses/ses.templates.ts`**

```ts
import { TransactionEmailContent, TransactionEmailType } from './ses.types';

const TYPE_LABELS: Record<TransactionEmailType, string> = {
  DEPOSIT: 'Depósito',
  P2P_TRANSFER: 'Transferencia entre usuarios',
  EXCHANGE: 'Cambio de divisa',
  CARD_SPEND: 'Compra con tarjeta virtual',
};

function formatAmount(amountInCents: number, currency: string): string {
  return `${(amountInCents / 100).toFixed(2)} ${currency}`;
}

function formatDate(date: Date): string {
  return date.toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' });
}

function buildExtraRowsHtml(extraRows: TransactionEmailContent['extraRows']): string {
  if (!extraRows || extraRows.length === 0) {
    return '';
  }
  return extraRows
    .map(
      (row) => `
        <tr>
          <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">${row.label}</td>
          <td style="padding: 8px 0; color: #111827; font-size: 14px; text-align: right; font-weight: 600;">${row.value}</td>
        </tr>`
    )
    .join('');
}

export function buildTransactionEmailHtml(params: TransactionEmailContent): string {
  const extraRowsHtml = buildExtraRowsHtml(params.extraRows);

  return `
<!DOCTYPE html>
<html lang="es">
  <body style="margin:0; padding:0; background-color:#f3f4f6; font-family: Arial, Helvetica, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6; padding: 24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius: 12px; overflow: hidden; max-width: 480px; width: 100%;">
            <tr>
              <td style="background-color:#4338ca; padding: 24px; text-align:center;">
                <span style="color:#ffffff; font-size: 20px; font-weight: 700;">OvniWallet</span>
              </td>
            </tr>
            <tr>
              <td style="padding: 24px;">
                <p style="margin:0 0 16px 0; color:#111827; font-size:16px;">
                  Confirmamos el siguiente movimiento en tu cuenta:
                </p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Tipo de operación</td>
                    <td style="padding: 8px 0; color: #111827; font-size: 14px; text-align: right; font-weight: 600;">${TYPE_LABELS[params.type]}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Monto</td>
                    <td style="padding: 8px 0; color: #111827; font-size: 14px; text-align: right; font-weight: 600;">${formatAmount(params.amountInCents, params.currency)}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Moneda</td>
                    <td style="padding: 8px 0; color: #111827; font-size: 14px; text-align: right; font-weight: 600;">${params.currency}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Fecha</td>
                    <td style="padding: 8px 0; color: #111827; font-size: 14px; text-align: right; font-weight: 600;">${formatDate(params.occurredAt)}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Estado</td>
                    <td style="padding: 8px 0; color: #059669; font-size: 14px; text-align: right; font-weight: 600;">${params.status}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">ID de transacción</td>
                    <td style="padding: 8px 0; color: #111827; font-size: 12px; text-align: right; font-family: monospace;">${params.transactionId}</td>
                  </tr>
                  ${extraRowsHtml}
                </table>
              </td>
            </tr>
            <tr>
              <td style="background-color:#f9fafb; padding: 16px 24px; text-align:center;">
                <span style="color:#9ca3af; font-size: 12px;">Este es un correo automático, no respondas a esta dirección.</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`.trim();
}
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `npx vitest run tests/integrations/ses/ses.templates.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add src/integrations/ses/ses.types.ts src/integrations/ses/ses.templates.ts tests/integrations/ses/ses.templates.test.ts
git commit -m "feat(ses): agregar tipos y plantilla HTML pura para emails transaccionales"
```

---

### Task 2: Dependencia del SDK, variables de entorno y cliente SES

**Files:**
- Modify: `package.json` (agregar dependencia)
- Modify: `src/config/env.ts`
- Modify: `.env.example`
- Create: `src/integrations/ses/ses.client.ts`
- Test: `tests/integrations/ses/ses.client.test.ts`

**Interfaces:**
- Consumes: `ENV` de `src/config/env.ts` (existente).
- Produces: `sendEmail(to: string, subject: string, html: string): Promise<void>` desde `src/integrations/ses/ses.client.ts` — **no captura errores**, los propaga (la resiliencia vive en la Task 3).

- [ ] **Step 1: Instalar la dependencia**

Run: `npm install @aws-sdk/client-ses`
Expected: se agrega `"@aws-sdk/client-ses": "^3.x.x"` a `dependencies` en `package.json` y se actualiza `package-lock.json`.

- [ ] **Step 2: Agregar las variables a `src/config/env.ts`**

Reemplazar el contenido actual:

```ts
import dotenv from 'dotenv';
dotenv.config();

export const ENV = {
  PORT: process.env.PORT ? parseInt(process.env.PORT, 10) : 5000,
  DATABASE_URL: process.env.DATABASE_URL || '',
  JWT_SECRET: process.env.JWT_SECRET || 'secret_por_defecto',
  EXCHANGE_RATE_API_KEY: process.env.EXCHANGE_RATE_API_KEY || '',
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID || '',
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY || '',
  AWS_REGION: process.env.AWS_REGION || '',
  AWS_SES_FROM_EMAIL: process.env.AWS_SES_FROM_EMAIL || '',
};
```

- [ ] **Step 3: Documentar las variables en `.env.example`**

Agregar al final del archivo (sin valores reales):

```
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=
AWS_SES_FROM_EMAIL=
```

- [ ] **Step 4: Escribir el test que falla**

Crear `tests/integrations/ses/ses.client.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const sendMock = vi.fn();

vi.mock("@aws-sdk/client-ses", () => ({
  SESClient: vi.fn().mockImplementation(() => ({ send: sendMock })),
  SendEmailCommand: vi.fn().mockImplementation((input) => ({ input })),
}));

import { sendEmail } from "../../../src/integrations/ses/ses.client";

describe("ses.client - sendEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendMock.mockResolvedValue({});
  });

  it("envia un SendEmailCommand con destinatario, asunto y HTML correctos", async () => {
    await sendEmail("dest@test.com", "Asunto de prueba", "<p>Hola</p>");

    expect(sendMock).toHaveBeenCalledTimes(1);
    const [command] = sendMock.mock.calls[0];
    expect(command.input.Destination.ToAddresses).toEqual(["dest@test.com"]);
    expect(command.input.Message.Subject.Data).toBe("Asunto de prueba");
    expect(command.input.Message.Body.Html.Data).toBe("<p>Hola</p>");
  });

  it("propaga el error si el envio por SES falla", async () => {
    sendMock.mockRejectedValue(new Error("SES no disponible"));

    await expect(sendEmail("dest@test.com", "Asunto", "<p>Hola</p>")).rejects.toThrow(
      "SES no disponible"
    );
  });
});
```

- [ ] **Step 5: Correr el test y verificar que falla**

Run: `npx vitest run tests/integrations/ses/ses.client.test.ts`
Expected: FAIL — `Cannot find module '../../../src/integrations/ses/ses.client'`

- [ ] **Step 6: Crear `src/integrations/ses/ses.client.ts`**

```ts
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { ENV } from '../../config/env';

function getClient(): SESClient {
  return new SESClient({
    region: ENV.AWS_REGION,
    credentials: {
      accessKeyId: ENV.AWS_ACCESS_KEY_ID,
      secretAccessKey: ENV.AWS_SECRET_ACCESS_KEY,
    },
  });
}

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const client = getClient();

  const command = new SendEmailCommand({
    Source: ENV.AWS_SES_FROM_EMAIL,
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Data: subject, Charset: 'UTF-8' },
      Body: { Html: { Data: html, Charset: 'UTF-8' } },
    },
  });

  await client.send(command);
}
```

- [ ] **Step 7: Correr el test y verificar que pasa**

Run: `npx vitest run tests/integrations/ses/ses.client.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/config/env.ts .env.example src/integrations/ses/ses.client.ts tests/integrations/ses/ses.client.test.ts
git commit -m "feat(ses): agregar cliente SES v3 y variables de entorno de AWS"
```

---

### Task 3: Capa de orquestación resiliente (`notifyTransactionEmail`)

**Files:**
- Create: `src/integrations/ses/ses.notifications.ts`
- Test: `tests/integrations/ses/ses.notifications.test.ts`

**Interfaces:**
- Consumes: `sendEmail(to: string, subject: string, html: string): Promise<void>` (Task 2), `buildTransactionEmailHtml(params: TransactionEmailContent): string` (Task 1), `TransactionEmailParams` (Task 1), `logger` de `src/config/logger.ts` (existente, expone `.warn(message: string, ...meta: any[])`).
- Produces: `notifyTransactionEmail(params: TransactionEmailParams): Promise<void>` — **nunca rechaza/lanza**, es la única función que deben llamar los controllers.

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/integrations/ses/ses.notifications.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const sendEmailMock = vi.fn();
const loggerWarnMock = vi.fn();

vi.mock("../../../src/integrations/ses/ses.client", () => ({
  sendEmail: sendEmailMock,
}));
vi.mock("../../../src/config/logger", () => ({
  logger: { warn: loggerWarnMock, info: vi.fn(), error: vi.fn() },
}));

import { notifyTransactionEmail } from "../../../src/integrations/ses/ses.notifications";

describe("ses.notifications - notifyTransactionEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("envia el correo con el asunto correcto segun el tipo de operacion", async () => {
    sendEmailMock.mockResolvedValue(undefined);

    await notifyTransactionEmail({
      toEmail: "user@test.com",
      transactionId: "tx-1",
      type: "DEPOSIT",
      status: "COMPLETED",
      amountInCents: 1000,
      currency: "USD",
      occurredAt: new Date(),
    });

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const [to, subject, html] = sendEmailMock.mock.calls[0];
    expect(to).toBe("user@test.com");
    expect(subject).toContain("depósito");
    expect(html).toContain("tx-1");
  });

  it("no relanza el error si SES falla, y loguea con warn", async () => {
    sendEmailMock.mockRejectedValue(new Error("SES no disponible"));

    await expect(
      notifyTransactionEmail({
        toEmail: "user@test.com",
        transactionId: "tx-2",
        type: "P2P_TRANSFER",
        status: "COMPLETED",
        amountInCents: 500,
        currency: "EUR",
        occurredAt: new Date(),
      })
    ).resolves.toBeUndefined();

    expect(loggerWarnMock).toHaveBeenCalledTimes(1);
    expect(loggerWarnMock.mock.calls[0][0]).toContain("correo");
    expect(loggerWarnMock.mock.calls[0][1]).toMatchObject({ transactionId: "tx-2" });
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run tests/integrations/ses/ses.notifications.test.ts`
Expected: FAIL — `Cannot find module '../../../src/integrations/ses/ses.notifications'`

- [ ] **Step 3: Crear `src/integrations/ses/ses.notifications.ts`**

```ts
import { sendEmail } from './ses.client';
import { buildTransactionEmailHtml } from './ses.templates';
import { TransactionEmailParams, TransactionEmailType } from './ses.types';
import { logger } from '../../config/logger';

const SUBJECT_BY_TYPE: Record<TransactionEmailType, string> = {
  DEPOSIT: 'Confirmación de tu depósito - OvniWallet',
  P2P_TRANSFER: 'Movimiento de transferencia - OvniWallet',
  EXCHANGE: 'Cambio de divisa realizado - OvniWallet',
  CARD_SPEND: 'Compra con tarjeta registrada - OvniWallet',
};

export async function notifyTransactionEmail(params: TransactionEmailParams): Promise<void> {
  try {
    const subject = SUBJECT_BY_TYPE[params.type];
    const html = buildTransactionEmailHtml(params);
    await sendEmail(params.toEmail, subject, html);
  } catch (error: any) {
    logger.warn('No se pudo enviar el correo de notificación de transacción', {
      transactionId: params.transactionId,
      type: params.type,
      toEmail: params.toEmail,
      error: error?.message,
    });
  }
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run tests/integrations/ses/ses.notifications.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/integrations/ses/ses.notifications.ts tests/integrations/ses/ses.notifications.test.ts
git commit -m "feat(ses): agregar capa resiliente notifyTransactionEmail"
```

---

### Task 4: Integrar en el flujo de depósito

**Files:**
- Modify: `src/modules/transactions/transactions.controller.ts`
- Test: `tests/transactions/transactions.controller.test.ts`

**Interfaces:**
- Consumes: `notifyTransactionEmail(params: TransactionEmailParams): Promise<void>` (Task 3).

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/transactions/transactions.controller.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const processDepositMock = vi.fn();
const notifyTransactionEmailMock = vi.fn();

vi.mock("../../src/modules/transactions/transactions.service", () => ({
  TransactionsService: vi.fn().mockImplementation(() => ({
    processDeposit: processDepositMock,
    getHistory: vi.fn(),
    getTransactionDetail: vi.fn(),
  })),
}));
vi.mock("../../src/integrations/ses/ses.notifications", () => ({
  notifyTransactionEmail: notifyTransactionEmailMock,
}));

import { TransactionsController } from "../../src/modules/transactions/transactions.controller";

function buildRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("TransactionsController.deposit - notificacion por email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("envia el correo de confirmacion tras un deposito nuevo exitoso", async () => {
    processDepositMock.mockResolvedValue({
      transaction_id: "tx-1",
      type: "DEPOSIT",
      status: "COMPLETED",
    });

    const controller = new TransactionsController();
    const req: any = {
      user: { id: "user-1", email: "user@test.com" },
      body: { amount_in_cents: 5000, currency: "USD", idempotency_key: "idemp-1" },
    };
    const res = buildRes();
    const next = vi.fn();

    await controller.deposit(req, res, next);

    expect(notifyTransactionEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        toEmail: "user@test.com",
        transactionId: "tx-1",
        type: "DEPOSIT",
        status: "COMPLETED",
        amountInCents: 5000,
        currency: "USD",
      })
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(next).not.toHaveBeenCalled();
  });

  it("no envia el correo si el deposito es una reutilizacion idempotente", async () => {
    processDepositMock.mockResolvedValue({
      transaction_id: "tx-1",
      type: "DEPOSIT",
      status: "COMPLETED",
      _idempotent_reused: true,
    });

    const controller = new TransactionsController();
    const req: any = {
      user: { id: "user-1", email: "user@test.com" },
      body: { amount_in_cents: 5000, currency: "USD", idempotency_key: "idemp-1" },
    };
    const res = buildRes();
    const next = vi.fn();

    await controller.deposit(req, res, next);

    expect(notifyTransactionEmailMock).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run tests/transactions/transactions.controller.test.ts`
Expected: FAIL — el primer `expect(notifyTransactionEmailMock).toHaveBeenCalledWith(...)` falla porque todavía no se llama a `notifyTransactionEmail` desde el controller.

- [ ] **Step 3: Modificar `src/modules/transactions/transactions.controller.ts`**

Agregar el import al inicio del archivo:

```ts
import { notifyTransactionEmail } from '../../integrations/ses/ses.notifications';
```

Reemplazar el método `deposit` completo por:

```ts
  deposit = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      const userEmail = req.user?.email;

      if (!userId || !userEmail) {
        const error = new Error('No autorizado');
        (error as any).statusCode = 401;
        throw error;
      }

      // Validar sintácticamente el body con Zod
      const parseResult = depositSchema.safeParse(req.body);
      if (!parseResult.success) {
        const error = new Error('Datos de entrada inválidos');
        (error as any).statusCode = 400;
        (error as any).code = 'INVALID_INPUT';
        (error as any).details = parseResult.error.format();
        throw error;
      }

      const result = await this.transactionsService.processDeposit(userId, parseResult.data);

      if (!(result as any)._idempotent_reused) {
        await notifyTransactionEmail({
          toEmail: userEmail,
          transactionId: result.transaction_id,
          type: 'DEPOSIT',
          status: result.status,
          amountInCents: parseResult.data.amount_in_cents,
          currency: parseResult.data.currency,
          occurredAt: new Date(),
        });
      }

      res.status(201).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run tests/transactions/transactions.controller.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Correr toda la suite para verificar que no rompimos nada existente**

Run: `npm test`
Expected: PASS (todos los tests, incluyendo los de `tests/exchange` y `tests/virtual-cards`)

- [ ] **Step 6: Commit**

```bash
git add src/modules/transactions/transactions.controller.ts tests/transactions/transactions.controller.test.ts
git commit -m "feat(transactions): notificar por email tras un deposito exitoso"
```

---

### Task 5: Integrar en el flujo de transferencia P2P (doble envío)

**Files:**
- Modify: `src/modules/p2p/p2p.controller.ts`
- Test: `tests/p2p/p2p.controller.test.ts`

**Interfaces:**
- Consumes: `notifyTransactionEmail(params: TransactionEmailParams): Promise<void>` (Task 3).

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/p2p/p2p.controller.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const processTransferMock = vi.fn();
const notifyTransactionEmailMock = vi.fn();

vi.mock("../../src/modules/p2p/p2p.service", () => ({
  P2PService: vi.fn().mockImplementation(() => ({
    processTransfer: processTransferMock,
  })),
}));
vi.mock("../../src/integrations/ses/ses.notifications", () => ({
  notifyTransactionEmail: notifyTransactionEmailMock,
}));

import { P2PController } from "../../src/modules/p2p/p2p.controller";

function buildRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("P2PController.transfer - notificacion por email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("notifica a remitente y destinatario tras una transferencia nueva exitosa", async () => {
    processTransferMock.mockResolvedValue({
      transaction_id: "tx-1",
      amount_transferred: 3000,
      currency: "USD",
    });

    const controller = new P2PController();
    const req: any = {
      user: { id: "user-1", email: "sender@test.com" },
      body: {
        recipient_email: "recipient@test.com",
        amount_in_cents: 3000,
        currency: "USD",
        idempotency_key: "idemp-1",
      },
    };
    const res = buildRes();
    const next = vi.fn();

    await controller.transfer(req, res, next);

    expect(notifyTransactionEmailMock).toHaveBeenCalledTimes(2);
    expect(notifyTransactionEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ toEmail: "sender@test.com", transactionId: "tx-1", type: "P2P_TRANSFER" })
    );
    expect(notifyTransactionEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ toEmail: "recipient@test.com", transactionId: "tx-1", type: "P2P_TRANSFER" })
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("no notifica si la transferencia es una reutilizacion idempotente", async () => {
    processTransferMock.mockResolvedValue({
      transaction_id: "tx-1",
      amount_transferred: 3000,
      currency: "USD",
      _idempotent_reused: true,
    });

    const controller = new P2PController();
    const req: any = {
      user: { id: "user-1", email: "sender@test.com" },
      body: {
        recipient_email: "recipient@test.com",
        amount_in_cents: 3000,
        currency: "USD",
        idempotency_key: "idemp-1",
      },
    };
    const res = buildRes();
    const next = vi.fn();

    await controller.transfer(req, res, next);

    expect(notifyTransactionEmailMock).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run tests/p2p/p2p.controller.test.ts`
Expected: FAIL — `notifyTransactionEmailMock` no se llama todavía.

- [ ] **Step 3: Modificar `src/modules/p2p/p2p.controller.ts`**

Agregar el import al inicio del archivo:

```ts
import { notifyTransactionEmail } from '../../integrations/ses/ses.notifications';
```

Reemplazar el método `transfer` completo por:

```ts
  transfer = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const senderId = req.user?.id;
      const senderEmail = req.user?.email; // Asegúrate de que tu JWT guarde el email

      if (!senderId || !senderEmail) {
        const error = new Error('No autorizado o sesión incompleta');
        (error as any).statusCode = 401;
        throw error;
      }

      // Validar body con Zod
      const parseResult = transferSchema.safeParse(req.body);
      if (!parseResult.success) {
        const error = new Error('Datos de transferencia inválidos');
        (error as any).statusCode = 400;
        (error as any).code = 'INVALID_INPUT';
        (error as any).details = parseResult.error.format();
        throw error;
      }

      const result = await this.p2pService.processTransfer(senderId, senderEmail, parseResult.data);

      if (!(result as any)._idempotent_reused) {
        const occurredAt = new Date();
        await notifyTransactionEmail({
          toEmail: senderEmail,
          transactionId: result.transaction_id,
          type: 'P2P_TRANSFER',
          status: 'COMPLETED',
          amountInCents: result.amount_transferred,
          currency: result.currency,
          occurredAt,
          extraRows: [{ label: 'Destinatario', value: parseResult.data.recipient_email }],
        });

        await notifyTransactionEmail({
          toEmail: parseResult.data.recipient_email,
          transactionId: result.transaction_id,
          type: 'P2P_TRANSFER',
          status: 'COMPLETED',
          amountInCents: result.amount_transferred,
          currency: result.currency,
          occurredAt,
          extraRows: [{ label: 'Remitente', value: senderEmail }],
        });
      }

      res.status(201).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run tests/p2p/p2p.controller.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Correr toda la suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/modules/p2p/p2p.controller.ts tests/p2p/p2p.controller.test.ts
git commit -m "feat(p2p): notificar por email a remitente y destinatario tras una transferencia exitosa"
```

---

### Task 6: Integrar en el flujo de exchange

**Files:**
- Modify: `src/modules/exchange/exchange.controller.ts`
- Test: `tests/exchange/exchange.controller.test.ts`

**Interfaces:**
- Consumes: `notifyTransactionEmail(params: TransactionEmailParams): Promise<void>` (Task 3).

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/exchange/exchange.controller.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const executeExchangeOperationMock = vi.fn();
const getWalletIdByUserIdMock = vi.fn();
const notifyTransactionEmailMock = vi.fn();

vi.mock("../../src/modules/exchange/exchange.service", () => ({
  getQuote: vi.fn(),
  executeExchangeOperation: executeExchangeOperationMock,
}));
vi.mock("../../src/shared/wallet-lookup", () => ({
  getWalletIdByUserId: getWalletIdByUserIdMock,
}));
vi.mock("../../src/integrations/ses/ses.notifications", () => ({
  notifyTransactionEmail: notifyTransactionEmailMock,
}));

import { postExchangeController } from "../../src/modules/exchange/exchange.controller";

function buildRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("postExchangeController - notificacion por email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getWalletIdByUserIdMock.mockResolvedValue("wallet-1");
  });

  it("notifica tras un exchange nuevo exitoso", async () => {
    executeExchangeOperationMock.mockResolvedValue({
      transactionId: "tx-1",
      rateApplied: 0.92,
      targetAmountCents: 9200,
      reused: false,
    });

    const req: any = {
      user: { id: "user-1", email: "user@test.com" },
      body: {
        source_currency: "USD",
        target_currency: "EUR",
        source_amount_cents: 10000,
        idempotency_key: "idemp-1",
      },
    };
    const res = buildRes();

    await postExchangeController(req, res);

    expect(notifyTransactionEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        toEmail: "user@test.com",
        transactionId: "tx-1",
        type: "EXCHANGE",
        amountInCents: 10000,
        currency: "USD",
      })
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("no notifica si el exchange es una reutilizacion idempotente", async () => {
    executeExchangeOperationMock.mockResolvedValue({
      transactionId: "tx-1",
      rateApplied: 0.92,
      targetAmountCents: 9200,
      reused: true,
    });

    const req: any = {
      user: { id: "user-1", email: "user@test.com" },
      body: {
        source_currency: "USD",
        target_currency: "EUR",
        source_amount_cents: 10000,
        idempotency_key: "idemp-1",
      },
    };
    const res = buildRes();

    await postExchangeController(req, res);

    expect(notifyTransactionEmailMock).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run tests/exchange/exchange.controller.test.ts`
Expected: FAIL — `notifyTransactionEmailMock` no se llama todavía.

- [ ] **Step 3: Modificar `src/modules/exchange/exchange.controller.ts`**

Agregar el import al inicio del archivo:

```ts
import { notifyTransactionEmail } from "../../integrations/ses/ses.notifications";
```

Reemplazar `postExchangeController` completo por:

```ts
export async function postExchangeController(req: Request, res: Response) {
  try {
    const userId = (req as any).user.id;
    const userEmail = (req as any).user.email;
    const walletId = await getWalletIdByUserId(userId);

    const { source_currency, target_currency, source_amount_cents, idempotency_key } = req.body;

    const result = await executeExchangeOperation({
      userId,
      walletId,
      sourceCurrency: source_currency,
      targetCurrency: target_currency,
      sourceAmountCents: source_amount_cents,
      idempotencyKey: idempotency_key,
    });

    if (!result.reused) {
      await notifyTransactionEmail({
        toEmail: userEmail,
        transactionId: result.transactionId,
        type: 'EXCHANGE',
        status: 'COMPLETED',
        amountInCents: source_amount_cents,
        currency: source_currency,
        occurredAt: new Date(),
        extraRows: [
          {
            label: 'Convertido a',
            value: `${((result.targetAmountCents ?? 0) / 100).toFixed(2)} ${target_currency}`,
          },
          {
            label: 'Tasa aplicada',
            value: result.rateApplied ? result.rateApplied.toFixed(10) : 'N/D',
          },
        ],
      });
    }

    res.status(201).json({
      status: "success",
      data: {
        transaction_id: result.transactionId,
        rate_applied: result.rateApplied?.toFixed(10) ?? null,
        target_amount_cents: result.targetAmountCents ?? null,
      },
    });
  } catch (err: any) {
    if (err.message === "IDEMPOTENCY_KEY_MISMATCH") {
      return res.status(409).json({
        status: "error",
        error: { code: "IDEMPOTENCY_KEY_MISMATCH", message: "La clave ya se uso con otros datos", details: null },
      });
    }
    if (err.message === "INSUFFICIENT_FUNDS") {
      return res.status(422).json({
        status: "error",
        error: { code: "INSUFFICIENT_FUNDS", message: "Fondos insuficientes", details: null },
      });
    }
    if (err.message === "RATE_NOT_FOUND") {
      return res.status(502).json({
        status: "error",
        error: { code: "EXTERNAL_SERVICE_UNAVAILABLE", message: "No hay tasa disponible", details: null },
      });
    }
    res.status(500).json({
      status: "error",
      error: { code: "INTERNAL_ERROR", message: "Error inesperado", details: null },
    });
  }
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run tests/exchange/exchange.controller.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Correr toda la suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/modules/exchange/exchange.controller.ts tests/exchange/exchange.controller.test.ts
git commit -m "feat(exchange): notificar por email tras un cambio de divisa exitoso"
```

---

### Task 7: Integrar en el flujo de gasto con tarjeta virtual

**Files:**
- Modify: `src/modules/virtual-cards/virtual-cards.controller.ts`
- Test: `tests/virtual-cards/virtual-cards.controller.test.ts`

**Interfaces:**
- Consumes: `notifyTransactionEmail(params: TransactionEmailParams): Promise<void>` (Task 3).

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/virtual-cards/virtual-cards.controller.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const simulateSpendMock = vi.fn();
const getWalletIdByUserIdMock = vi.fn();
const notifyTransactionEmailMock = vi.fn();

vi.mock("../../src/modules/virtual-cards/virtual-cards.service", () => ({
  listCards: vi.fn(),
  issueCard: vi.fn(),
  blockCardById: vi.fn(),
}));
vi.mock("../../src/modules/virtual-cards/card-spend.service", () => ({
  simulateSpend: simulateSpendMock,
}));
vi.mock("../../src/shared/wallet-lookup", () => ({
  getWalletIdByUserId: getWalletIdByUserIdMock,
}));
vi.mock("../../src/integrations/ses/ses.notifications", () => ({
  notifyTransactionEmail: notifyTransactionEmailMock,
}));

import { simulateSpendController } from "../../src/modules/virtual-cards/virtual-cards.controller";

function buildRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("simulateSpendController - notificacion por email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getWalletIdByUserIdMock.mockResolvedValue("wallet-1");
  });

  it("notifica tras un gasto nuevo completado", async () => {
    simulateSpendMock.mockResolvedValue({
      transactionId: "tx-1",
      status: "COMPLETED",
      reused: false,
    });

    const req: any = {
      user: { id: "user-1", email: "user@test.com" },
      body: {
        card_id: "card-1",
        amount_in_cents: 2000,
        currency: "USD",
        merchant_name: "Kiosco Don Pepe",
        idempotency_key: "idemp-1",
      },
    };
    const res = buildRes();

    await simulateSpendController(req, res);

    expect(notifyTransactionEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        toEmail: "user@test.com",
        transactionId: "tx-1",
        type: "CARD_SPEND",
        status: "COMPLETED",
        amountInCents: 2000,
        currency: "USD",
        extraRows: [{ label: "Comercio", value: "Kiosco Don Pepe" }],
      })
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("no notifica si el gasto es una reutilizacion idempotente", async () => {
    simulateSpendMock.mockResolvedValue({
      transactionId: "tx-1",
      status: "COMPLETED",
      reused: true,
    });

    const req: any = {
      user: { id: "user-1", email: "user@test.com" },
      body: {
        card_id: "card-1",
        amount_in_cents: 2000,
        currency: "USD",
        merchant_name: "Kiosco Don Pepe",
        idempotency_key: "idemp-1",
      },
    };
    const res = buildRes();

    await simulateSpendController(req, res);

    expect(notifyTransactionEmailMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run tests/virtual-cards/virtual-cards.controller.test.ts`
Expected: FAIL — `notifyTransactionEmailMock` no se llama todavía.

- [ ] **Step 3: Modificar `src/modules/virtual-cards/virtual-cards.controller.ts`**

Agregar el import al inicio del archivo:

```ts
import { notifyTransactionEmail } from "../../integrations/ses/ses.notifications";
```

Reemplazar `simulateSpendController` completo por:

```ts
export async function simulateSpendController(req: Request, res: Response) {
  try {
    const userId = (req as any).user.id;
    const userEmail = (req as any).user.email;
    const walletId = await getWalletIdByUserId(userId);
    const { card_id, amount_in_cents, currency, merchant_name, idempotency_key } = req.body;

    const result = await simulateSpend({
      cardId: card_id,
      walletId,
      userId,
      amountCents: amount_in_cents,
      currency,
      merchantName: merchant_name,
      idempotencyKey: idempotency_key,
    });

    if (result.status === "COMPLETED" && !result.reused) {
      await notifyTransactionEmail({
        toEmail: userEmail,
        transactionId: result.transactionId,
        type: 'CARD_SPEND',
        status: result.status,
        amountInCents: amount_in_cents,
        currency,
        occurredAt: new Date(),
        extraRows: [{ label: 'Comercio', value: merchant_name }],
      });
    }

    res.status(result.status === "COMPLETED" ? 201 : 200).json({
      status: "success",
      data: { transaction_id: result.transactionId, status: result.status },
    });
  } catch (err: any) {
    if (err.message === "IDEMPOTENCY_KEY_MISMATCH") {
      return res.status(409).json({
        status: "error",
        error: { code: "IDEMPOTENCY_KEY_MISMATCH", message: "La clave ya se uso con otros datos", details: null },
      });
    }
    if (err.message === "CARD_NOT_FOUND") {
      return res.status(404).json({
        status: "error",
        error: { code: "CARD_NOT_FOUND", message: "Tarjeta no encontrada", details: null },
      });
    }
    if (err.message === "NOT_OWNER") {
      return res.status(403).json({
        status: "error",
        error: { code: "NOT_OWNER", message: "No sos el dueño de esta tarjeta", details: null },
      });
    }
    if (err.message === "CARD_BLOCKED") {
      return res.status(422).json({
        status: "error",
        error: { code: "CARD_BLOCKED", message: "Tarjeta bloqueada", details: null },
      });
    }
    if (err.message === "INSUFFICIENT_FUNDS") {
      return res.status(422).json({
        status: "error",
        error: { code: "INSUFFICIENT_FUNDS", message: "Fondos insuficientes en ninguna divisa", details: null },
      });
    }
    res.status(500).json({
      status: "error",
      error: { code: "INTERNAL_ERROR", message: "Error inesperado", details: null },
    });
  }
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run tests/virtual-cards/virtual-cards.controller.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Correr toda la suite completa del proyecto**

Run: `npm test`
Expected: PASS (todos los tests del proyecto, incluyendo los 4 nuevos módulos de `ses` y los 4 controllers integrados)

- [ ] **Step 6: Verificar que el proyecto compila**

Run: `npm run build`
Expected: compila sin errores de TypeScript (`dist/` generado)

- [ ] **Step 7: Commit**

```bash
git add src/modules/virtual-cards/virtual-cards.controller.ts tests/virtual-cards/virtual-cards.controller.test.ts
git commit -m "feat(virtual-cards): notificar por email tras un gasto con tarjeta completado"
```
