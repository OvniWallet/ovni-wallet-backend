import { Router } from "express";
import { postChatQueryController } from "./chatbot.controller";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { chatbotRateLimiter } from "../../middlewares/rate-limit.middleware";

const router = Router();

router.use(authMiddleware);
router.post("/query", chatbotRateLimiter, postChatQueryController);

export default router;