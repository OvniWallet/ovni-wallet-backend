import { z } from 'zod';

export const RefreshDTOSchema = z.object({
  refresh_token: z
    .string({ required_error: 'El refresh_token es obligatorio' })
    .min(10, 'El formato del refresh token no es válido'),
});

export type RefreshDTO = z.infer<typeof RefreshDTOSchema>;