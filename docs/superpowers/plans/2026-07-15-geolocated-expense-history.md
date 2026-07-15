# Historial de Gastos Geolocalizado — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aceptar `latitude`/`longitude` opcionales en los 4 endpoints que crean transacciones (deposit, P2P transfer, exchange, card-spend) y persistirlas dentro del campo `metadata` JSONB existente, sin migraciones ni geocodificación.

**Architecture:** Un módulo compartido puro (`src/shared/geolocation.ts`) provee el schema de validación Zod y un helper de merge. Cada flujo (DTO/controller → service → repository) se extiende para aceptar, validar y propagar `latitude`/`longitude` hasta el punto donde ya construye el objeto `metadata` antes del `INSERT INTO transactions`.

**Tech Stack:** TypeScript (commonjs), Express, Zod, `pg` (queries crudas, sin ORM), Vitest + `vi.mock` para tests unitarios (patrón ya establecido en `tests/`).

## Global Constraints

- No modificar el esquema de Postgres ni generar migraciones — las coordenadas viven dentro de la columna `metadata` (JSONB) ya existente.
- No usar geocodificación inversa ni llamadas a APIs externas — solo se reciben y almacenan `latitude`/`longitude` tal como las envía el frontend.
- Rango válido: `latitude` entre -90 y 90, `longitude` entre -180 y 180.
- Regla de par completo: si se envía uno de los dos campos sin el otro, la petición se rechaza con `400` / código `INVALID_INPUT`.
- El merge de metadata nunca debe pisar propiedades que cada flujo ya guardaba (`description`, `request_payload`, `merchant_name`, `senderId`/`recipientId`, etc.).
- La validación de idempotencia (comparación de payload en reintentos) sigue ignorando `latitude`/`longitude` — no forma parte del contrato de idempotencia.
- Los endpoints `GET /transactions` y `GET /transactions/:id` ya devuelven `metadata` completo (verificado en `src/modules/transactions/transactions.service.ts:31-38` y `:94-107`) — no requieren cambios.

---

### Task 1: Módulo compartido de geolocalización

**Files:**
- Create: `src/shared/geolocation.ts`
- Test: `tests/shared/geolocation.test.ts`

**Interfaces:**
- Produces: `geolocationFields` (objeto con las shapes Zod `latitude`/`longitude`, para spread en otros `z.object({...})`), `refineGeoPair(data, ctx)` (función `superRefine` reusable), `geolocationSchema` (schema Zod standalone `z.object(geolocationFields).superRefine(refineGeoPair)`), `Geolocation` (tipo `{ latitude?: number; longitude?: number }`), `mergeGeoMetadata<T extends Record<string, unknown>>(baseMetadata: T, geo: Geolocation): T & { latitude?: number; longitude?: number }`.

- [ ] **Step 1: Crear el directorio de test y escribir los tests que fallan**

Crear `tests/shared/geolocation.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { geolocationSchema, mergeGeoMetadata } from '../../src/shared/geolocation';

describe('geolocationSchema', () => {
  it('acepta latitude y longitude validas', () => {
    const result = geolocationSchema.safeParse({ latitude: 4.6097, longitude: -74.0817 });
    expect(result.success).toBe(true);
  });

  it('acepta payload vacio (ambos opcionales)', () => {
    const result = geolocationSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('rechaza si solo viene latitude', () => {
    const result = geolocationSchema.safeParse({ latitude: 4.6097 });
    expect(result.success).toBe(false);
  });

  it('rechaza si solo viene longitude', () => {
    const result = geolocationSchema.safeParse({ longitude: -74.0817 });
    expect(result.success).toBe(false);
  });

  it('rechaza latitude fuera de rango', () => {
    const result = geolocationSchema.safeParse({ latitude: 95, longitude: -74.0817 });
    expect(result.success).toBe(false);
  });

  it('rechaza longitude fuera de rango', () => {
    const result = geolocationSchema.safeParse({ latitude: 4.6097, longitude: -200 });
    expect(result.success).toBe(false);
  });
});

describe('mergeGeoMetadata', () => {
  it('agrega latitude y longitude preservando el resto del metadata', () => {
    const merged = mergeGeoMetadata({ description: 'Deposito' }, { latitude: 4.6097, longitude: -74.0817 });
    expect(merged).toEqual({ description: 'Deposito', latitude: 4.6097, longitude: -74.0817 });
  });

  it('no agrega nada si no vienen coordenadas', () => {
    const merged = mergeGeoMetadata({ description: 'Deposito' }, {});
    expect(merged).toEqual({ description: 'Deposito' });
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run tests/shared/geolocation.test.ts`
Expected: FAIL — `Cannot find module '../../src/shared/geolocation'`

- [ ] **Step 3: Implementar `src/shared/geolocation.ts`**

```typescript
import { z } from 'zod';

export const geolocationFields = {
  latitude: z
    .number({ invalid_type_error: 'La latitud debe ser un número' })
    .min(-90, 'La latitud debe estar entre -90 y 90')
    .max(90, 'La latitud debe estar entre -90 y 90')
    .optional(),
  longitude: z
    .number({ invalid_type_error: 'La longitud debe ser un número' })
    .min(-180, 'La longitud debe estar entre -180 y 180')
    .max(180, 'La longitud debe estar entre -180 y 180')
    .optional(),
};

export function refineGeoPair(
  data: { latitude?: number; longitude?: number },
  ctx: z.RefinementCtx
): void {
  const hasLatitude = data.latitude !== undefined;
  const hasLongitude = data.longitude !== undefined;

  if (hasLatitude !== hasLongitude) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'latitude y longitude deben enviarse juntos',
      path: [hasLatitude ? 'longitude' : 'latitude'],
    });
  }
}

export const geolocationSchema = z.object(geolocationFields).superRefine(refineGeoPair);

export type Geolocation = z.infer<typeof geolocationSchema>;

export function mergeGeoMetadata<T extends Record<string, unknown>>(
  baseMetadata: T,
  geo: Geolocation
): T & { latitude?: number; longitude?: number } {
  if (geo.latitude === undefined || geo.longitude === undefined) {
    return baseMetadata;
  }
  return { ...baseMetadata, latitude: geo.latitude, longitude: geo.longitude };
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run tests/shared/geolocation.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Type-check y commit**

Run: `npx tsc --noEmit`
Expected: sin salida (sin errores)

```bash
git add src/shared/geolocation.ts tests/shared/geolocation.test.ts
git commit -m "feat(shared): agregar schema y merge helper de geolocalizacion"
```

---

### Task 2: Flujo de depósito

**Files:**
- Modify: `src/modules/transactions/dto/deposit.dto.ts`
- Modify: `src/modules/transactions/transactions.service.ts:43-82`
- Modify: `src/modules/transactions/transactions.repository.ts:85-135`
- Test: `tests/transactions/deposit.dto.test.ts` (crear)
- Test: `tests/transactions/transactions.service.test.ts` (crear)

**Interfaces:**
- Consumes: `geolocationFields`, `refineGeoPair` de `src/shared/geolocation.ts` (Task 1); `mergeGeoMetadata` de `src/shared/geolocation.ts` (Task 1).
- Produces: `DepositDTO` ahora incluye `latitude?: number; longitude?: number`. `TransactionsRepository.createDeposit(userId, amountInCents, currency, idempotencyKey, geo: Geolocation = {})`.

- [ ] **Step 1: Escribir el test de DTO que falla**

Crear `tests/transactions/deposit.dto.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { depositSchema } from '../../src/modules/transactions/dto/deposit.dto';

describe('depositSchema - geolocalizacion', () => {
  const base = { amount_in_cents: 5000, currency: 'USD', idempotency_key: 'idemp-1' };

  it('acepta el deposito sin coordenadas', () => {
    expect(depositSchema.safeParse(base).success).toBe(true);
  });

  it('acepta el deposito con latitude y longitude validas', () => {
    const result = depositSchema.safeParse({ ...base, latitude: 4.6097, longitude: -74.0817 });
    expect(result.success).toBe(true);
  });

  it('rechaza si solo viene longitude', () => {
    const result = depositSchema.safeParse({ ...base, longitude: -74.0817 });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run tests/transactions/deposit.dto.test.ts`
Expected: FAIL — el test de coordenadas válidas o inválidas falla porque el schema aún no conoce esos campos (Zod los ignora por defecto, así que la aserción de rechazo del par incompleto falla).

- [ ] **Step 3: Extender `deposit.dto.ts`**

Reemplazar el contenido completo de `src/modules/transactions/dto/deposit.dto.ts`:

```typescript
import { z } from 'zod';
import { geolocationFields, refineGeoPair } from '../../../shared/geolocation';

export const depositSchema = z
  .object({
    amount_in_cents: z
      .number({ required_error: 'El monto es obligatorio' })
      .int('El monto debe ser un número entero (centavos)')
      .positive('El monto debe ser mayor a cero'),
    currency: z.enum(['USD', 'EUR', 'GBP', 'ARS', 'BRL', 'JPY'], {
      required_error: 'La divisa es obligatoria',
      invalid_type_error: 'Divisa no soportada por OvniWallet',
    }),
    idempotency_key: z
      .string({ required_error: 'La clave de idempotencia es obligatoria' })
      .min(1, 'La clave de idempotencia no puede estar vacía'),
    ...geolocationFields,
  })
  .superRefine(refineGeoPair);

export type DepositDTO = z.infer<typeof depositSchema>;
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run tests/transactions/deposit.dto.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Escribir el test de servicio que falla**

Crear `tests/transactions/transactions.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { createDepositMock, findByIdempotencyKeyMock } = vi.hoisted(() => ({
  createDepositMock: vi.fn(),
  findByIdempotencyKeyMock: vi.fn(),
}));

vi.mock('../../src/modules/transactions/transactions.repository', () => ({
  TransactionsRepository: vi.fn().mockImplementation(() => ({
    createDeposit: createDepositMock,
    findByIdempotencyKey: findByIdempotencyKeyMock,
    findPagedTransactions: vi.fn(),
    findTransactionDetailForUser: vi.fn(),
  })),
}));

import { TransactionsService } from '../../src/modules/transactions/transactions.service';

describe('TransactionsService.processDeposit - geolocalizacion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findByIdempotencyKeyMock.mockResolvedValue(null);
  });

  it('reenvia latitude y longitude al repository', async () => {
    createDepositMock.mockResolvedValue({ id: 'tx-1', type: 'DEPOSIT', status: 'COMPLETED' });

    const service = new TransactionsService();
    await service.processDeposit('user-1', {
      amount_in_cents: 5000,
      currency: 'USD',
      idempotency_key: 'idemp-1',
      latitude: 4.6097,
      longitude: -74.0817,
    } as any);

    expect(createDepositMock).toHaveBeenCalledWith(
      'user-1',
      5000,
      'USD',
      'idemp-1',
      { latitude: 4.6097, longitude: -74.0817 }
    );
  });

  it('reenvia geo vacio cuando no vienen coordenadas', async () => {
    createDepositMock.mockResolvedValue({ id: 'tx-1', type: 'DEPOSIT', status: 'COMPLETED' });

    const service = new TransactionsService();
    await service.processDeposit('user-1', {
      amount_in_cents: 5000,
      currency: 'USD',
      idempotency_key: 'idemp-1',
    } as any);

    expect(createDepositMock).toHaveBeenCalledWith(
      'user-1',
      5000,
      'USD',
      'idemp-1',
      { latitude: undefined, longitude: undefined }
    );
  });
});
```

- [ ] **Step 6: Correr el test y verificar que falla**

Run: `npx vitest run tests/transactions/transactions.service.test.ts`
Expected: FAIL — `createDepositMock` se llama solo con 4 argumentos (sin el objeto geo).

- [ ] **Step 7: Actualizar `processDeposit` en `transactions.service.ts`**

En `src/modules/transactions/transactions.service.ts`, reemplazar el método `processDeposit` completo (líneas 43-82) por:

```typescript
  async processDeposit(userId: string, data: DepositDTO) {
    const { amount_in_cents, currency, idempotency_key, latitude, longitude } = data;

    // 🛡️ REGLA DE IDEMPOTENCIA (Fase 6/v2): Evitar procesar dos veces el mismo request
    const existingTx = await this.transactionsRepository.findByIdempotencyKey(idempotency_key);
    if (existingTx) {
      const storedMetadata = existingTx.metadata || {};
      const payloadMatches =
        storedMetadata.currency === currency &&
        Number(storedMetadata.amount_in_cents) === Number(amount_in_cents);

      if (!payloadMatches) {
        const error = new Error('La idempotency_key ya fue usada con un payload diferente');
        (error as any).statusCode = 409;
        (error as any).code = 'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH';
        throw error;
      }

      return {
        transaction_id: existingTx.id,
        type: existingTx.type,
        status: existingTx.status,
        _idempotent_reused: true
      };
    }

    // Si no existe, procedemos a realizar el depósito de forma normal
    const transaction = await this.transactionsRepository.createDeposit(
      userId,
      amount_in_cents,
      currency,
      idempotency_key,
      { latitude, longitude }
    );

    return {
      transaction_id: transaction.id,
      type: transaction.type,
      status: transaction.status,
    };
  }
```

- [ ] **Step 8: Actualizar `createDeposit` en `transactions.repository.ts`**

En `src/modules/transactions/transactions.repository.ts`, agregar el import al inicio del archivo (después de la línea 2):

```typescript
import { Geolocation, mergeGeoMetadata } from '../../shared/geolocation';
```

Reemplazar la firma y el cuerpo de `createDeposit` (líneas 85-135):

```typescript
  async createDeposit(userId: string, amountInCents: number, currency: string, idempotencyKey: string, geo: Geolocation = {}) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Buscar la wallet activa del usuario
      const walletQuery = `SELECT id FROM wallets WHERE user_id = $1 AND status = 'ACTIVE';`;
      const walletResult = await client.query(walletQuery, [userId]);
      
      if (walletResult.rows.length === 0) {
        throw new Error('El usuario no tiene una billetera activa');
      }
      const walletId = walletResult.rows[0].id;

      // 2. Insertar la cabecera en la tabla transactions
      const insertTxQuery = `
        INSERT INTO transactions (idempotency_key, type, status, metadata)
        VALUES ($1, 'DEPOSIT', 'COMPLETED', $2)
        RETURNING id, type, status;
      `;
      const txMetadata = JSON.stringify(
        mergeGeoMetadata(
          { description: 'Depósito simulado inicial', currency, amount_in_cents: amountInCents },
          geo
        )
      );
      const txResult = await client.query(insertTxQuery, [idempotencyKey, txMetadata]);
      const newTransaction = txResult.rows[0];

      // 3. Buscar el id del balance para esa moneda específica en la wallet
      const balanceQuery = `SELECT id FROM balances WHERE wallet_id = $1 AND currency = $2;`;
      const balanceResult = await client.query(balanceQuery, [walletId, currency]);

      if (balanceResult.rows.length === 0) {
        throw new Error(`No se encontró un balance configurado para la divisa ${currency}`);
      }
      const balanceId = balanceResult.rows[0].id;

      // 4. Insertar el asiento contable de CRÉDITO incluyendo la columna currency 👈 ¡CORREGIDO AQUÍ!
      await this.ledgerService.recordEntry(client, newTransaction.id, {
        balanceId,
        type: 'CREDIT',
        amountInCents,
        currency,
      });
      

      await client.query('COMMIT');
      return newTransaction;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
```

- [ ] **Step 9: Correr los tests y verificar que pasan**

Run: `npx vitest run tests/transactions`
Expected: PASS (todos los tests de `tests/transactions/`, incluyendo el controller test ya existente)

- [ ] **Step 10: Type-check y commit**

Run: `npx tsc --noEmit`
Expected: sin salida

```bash
git add src/modules/transactions/dto/deposit.dto.ts src/modules/transactions/transactions.service.ts src/modules/transactions/transactions.repository.ts tests/transactions/deposit.dto.test.ts tests/transactions/transactions.service.test.ts
git commit -m "feat(transactions): aceptar latitude/longitude opcionales en el deposito"
```

---

### Task 3: Flujo de transferencia P2P

**Files:**
- Modify: `src/modules/p2p/dto/transfer.dto.ts`
- Modify: `src/modules/p2p/p2p.service.ts:7-77`
- Modify: `src/modules/p2p/p2p.repository.ts:24-111`
- Test: `tests/p2p/transfer.dto.test.ts` (crear)
- Test: `tests/p2p/p2p.service.test.ts` (crear)

**Interfaces:**
- Consumes: `geolocationFields`, `refineGeoPair`, `Geolocation`, `mergeGeoMetadata` de `src/shared/geolocation.ts` (Task 1).
- Produces: `TransferDTO` incluye `latitude?: number; longitude?: number`. `P2PRepository.executeP2PTransfer(senderId, recipientId, amountInCents, currency, idempotencyKey, geo: Geolocation = {})`.

- [ ] **Step 1: Escribir el test de DTO que falla**

Crear `tests/p2p/transfer.dto.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { transferSchema } from '../../src/modules/p2p/dto/transfer.dto';

describe('transferSchema - geolocalizacion', () => {
  const base = {
    recipient_email: 'recipient@test.com',
    amount_in_cents: 3000,
    currency: 'USD',
    idempotency_key: 'idemp-1',
  };

  it('acepta la transferencia sin coordenadas', () => {
    expect(transferSchema.safeParse(base).success).toBe(true);
  });

  it('acepta la transferencia con latitude y longitude validas', () => {
    const result = transferSchema.safeParse({ ...base, latitude: 4.6097, longitude: -74.0817 });
    expect(result.success).toBe(true);
  });

  it('rechaza si solo viene latitude', () => {
    const result = transferSchema.safeParse({ ...base, latitude: 4.6097 });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run tests/p2p/transfer.dto.test.ts`
Expected: FAIL

- [ ] **Step 3: Extender `transfer.dto.ts`**

Reemplazar el contenido completo de `src/modules/p2p/dto/transfer.dto.ts`:

```typescript
import { z } from 'zod';
import { geolocationFields, refineGeoPair } from '../../../shared/geolocation';

export const transferSchema = z
  .object({
    recipient_email: z
      .string({ required_error: 'El correo del destinatario es obligatorio' })
      .email('El formato del correo es inválido'),
    amount_in_cents: z
      .number({ required_error: 'El monto es obligatorio' })
      .int('El monto debe ser un número entero (centavos)')
      .positive('El monto debe ser mayor a cero'),
    currency: z.enum(['USD', 'EUR', 'GBP', 'ARS', 'BRL', 'JPY'], {
      required_error: 'La divisa es obligatoria',
      invalid_type_error: 'Divisa no soportada',
    }),
    idempotency_key: z
      .string({ required_error: 'La clave de idempotencia es obligatoria' })
      .min(1, 'La clave de idempotencia no puede estar vacía'),
    ...geolocationFields,
  })
  .superRefine(refineGeoPair);

export type TransferDTO = z.infer<typeof transferSchema>;
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run tests/p2p/transfer.dto.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Escribir el test de servicio que falla**

Crear `tests/p2p/p2p.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { executeP2PTransferMock, findByIdempotencyKeyMock, findUserByEmailMock } = vi.hoisted(() => ({
  executeP2PTransferMock: vi.fn(),
  findByIdempotencyKeyMock: vi.fn(),
  findUserByEmailMock: vi.fn(),
}));

vi.mock('../../src/modules/p2p/p2p.repository', () => ({
  P2PRepository: vi.fn().mockImplementation(() => ({
    executeP2PTransfer: executeP2PTransferMock,
    findByIdempotencyKey: findByIdempotencyKeyMock,
    findUserByEmail: findUserByEmailMock,
  })),
}));

import { P2PService } from '../../src/modules/p2p/p2p.service';

describe('P2PService.processTransfer - geolocalizacion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findByIdempotencyKeyMock.mockResolvedValue(null);
    findUserByEmailMock.mockResolvedValue({ id: 'recipient-1' });
  });

  it('reenvia latitude y longitude al repository', async () => {
    executeP2PTransferMock.mockResolvedValue({ transactionId: 'tx-1' });

    const service = new P2PService();
    await service.processTransfer('sender-1', 'sender@test.com', {
      recipient_email: 'recipient@test.com',
      amount_in_cents: 3000,
      currency: 'USD',
      idempotency_key: 'idemp-1',
      latitude: 4.6097,
      longitude: -74.0817,
    } as any);

    expect(executeP2PTransferMock).toHaveBeenCalledWith(
      'sender-1',
      'recipient-1',
      3000,
      'USD',
      'idemp-1',
      { latitude: 4.6097, longitude: -74.0817 }
    );
  });
});
```

- [ ] **Step 6: Correr el test y verificar que falla**

Run: `npx vitest run tests/p2p/p2p.service.test.ts`
Expected: FAIL — `executeP2PTransferMock` se llama solo con 5 argumentos.

- [ ] **Step 7: Actualizar `processTransfer` en `p2p.service.ts`**

En `src/modules/p2p/p2p.service.ts`, dentro de `processTransfer` (líneas 7-77):

Reemplazar la línea 8:
```typescript
    const { recipient_email, amount_in_cents, currency, idempotency_key } = data;
```
por:
```typescript
    const { recipient_email, amount_in_cents, currency, idempotency_key, latitude, longitude } = data;
```

Reemplazar las líneas 52-58:
```typescript
      const result = await this.p2pRepository.executeP2PTransfer(
        senderId,
        recipient.id,
        amount_in_cents,
        currency,
        idempotency_key
      );
```
por:
```typescript
      const result = await this.p2pRepository.executeP2PTransfer(
        senderId,
        recipient.id,
        amount_in_cents,
        currency,
        idempotency_key,
        { latitude, longitude }
      );
```

- [ ] **Step 8: Actualizar `p2p.repository.ts`**

Agregar el import al inicio del archivo (después de la línea 2):

```typescript
import { Geolocation, mergeGeoMetadata } from '../../shared/geolocation';
```

Reemplazar la firma de `executeP2PTransfer` (línea 24) y su cuerpo (líneas 24-37):

```typescript
  async executeP2PTransfer(senderId: string, recipientId: string, amountInCents: number, currency: string, idempotencyKey: string, geo: Geolocation = {}) {
    const MAX_RETRIES = 3;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await this.runTransferAttempt(senderId, recipientId, amountInCents, currency, idempotencyKey, geo);
      } catch (error: any) {
        if (error?.code === '40001' && attempt < MAX_RETRIES) {
          continue; // conflicto de serialización, reintentar
        }
        throw error;
      }
    }
    throw new Error('P2P_TRANSFER_RETRY_EXHAUSTED');
  }
```

Reemplazar la firma de `runTransferAttempt` (línea 39) por:

```typescript
  private async runTransferAttempt(senderId: string, recipientId: string, amountInCents: number, currency: string, idempotencyKey: string, geo: Geolocation = {}) {
```

Reemplazar la construcción de `txMetadata` (línea 93):

```typescript
      const txMetadata = JSON.stringify(
        mergeGeoMetadata(
          { description: 'Transferencia P2P', currency, amount_in_cents: amountInCents, senderId, recipientId },
          geo
        )
      );
```

- [ ] **Step 9: Correr los tests y verificar que pasan**

Run: `npx vitest run tests/p2p`
Expected: PASS (todos los tests de `tests/p2p/`, incluyendo el controller test ya existente)

- [ ] **Step 10: Type-check y commit**

Run: `npx tsc --noEmit`
Expected: sin salida

```bash
git add src/modules/p2p/dto/transfer.dto.ts src/modules/p2p/p2p.service.ts src/modules/p2p/p2p.repository.ts tests/p2p/transfer.dto.test.ts tests/p2p/p2p.service.test.ts
git commit -m "feat(p2p): aceptar latitude/longitude opcionales en la transferencia"
```

---

### Task 4: Flujo de exchange

**Files:**
- Modify: `src/modules/exchange/exchange.controller.ts:38-109`
- Modify: `src/modules/exchange/exchange.service.ts:32-107`
- Modify: `src/modules/exchange/exchange.repository.ts:8-156`
- Test: `tests/exchange/exchange.controller.geolocation.test.ts` (crear)
- Test: `tests/exchange/exchange.service.geolocation.test.ts` (crear)

**Interfaces:**
- Consumes: `geolocationSchema`, `mergeGeoMetadata` de `src/shared/geolocation.ts` (Task 1).
- Produces: `executeExchangeOperation` acepta `latitude?: number; longitude?: number` en `ExecuteParams`. `executeExchange` (repository) acepta los mismos campos en `ExecuteExchangeParams`.

Este flujo no usa un DTO Zod (lee `req.body` directo), así que la validación se hace en el controller con `geolocationSchema.safeParse`.

- [ ] **Step 1: Escribir el test de controller que falla**

Crear `tests/exchange/exchange.controller.geolocation.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const { executeExchangeOperationMock, getWalletIdByUserIdMock, notifyTransactionEmailMock } = vi.hoisted(() => ({
  executeExchangeOperationMock: vi.fn(),
  getWalletIdByUserIdMock: vi.fn(),
  notifyTransactionEmailMock: vi.fn(),
}));

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

describe("postExchangeController - geolocalizacion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getWalletIdByUserIdMock.mockResolvedValue("wallet-1");
    executeExchangeOperationMock.mockResolvedValue({
      transactionId: "tx-1",
      rateApplied: 0.92,
      targetAmountCents: 9200,
      reused: false,
    });
  });

  it("reenvia latitude y longitude al service cuando vienen validas", async () => {
    const req: any = {
      user: { id: "user-1", email: "user@test.com" },
      body: {
        source_currency: "USD",
        target_currency: "EUR",
        source_amount_cents: 10000,
        idempotency_key: "idemp-1",
        latitude: 4.6097,
        longitude: -74.0817,
      },
    };
    const res = buildRes();

    await postExchangeController(req, res);

    expect(executeExchangeOperationMock).toHaveBeenCalledWith(
      expect.objectContaining({ latitude: 4.6097, longitude: -74.0817 })
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("rechaza con 400 si solo viene longitude", async () => {
    const req: any = {
      user: { id: "user-1", email: "user@test.com" },
      body: {
        source_currency: "USD",
        target_currency: "EUR",
        source_amount_cents: 10000,
        idempotency_key: "idemp-1",
        longitude: -74.0817,
      },
    };
    const res = buildRes();

    await postExchangeController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(executeExchangeOperationMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run tests/exchange/exchange.controller.geolocation.test.ts`
Expected: FAIL — no hay validación de geo ni se reenvían los campos.

- [ ] **Step 3: Actualizar `exchange.controller.ts`**

Agregar el import al inicio del archivo (después de la línea 4):

```typescript
import { geolocationSchema } from "../../shared/geolocation";
```

Reemplazar `postExchangeController` completo (líneas 38-109):

```typescript
export async function postExchangeController(req: Request, res: Response) {
  try {
    const userId = (req as any).user.id;
    const userEmail = (req as any).user.email;

    const { source_currency, target_currency, source_amount_cents, idempotency_key, latitude, longitude } = req.body;

    const geoResult = geolocationSchema.safeParse({ latitude, longitude });
    if (!geoResult.success) {
      return res.status(400).json({
        status: "error",
        error: { code: "INVALID_INPUT", message: "Coordenadas inválidas", details: geoResult.error.format() },
      });
    }

    const walletId = await getWalletIdByUserId(userId);

    const result = await executeExchangeOperation({
      userId,
      walletId,
      sourceCurrency: source_currency,
      targetCurrency: target_currency,
      sourceAmountCents: source_amount_cents,
      idempotencyKey: idempotency_key,
      latitude: geoResult.data.latitude,
      longitude: geoResult.data.longitude,
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

Run: `npx vitest run tests/exchange/exchange.controller.geolocation.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Escribir el test de servicio que falla**

Crear `tests/exchange/exchange.service.geolocation.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/modules/exchange/exchange-rates.repository", () => ({
  getCurrentRate: vi.fn(),
}));
vi.mock("../../src/modules/exchange/exchange.repository", () => ({
  executeExchange: vi.fn(),
  findExistingExchangeTransaction: vi.fn().mockResolvedValue(null),
}));

import { getCurrentRate } from "../../src/modules/exchange/exchange-rates.repository";
import { executeExchange } from "../../src/modules/exchange/exchange.repository";
import { executeExchangeOperation } from "../../src/modules/exchange/exchange.service";

describe("exchange.service - geolocalizacion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reenvia latitude y longitude al repository", async () => {
    (getCurrentRate as any).mockResolvedValue({ id: "rate-1", rateValue: 0.92 });
    (executeExchange as any).mockResolvedValue({ transactionId: "tx-1" });

    await executeExchangeOperation({
      userId: "user-1",
      walletId: "wallet-1",
      sourceCurrency: "USD",
      targetCurrency: "EUR",
      sourceAmountCents: 10000,
      idempotencyKey: "idemp-1",
      latitude: 4.6097,
      longitude: -74.0817,
    });

    expect(executeExchange).toHaveBeenCalledWith(
      expect.objectContaining({ latitude: 4.6097, longitude: -74.0817 })
    );
  });
});
```

- [ ] **Step 6: Correr el test y verificar que falla**

Run: `npx vitest run tests/exchange/exchange.service.geolocation.test.ts`
Expected: FAIL — `ExecuteParams` no acepta `latitude`/`longitude` y `executeExchange` no los recibe.

- [ ] **Step 7: Actualizar `exchange.service.ts`**

Reemplazar la interfaz `ExecuteParams` (líneas 32-39):

```typescript
interface ExecuteParams {
  userId: string;
  walletId: string;
  sourceCurrency: string;
  targetCurrency: string;
  sourceAmountCents: number;
  idempotencyKey: string;
  latitude?: number;
  longitude?: number;
}
```

Reemplazar la llamada a `executeExchange` dentro de `executeExchangeOperation` (líneas 79-89):

```typescript
    const result = await executeExchange({
      userId: params.userId,
      walletId: params.walletId,
      sourceCurrency: params.sourceCurrency,
      targetCurrency: params.targetCurrency,
      sourceAmountCents: params.sourceAmountCents,
      targetAmountCents,
      rateId: rate.id,
      rateApplied: rate.rateValue,
      idempotencyKey: params.idempotencyKey,
      latitude: params.latitude,
      longitude: params.longitude,
    });
```

- [ ] **Step 8: Actualizar `exchange.repository.ts`**

Agregar el import al inicio del archivo (después de la línea 6):

```typescript
import { mergeGeoMetadata } from "../../shared/geolocation";
```

Reemplazar la interfaz `ExecuteExchangeParams` (líneas 8-18):

```typescript
interface ExecuteExchangeParams {
  userId: string;
  walletId: string;
  sourceCurrency: string;
  targetCurrency: string;
  sourceAmountCents: number;
  targetAmountCents: number;
  rateId: string;
  rateApplied: number;
  idempotencyKey: string;
  latitude?: number;
  longitude?: number;
}
```

Reemplazar la construcción de `metadata` dentro de `runExchangeAttempt` (líneas 103-110):

```typescript
    const metadata = mergeGeoMetadata(
      {
        user_id: params.userId,
        request_payload: {
          source_currency: params.sourceCurrency,
          target_currency: params.targetCurrency,
          source_amount_cents: params.sourceAmountCents,
        },
      },
      { latitude: params.latitude, longitude: params.longitude }
    );
```

- [ ] **Step 9: Correr los tests y verificar que pasan**

Run: `npx vitest run tests/exchange`
Expected: PASS (todos los tests de `tests/exchange/`, incluyendo los ya existentes)

- [ ] **Step 10: Type-check y commit**

Run: `npx tsc --noEmit`
Expected: sin salida

```bash
git add src/modules/exchange/exchange.controller.ts src/modules/exchange/exchange.service.ts src/modules/exchange/exchange.repository.ts tests/exchange/exchange.controller.geolocation.test.ts tests/exchange/exchange.service.geolocation.test.ts
git commit -m "feat(exchange): aceptar latitude/longitude opcionales en el cambio de divisa"
```

---

### Task 5: Flujo de consumo con tarjeta virtual

**Files:**
- Modify: `src/modules/virtual-cards/virtual-cards.controller.ts:92-162`
- Modify: `src/modules/virtual-cards/card-spend.service.ts:14-141`
- Test: `tests/virtual-cards/virtual-cards.controller.geolocation.test.ts` (crear)
- Test: `tests/virtual-cards/card-spend.service.geolocation.test.ts` (crear)

**Interfaces:**
- Consumes: `geolocationSchema`, `mergeGeoMetadata` de `src/shared/geolocation.ts` (Task 1).
- Produces: `simulateSpend` acepta `latitude?: number; longitude?: number` en `SimulateSpendParams`; el `metadata` que arma internamente (usado en `insertDirectCardSpend` e `insertFailedCardSpend`) incluye las coordenadas cuando vienen completas.

- [ ] **Step 1: Escribir el test de controller que falla**

Crear `tests/virtual-cards/virtual-cards.controller.geolocation.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const { simulateSpendMock, getWalletIdByUserIdMock, notifyTransactionEmailMock } = vi.hoisted(() => ({
  simulateSpendMock: vi.fn(),
  getWalletIdByUserIdMock: vi.fn(),
  notifyTransactionEmailMock: vi.fn(),
}));

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

describe("simulateSpendController - geolocalizacion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getWalletIdByUserIdMock.mockResolvedValue("wallet-1");
    simulateSpendMock.mockResolvedValue({ transactionId: "tx-1", status: "COMPLETED", reused: false });
  });

  it("reenvia latitude y longitude al service cuando vienen validas", async () => {
    const req: any = {
      user: { id: "user-1", email: "user@test.com" },
      body: {
        card_id: "card-1",
        amount_in_cents: 2000,
        currency: "USD",
        merchant_name: "Kiosco Don Pepe",
        idempotency_key: "idemp-1",
        latitude: 4.6097,
        longitude: -74.0817,
      },
    };
    const res = buildRes();

    await simulateSpendController(req, res);

    expect(simulateSpendMock).toHaveBeenCalledWith(
      expect.objectContaining({ latitude: 4.6097, longitude: -74.0817 })
    );
  });

  it("rechaza con 400 si solo viene latitude", async () => {
    const req: any = {
      user: { id: "user-1", email: "user@test.com" },
      body: {
        card_id: "card-1",
        amount_in_cents: 2000,
        currency: "USD",
        merchant_name: "Kiosco Don Pepe",
        idempotency_key: "idemp-1",
        latitude: 4.6097,
      },
    };
    const res = buildRes();

    await simulateSpendController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(simulateSpendMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run tests/virtual-cards/virtual-cards.controller.geolocation.test.ts`
Expected: FAIL

- [ ] **Step 3: Actualizar `virtual-cards.controller.ts`**

Agregar el import al inicio del archivo (después de la línea 5):

```typescript
import { geolocationSchema } from "../../shared/geolocation";
```

Reemplazar `simulateSpendController` completo (líneas 92-162):

```typescript
export async function simulateSpendController(req: Request, res: Response) {
  try {
    const userId = (req as any).user.id;
    const userEmail = (req as any).user.email;
    const { card_id, amount_in_cents, currency, merchant_name, idempotency_key, latitude, longitude } = req.body;

    const geoResult = geolocationSchema.safeParse({ latitude, longitude });
    if (!geoResult.success) {
      return res.status(400).json({
        status: "error",
        error: { code: "INVALID_INPUT", message: "Coordenadas inválidas", details: geoResult.error.format() },
      });
    }

    const walletId = await getWalletIdByUserId(userId);

    const result = await simulateSpend({
      cardId: card_id,
      walletId,
      userId,
      amountCents: amount_in_cents,
      currency,
      merchantName: merchant_name,
      idempotencyKey: idempotency_key,
      latitude: geoResult.data.latitude,
      longitude: geoResult.data.longitude,
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

Run: `npx vitest run tests/virtual-cards/virtual-cards.controller.geolocation.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Escribir el test de servicio que falla**

Crear `tests/virtual-cards/card-spend.service.geolocation.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/modules/virtual-cards/virtual-cards.repository", () => ({
  findCardById: vi.fn(),
}));
vi.mock("../../src/modules/virtual-cards/card-spend.repository", () => ({
  findExistingTransaction: vi.fn(),
  getBalance: vi.fn(),
  insertDirectCardSpend: vi.fn(),
  insertFailedCardSpend: vi.fn(),
}));
vi.mock("../../src/modules/exchange/exchange.service", () => ({
  getQuote: vi.fn(),
  executeExchangeOperation: vi.fn(),
}));

import { findCardById } from "../../src/modules/virtual-cards/virtual-cards.repository";
import {
  findExistingTransaction,
  getBalance,
  insertDirectCardSpend,
} from "../../src/modules/virtual-cards/card-spend.repository";
import { simulateSpend } from "../../src/modules/virtual-cards/card-spend.service";

const baseParams = {
  cardId: "card-1",
  walletId: "wallet-1",
  userId: "user-1",
  amountCents: 2500,
  currency: "EUR",
  merchantName: "Cafe Central",
  idempotencyKey: "idemp-spend-1",
};

describe("card-spend.service - geolocalizacion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("incluye latitude y longitude en el metadata del cobro directo", async () => {
    (findExistingTransaction as any).mockResolvedValue(null);
    (findCardById as any).mockResolvedValue({ walletId: "wallet-1", status: "ACTIVE", currencyDefault: "USD" });
    (getBalance as any).mockResolvedValue({ id: "balance-eur", amountCents: 5000 });
    (insertDirectCardSpend as any).mockResolvedValue("tx-directo");

    await simulateSpend({ ...baseParams, latitude: 4.6097, longitude: -74.0817 });

    expect(insertDirectCardSpend).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ latitude: 4.6097, longitude: -74.0817 }),
      })
    );
  });

  it("no incluye coordenadas si no vienen en la peticion", async () => {
    (findExistingTransaction as any).mockResolvedValue(null);
    (findCardById as any).mockResolvedValue({ walletId: "wallet-1", status: "ACTIVE", currencyDefault: "USD" });
    (getBalance as any).mockResolvedValue({ id: "balance-eur", amountCents: 5000 });
    (insertDirectCardSpend as any).mockResolvedValue("tx-directo");

    await simulateSpend(baseParams);

    const call = (insertDirectCardSpend as any).mock.calls[0][0];
    expect(call.metadata.latitude).toBeUndefined();
    expect(call.metadata.longitude).toBeUndefined();
  });
});
```

- [ ] **Step 6: Correr el test y verificar que falla**

Run: `npx vitest run tests/virtual-cards/card-spend.service.geolocation.test.ts`
Expected: FAIL — `SimulateSpendParams` no acepta `latitude`/`longitude` y el `metadata` no las incluye.

- [ ] **Step 7: Actualizar `card-spend.service.ts`**

Agregar el import al inicio del archivo (después de la línea 12):

```typescript
import { mergeGeoMetadata } from "../../shared/geolocation";
```

Reemplazar la interfaz `SimulateSpendParams` (líneas 14-22):

```typescript
interface SimulateSpendParams {
  cardId: string;
  walletId: string;
  userId: string;
  amountCents: number;
  currency: string;
  merchantName: string;
  idempotencyKey: string;
  latitude?: number;
  longitude?: number;
}
```

Dentro de `simulateSpend` (línea 76 en adelante), reemplazar la construcción de `metadata` (líneas 87-90):

```typescript
  const metadata = mergeGeoMetadata(
    {
      merchant_name: params.merchantName,
      request_payload: buildRequestPayload(params),
    },
    { latitude: params.latitude, longitude: params.longitude }
  );
```

- [ ] **Step 8: Correr los tests y verificar que pasan**

Run: `npx vitest run tests/virtual-cards`
Expected: PASS (todos los tests de `tests/virtual-cards/`, incluyendo los ya existentes)

- [ ] **Step 9: Type-check y commit**

Run: `npx tsc --noEmit`
Expected: sin salida

```bash
git add src/modules/virtual-cards/virtual-cards.controller.ts src/modules/virtual-cards/card-spend.service.ts tests/virtual-cards/virtual-cards.controller.geolocation.test.ts tests/virtual-cards/card-spend.service.geolocation.test.ts
git commit -m "feat(virtual-cards): aceptar latitude/longitude opcionales en el consumo con tarjeta"
```

---

### Task 6: Regresión completa y verificación manual

**Files:** ninguno (solo verificación)

**Interfaces:** N/A

- [ ] **Step 1: Correr toda la suite de tests**

Run: `npm test`
Expected: todos los test files en PASS, incluyendo los 12 archivos nuevos/modificados de las Tasks 1-5 sumados a los 15 preexistentes.

- [ ] **Step 2: Type-check completo**

Run: `npx tsc --noEmit`
Expected: sin salida

- [ ] **Step 3: Verificación manual (requiere servidor + Postgres corriendo con `DATABASE_URL` configurada)**

Si hay una base de datos disponible, levantar el servidor (`npm run dev`) y probar cada endpoint con `curl`, confirmando `201`/`200` con coordenadas válidas, `400` con coordenadas incompletas, y que `GET /transactions` devuelve `metadata.latitude`/`metadata.longitude` para las transacciones creadas con geo. Documentar el resultado en el mensaje de cierre de la tarea; si no hay DB disponible en el entorno de ejecución, dejarlo explícito como pendiente para el usuario en un entorno con base de datos.

- [ ] **Step 4: Commit final si hubo ajustes**

Si el Step 1 o 2 revelaron algo que corregir, aplicar el fix, repetir Steps 1-2, y commitear:

```bash
git add -A
git commit -m "fix: ajustes de regresion tras geolocalizacion de transacciones"
```

Si no hubo ajustes, no hace falta commit — el trabajo ya quedó commiteado al final de cada task anterior.
