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
