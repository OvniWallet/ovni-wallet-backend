import { buildFinancialContext } from "./chatbot.aggregator";
import { askGemini } from "../../integrations/gemini/gemini.client";

export async function processChatQuery(userId: string, walletId: string, message: string) {
  const context = await buildFinancialContext(userId, walletId);
  const reply = await askGemini(message, context);
  return { reply };
}