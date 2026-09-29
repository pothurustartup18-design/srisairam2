/** True when `err` is a MongoDB duplicate-key error (E11000/E11001) from a unique index violation. */
export function isDuplicateKeyError(err: any): boolean {
  return !!err && (err.code === 11000 || err.code === 11001);
}

/** Best-effort: the field name that triggered a duplicate-key error, if the driver reported one. */
export function duplicateKeyField(err: any): string | undefined {
  const keys = err?.keyValue ? Object.keys(err.keyValue) : undefined;
  return keys && keys.length > 0 ? keys[0] : undefined;
}
