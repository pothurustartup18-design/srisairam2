const PHONE_REGEX = /^\d{10}$/;

export function isValidPhone(value: string): boolean {
  return PHONE_REGEX.test(value);
}
