//Usamos Zod para validar estrictamente la entrada en el punto de acceso.
import { z } from 'zod';

export const RegisterDTOSchema = z.object({
  email: z
    .string({ required_error: 'El email es obligatorio' })
    .email('Formato de email inválido')
    .max(255, 'El email no puede superar los 255 caracteres')
    .transform((val) => val.trim().toLowerCase()),
  password: z
    .string({ required_error: 'La contraseña es obligatoria' })
    .min(8, 'La contraseña debe tener al menos 8 caracteres')
    .max(72, 'La contraseña no puede superar los 72 caracteres')
    .regex(/[A-Z]/, 'La contraseña debe tener al menos una mayúscula')
    .regex(/[a-z]/, 'La contraseña debe tener al menos una minúscula')
    .regex(/[0-9]/, 'La contraseña debe tener al menos un número')
    .regex(/[^A-Za-z0-9]/, 'La contraseña debe tener al menos un carácter especial'),
  first_name: z
    .string({ required_error: 'El nombre es obligatorio' })
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(50, 'El nombre no puede superar los 50 caracteres')
    .regex(/^[A-Za-zÁéíóúÁÉÍÓÚñÑ\s]+$/, 'El nombre solo debe contener letras'),
  last_name: z
    .string({ required_error: 'El apellido es obligatorio' })
    .min(2, 'El apellido debe tener al menos 2 caracteres')
    .max(50, 'El apellido no puede superar los 50 caracteres')
    .regex(/^[A-Za-zÁéíóúÁÉÍÓÚñÑ\s]+$/, 'El apellido solo debe contener letras'),
  country_code: z
    .string({ required_error: 'El código de país es obligatorio' })
    .length(3, 'El código de país debe ser ISO de exactamente 3 caracteres (e.g., COL)'),
  timezone: z
    .string({ required_error: 'La zona horaria es obligatoria' })
    .min(2, 'Zona horaria inválida'),
});

export type RegisterDTO = z.infer<typeof RegisterDTOSchema>;