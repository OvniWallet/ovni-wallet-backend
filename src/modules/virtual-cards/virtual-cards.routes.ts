import { Router } from "express";
import { getCardsController, postCardController, blockCardController } from "./virtual-cards.controller";
import { authMiddleware } from "../../middlewares/auth.middleware";

const router = Router();

router.use(authMiddleware);

router.get("/", getCardsController);
router.post("/", postCardController);
router.patch("/:id/block", blockCardController);

export default router;