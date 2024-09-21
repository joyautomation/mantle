import { log } from "./log.ts";

export function isValidPort(input: number | undefined): boolean {
  return (
    input != null && Number.isInteger(input) && input >= 1 && input <= 65535
  );
}

export function isValidHost(input: string | undefined): boolean {
  return (
    input != null && /^[a-zA-Z0-9]+([-.](?![-.])[a-zA-Z0-9]+)*$/.test(input)
  );
}

export function isValidScanRate(input: number | undefined): boolean {
  return input != null && Number.isInteger(input) && input >= 1;
}

export function validate<T>(
  input: T | undefined,
  defaultValue: T,
  validator: (input: T | undefined) => boolean,
  symbolName: string,
): T {
  if (input != null && validator(input)) {
    return input;
  } else {
    if (input != null) {
      log.info(
        `${symbolName} with value "${input}" is not valid, using default "${defaultValue}"`,
      );
    }
    return defaultValue;
  }
}

export function makeNumberOrUndefined(
  input: string | number | undefined,
): number | undefined {
  return input == null ? undefined : Number(input);
}

export function validateHost(input: string | undefined) {
  return validate(input, "0.0.0.0", isValidHost, "MANTLE_HOST");
}

export function validatePort(input: string | number | undefined) {
  return validate(
    makeNumberOrUndefined(input),
    4001,
    isValidPort,
    "MANTLE_PORT",
  );
}
