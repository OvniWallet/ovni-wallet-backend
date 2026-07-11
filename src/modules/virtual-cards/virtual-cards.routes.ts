import { Router } from "express";
import {
  getCardsController,
  postCardController,
  blockCardController,
  simulateSpendController,
} from "./virtual-cards.controller";
import { authMiddleware } from "../../middlewares/auth.middleware";

const router = Router();

router.use(authMiddleware);

router.get("/", getCardsController);
router.post("/", postCardController);
router.patch("/:id/block", blockCardController);
router.post("/simulate-spend", simulateSpendController);

export default router;