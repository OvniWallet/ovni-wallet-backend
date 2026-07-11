import { z } from 'zod';

export const depositSchema = z.object({
  amount_in_cents: z
    .number({ required_error: 'El monto es obligatorio' })
    .int('El monto debe ser un número entero (centavos)')
    .positive('El monto debe ser mayor a cero'),
  currency: z.enum(['USD', 'EUR', 'GBP', 'ARS', 'BRL', 'JPY'], {
    required_error: 'La divisa es obligatoria',
    invalid_type_error: 'Divisa no soportada por OvniWallet',
  }),
  idempotency_key: z
    .string({ required_error: 'La clave de idempotencia es obligatoria' })
    .min(1, 'La clave de idempotencia no puede estar vacía'),
});

export type DepositDTO = z.infer<typeof depositSchema>;