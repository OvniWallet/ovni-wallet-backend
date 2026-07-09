import { z } from 'zod';

export const LoginDTOSchema = z.object({
  email: z
    .string({ required_error: 'El email es obligatorio' })
    .email('Formato de email inválido')
    .transform((val) => val.trim().toLowerCase()),
  password: z
    .string({ required_error: 'La contraseña es obligatoria' })
    .min(8, 'La contraseña debe tener al menos 8 caracteres'),
});

export type LoginDTO = z.infer<typeof LoginDTOSchema>;