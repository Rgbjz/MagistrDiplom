import { Transform } from 'class-transformer';

/** Multipart forms send booleans as "true"/"false" strings. */
export function ToBoolean() {
  return Transform(({ value }: { value: unknown }) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'boolean') return value;
    return typeof value === 'string' && value.toLowerCase() === 'true';
  });
}

/** Empty multipart strings mean "not provided". */
export function EmptyToUndefined() {
  return Transform(({ value }: { value: unknown }) =>
    value === '' ? undefined : value,
  );
}
