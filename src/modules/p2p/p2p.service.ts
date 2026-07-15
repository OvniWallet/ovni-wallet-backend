import { P2PRepository } from './p2p.repository';
import { TransferDTO } from './dto/transfer.dto';

export class P2PService {
  private p2pRepository = new P2PRepository();

  async processTransfer(senderId: string, senderEmail: string, data: TransferDTO) {
    const { recipient_email, amount_in_cents, currency, idempotency_key, latitude, longitude } = data;

    // 1. REGLA: No transferirse a sí mismo
    if (recipient_email.toLowerCase() === senderEmail.toLowerCase()) {
      const error = new Error('No puedes transferirte fondos a ti mismo');
      (error as any).statusCode = 422;
      (error as any).code = 'CANNOT_TRANSFER_TO_SELF';
      throw error;
    }

    // 2. IDEMPOTENCIA: Verificar si la clave ya fue procesada
    const existingTx = await this.p2pRepository.findByIdempotencyKey(idempotency_key);
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
        amount_transferred: amount_in_cents,
        currency,
        _idempotent_reused: true,
      };
    }

    // 3. Buscar destinatario
    const recipient = await this.p2pRepository.findUserByEmail(recipient_email);
    if (!recipient) {
      const error = new Error('El usuario destinatario no está registrado');
      (error as any).statusCode = 422;
      (error as any).code = 'RECIPIENT_NOT_FOUND';
      throw error;
    }

    try {
      // 4. Ejecutar la transferencia contable pesimista
      const result = await this.p2pRepository.executeP2PTransfer(
        senderId,
        recipient.id,
        amount_in_cents,
        currency,
        idempotency_key,
        { latitude, longitude }
      );

      return {
        transaction_id: result.transactionId,
        amount_transferred: amount_in_cents,
        currency,
      };
    } catch (error: any) {
      // Formatear errores específicos del ledger relacional
      if (error.message === 'INSUFFICIENT_FUNDS') {
        error.statusCode = 422;
        error.code = 'INSUFFICIENT_FUNDS';
      } else if (error.message.startsWith('BALANCE_NOT_FOUND')) {
        error.statusCode = 422;
        error.code = 'BALANCE_CONFIGURATION_ERROR';
        error.message = 'Uno de los usuarios no tiene configurada la divisa seleccionada';
      }
      throw error;
    }
  }
}