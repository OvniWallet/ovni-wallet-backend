import { z } from 'zod';

export const transferSchema = z.object({
  recipient_email: z
    .string({ required_error: 'El correo del destinatario es obligatorio' })
    .email('El formato del correo es inválido'),
  amount_in_cents: z
    .number({ required_error: 'El monto es obligatorio' })
    .int('El monto debe ser un número entero (centavos)')
    .positive('El monto debe ser mayor a cero'),
  currency: z.enum(['USD', 'EUR', 'GBP', 'ARS', 'BRL', 'JPY'], {
    required_error: 'La divisa es obligatoria',
    invalid_type_error: 'Divisa no soportada',
  }),
  idempotency_key: z
    .string({ required_error: 'La clave de idempotencia es obligatoria' })
    .min(1, 'La clave de idempotencia no puede estar vacía'),
});

export type TransferDTO = z.infer<typeof transferSchema>;