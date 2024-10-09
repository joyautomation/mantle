import { log } from "./log.ts";
import { pipe } from "./utils/pipe.ts";

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

export const validateCurry = <T>(
  defaultValue: T,
  validator: (input: T | undefined) => boolean,
  symbolName: string,
) =>
(input: T | undefined) => validate(input, defaultValue, validator, symbolName);

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

const validateSslCaPath = (input: string | undefined) => {
  if (input == null || input.length === 0) {
    return false;
  }
  try {
    const cert = Deno.readTextFileSync(input);
    return validateSslCaCert(cert);
  } catch (_error) {
    return false;
  }
};

export const validateSslCaCert = (input: string | undefined) => {
  if (!input) return false;

  // More robust certificate pattern
  const caPattern =
    /^-----BEGIN CERTIFICATE-----\s*([\s\S]*?)\s*-----END CERTIFICATE-----\s*$/;
  const match = input.match(caPattern);

  if (!match) return false;

  // Basic content validation
  const content = match[1].replace(/\s+/g, "");
  return content.length > 0 && /^[A-Za-z0-9+/=]+$/.test(content);
};

export function validateSslCa(input: string | undefined) {
  const defaultValue: string = "";
  return pipe(
    input,
    validateCurry(defaultValue, validateSslCaPath, "MANTLE_DB_SSL_CA"),
    (input) => input ? Deno.readTextFileSync(input) : undefined,
    validateCurry(
      defaultValue,
      validateSslCaCert,
      "MANTLE_DB_SSL_CA",
    ),
  );
}
