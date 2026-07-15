import { Router } from "express";
import { postChatQueryController } from "./chatbot.controller";
import { isAuth } from "../../middlewares/is-auth.middleware";
import { chatbotRateLimiter } from "../../middlewares/rate-limit.middleware";

const router = Router();

router.use(isAuth);
router.post("/query", chatbotRateLimiter, postChatQueryController);

export default router;