# Historial de gastos geolocalizado — Diseño

## Contexto

El frontend quiere renderizar un mapa de consumo del usuario. Decisión de diseño ya tomada por el negocio: el backend **solo** recibe y almacena `latitude`/`longitude` (números) enviados por el frontend, sin geocodificación inversa ni dependencias externas. Las coordenadas se guardan dentro del campo `metadata` (JSONB) que ya existe en la tabla `transactions`, sin modificar el esquema ni generar migraciones.

## Alcance

Cuatro flujos que crean transacciones aceptan `latitude`/`longitude` opcionales en el body de la petición:

1. Depósito — `POST /transactions/deposit`
2. Transferencia P2P — `POST /p2p/transfers`
3. Cambio de divisa — `POST /exchange`
4. Consumo con tarjeta virtual — `POST /virtual-cards/simulate-spend`

El endpoint de historial (`GET /transactions`) y el de detalle (`GET /transactions/:id`) ya devuelven el objeto `metadata` completo (confirmado en `transactions.service.ts`), por lo que no requieren cambios.

## Validación

Nuevo módulo compartido `src/shared/geolocation.ts`:

- `geolocationSchema` (Zod): `latitude` (`-90..90`, opcional) y `longitude` (`-180..180`, opcional).
- Regla de "par completo": si se envía uno sin el otro, la petición se rechaza con `400 INVALID_INPUT`. Se implementa con `superRefine` para que el mensaje de error sea claro.
- `mergeGeoMetadata(baseMetadata, geo)`: helper puro que retorna `{ ...baseMetadata, latitude, longitude }` solo si ambos valores están presentes; si no, retorna `baseMetadata` sin modificar. Nunca pisa otras propiedades ya guardadas por cada flujo.

## Cableado por flujo

### Deposit (ya usa Zod)
- `dto/deposit.dto.ts`: `.merge(geolocationSchema)` sobre `depositSchema`.
- `transactions.service.ts` → `processDeposit`: recibe `latitude`/`longitude` y los pasa al repositorio.
- `transactions.repository.ts` → `createDeposit`: aplica `mergeGeoMetadata` al objeto `txMetadata` antes del `INSERT`.

### P2P (ya usa Zod)
- `dto/transfer.dto.ts`: `.merge(geolocationSchema)` sobre `transferSchema`.
- `p2p.service.ts` → `processTransfer`: propaga `latitude`/`longitude`.
- `p2p.repository.ts` → `executeP2PTransfer` / `runTransferAttempt`: aplica `mergeGeoMetadata` al `txMetadata`.

### Exchange (sin DTO Zod, usa `req.body` directo)
- `exchange.controller.ts` → `postExchangeController`: valida `latitude`/`longitude` con `geolocationSchema.safeParse` sobre los campos extraídos de `req.body`; en caso de error responde `400 INVALID_INPUT` (mismo formato que los demás errores del controller).
- `exchange.service.ts` → `executeExchangeOperation`: propaga los campos en `ExecuteParams`.
- `exchange.repository.ts` → `runExchangeAttempt`: aplica `mergeGeoMetadata` al objeto `metadata` ya existente antes del `INSERT`.

### Card-spend (sin DTO Zod, usa `req.body` directo)
- `virtual-cards.controller.ts` → `simulateSpendController`: misma validación manual que exchange.
- `card-spend.service.ts` → `simulateSpend`: propaga `latitude`/`longitude` en `SimulateSpendParams` y aplica `mergeGeoMetadata` al objeto `metadata` en los tres caminos (cobro directo, cobro tras conversión, y `insertFailedCardSpend`).
- `card-spend.repository.ts`: sin cambios (ya acepta un `metadata: Record<string, unknown>` genérico).

## Fuera de alcance

- Cambios de esquema de base de datos o migraciones.
- Geocodificación inversa o llamadas a APIs externas.
- Uso de las coordenadas en la validación de idempotencia (el match sigue comparando solo `currency`/`amount_in_cents`/`card_id` según el flujo, igual que hoy).
- Endpoints de historial/detalle (ya exponen `metadata` completo).

## Testing

El proyecto no tiene tests automatizados aún (solo carpetas placeholder bajo `tests/`). Verificación: `npx tsc --noEmit` limpio + prueba manual de cada endpoint con y sin coordenadas, y con coordenadas incompletas (debe rechazar con 400).
