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
