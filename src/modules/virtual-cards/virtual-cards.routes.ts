import { Router } from "express";
import {
  getCardsController,
  postCardController,
  blockCardController,
  simulateSpendController,
} from "./virtual-cards.controller";
import { isAuth } from "../../middlewares/is-auth.middleware";

const router = Router();

router.use(isAuth);

router.get("/", getCardsController);
router.post("/", postCardController);
router.patch("/:id/block", blockCardController);
router.post("/simulate-spend", simulateSpendController);

export default router;