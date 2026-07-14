import { Router } from "express";
import { getQuoteController, postExchangeController } from "./exchange.controller";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { financialRateLimiter } from "../../middlewares/rate-limit.middleware";

const router = Router();

router.use(authMiddleware);

router.get("/quote", getQuoteController);
router.post("/", financialRateLimiter, postExchangeController);

export default router;