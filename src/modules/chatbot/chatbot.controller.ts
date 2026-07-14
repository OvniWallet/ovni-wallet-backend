import { Request, Response } from "express";
import { processChatQuery } from "./chatbot.service";
import { getWalletIdByUserId } from "../../shared/wallet-lookup";

export async function postChatQueryController(req: Request, res: Response) {
  try {
    const userId = (req as any).user.user_id;
    const walletId = await getWalletIdByUserId(userId);
    const { message } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        status: "error",
        error: { code: "INVALID_INPUT", message: "Falta el mensaje", details: null },
      });
    }

    const result = await processChatQuery(userId, walletId, message);

    res.status(200).json({ status: "success", data: { reply: result.reply } });
  } catch (err) {
    res.status(502).json({
      status: "error",
      error: { code: "EXTERNAL_SERVICE_UNAVAILABLE", message: "El asistente no esta disponible", details: null },
    });
  }
}