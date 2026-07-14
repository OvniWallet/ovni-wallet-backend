import { Router } from "express";
import { postChatQueryController } from "./chatbot.controller";
import { authMiddleware } from "../../middlewares/auth.middleware";

const router = Router();

router.use(authMiddleware);
router.post("/query", postChatQueryController);

export default router;