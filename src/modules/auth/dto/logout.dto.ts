import { z } from 'zod';

export const LogoutDTOSchema = z.object({
  refresh_token: z
    .string({ required_error: 'El refresh_token es obligatorio para cerrar sesión' })
    .min(10, 'El formato del refresh token no es válido'),
});

export type LogoutDTO = z.infer<typeof LogoutDTOSchema>;