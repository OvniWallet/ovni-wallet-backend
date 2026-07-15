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
