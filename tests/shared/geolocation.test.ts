import { describe, it, expect } from 'vitest';
import { geolocationSchema, mergeGeoMetadata } from '../../src/shared/geolocation';

describe('geolocationSchema', () => {
  it('acepta latitude y longitude validas', () => {
    const result = geolocationSchema.safeParse({ latitude: 4.6097, longitude: -74.0817 });
    expect(result.success).toBe(true);
  });

  it('acepta payload vacio (ambos opcionales)', () => {
    const result = geolocationSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('rechaza si solo viene latitude', () => {
    const result = geolocationSchema.safeParse({ latitude: 4.6097 });
    expect(result.success).toBe(false);
  });

  it('rechaza si solo viene longitude', () => {
    const result = geolocationSchema.safeParse({ longitude: -74.0817 });
    expect(result.success).toBe(false);
  });

  it('rechaza latitude fuera de rango', () => {
    const result = geolocationSchema.safeParse({ latitude: 95, longitude: -74.0817 });
    expect(result.success).toBe(false);
  });

  it('rechaza longitude fuera de rango', () => {
    const result = geolocationSchema.safeParse({ latitude: 4.6097, longitude: -200 });
    expect(result.success).toBe(false);
  });
});

describe('mergeGeoMetadata', () => {
  it('agrega latitude y longitude preservando el resto del metadata', () => {
    const merged = mergeGeoMetadata({ description: 'Deposito' }, { latitude: 4.6097, longitude: -74.0817 });
    expect(merged).toEqual({ description: 'Deposito', latitude: 4.6097, longitude: -74.0817 });
  });

  it('no agrega nada si no vienen coordenadas', () => {
    const merged = mergeGeoMetadata({ description: 'Deposito' }, {});
    expect(merged).toEqual({ description: 'Deposito' });
  });
});
