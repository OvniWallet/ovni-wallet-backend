import { Router } from "express";
import { getQuoteController, postExchangeController } from "./exchange.controller";
import { isAuth } from "../../middlewares/is-auth.middleware";

const router = Router();

router.use(isAuth);

router.get("/quote", getQuoteController);
router.post("/", postExchangeController);

export default router;