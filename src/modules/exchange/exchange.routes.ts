import { Router } from "express";
import { getQuoteController, postExchangeController } from "./exchange.controller";

const router = Router();

router.get("/quote", getQuoteController);
router.post("/", postExchangeController);

export default router;