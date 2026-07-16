import { z } from 'zod';

export const geolocationFields = {
  latitude: z
    .number({ invalid_type_error: 'La latitud debe ser un número' })
    .min(-90, 'La latitud debe estar entre -90 y 90')
    .max(90, 'La latitud debe estar entre -90 y 90')
    .optional(),
  longitude: z
    .number({ invalid_type_error: 'La longitud debe ser un número' })
    .min(-180, 'La longitud debe estar entre -180 y 180')
    .max(180, 'La longitud debe estar entre -180 y 180')
    .optional(),
};

export function refineGeoPair(
  data: { latitude?: number; longitude?: number },
  ctx: z.RefinementCtx
): void {
  const hasLatitude = data.latitude !== undefined;
  const hasLongitude = data.longitude !== undefined;

  if (hasLatitude !== hasLongitude) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'latitude y longitude deben enviarse juntos',
      path: [hasLatitude ? 'longitude' : 'latitude'],
    });
  }
}

export const geolocationSchema = z.object(geolocationFields).superRefine(refineGeoPair);

export type Geolocation = z.infer<typeof geolocationSchema>;

export function mergeGeoMetadata<T extends Record<string, unknown>>(
  baseMetadata: T,
  geo: Geolocation
): T & { latitude?: number; longitude?: number } {
  if (geo.latitude === undefined || geo.longitude === undefined) {
    return baseMetadata;
  }
  return { ...baseMetadata, latitude: geo.latitude, longitude: geo.longitude };
}
