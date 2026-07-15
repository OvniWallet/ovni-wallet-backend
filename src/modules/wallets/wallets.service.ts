import { WalletsRepository } from './wallets.repository';

export class WalletsService {
  private walletsRepository = new WalletsRepository();

  async getUserBalance(userId: string) {
    const rawBalances = await this.walletsRepository.findBalancesByUserId(userId);

    // Mapeamos los balances para convertir los centavos a decimales comprensibles
    const formattedBalances = rawBalances.map((item) => ({
      currency: item.currency,
      amount: Number(item.amount_in_cents) / 100,
    }));

    return {
      balances: formattedBalances,
    };
  }
}