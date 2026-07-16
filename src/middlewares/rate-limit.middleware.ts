import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { Request } from "express";

function keyByUser(req: Request): string {
  const userId = (req as any).user?.id;
  return userId || ipKeyGenerator(req.ip || "anonimo");
}

export const financialRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 15,
  keyGenerator: keyByUser,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: "error",
    error: { code: "TOO_MANY_REQUESTS", message: "Demasiadas operaciones, esperá un momento", details: null },
  },
});

export const chatbotRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: keyByUser,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: "error",
    error: { code: "TOO_MANY_REQUESTS", message: "Demasiadas consultas al asistente, esperá un momento", details: null },
  },
});