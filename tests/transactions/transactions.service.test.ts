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
