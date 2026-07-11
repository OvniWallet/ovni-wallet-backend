import { Router } from "express";
import { getQuoteController, postExchangeController } from "./exchange.controller";
import { authMiddleware } from "../../middlewares/auth.middleware";

const router = Router();

router.use(authMiddleware);

router.get("/quote", getQuoteController);
router.post("/", postExchangeController);

export default router;