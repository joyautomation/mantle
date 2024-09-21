import { describe, it } from "jsr:@std/testing/bdd";
import { expect } from "jsr:@std/expect";
import {
  isValidHost,
  isValidPort,
  isValidScanRate,
  validate,
} from "./validation.ts";
import { assertSpyCalls, stub } from "@std/testing/mock";
import { makeNumberOrUndefined } from "./validation.ts";

describe("isValidHost", () => {
  it("should return true for valid hostnames", () => {
    expect(isValidHost("example.com")).toBe(true);
    expect(isValidHost("sub.example.com")).toBe(true);
    expect(isValidHost("localhost")).toBe(true);
    expect(isValidHost("192.168.1.1")).toBe(true);
  });

  it("should return false for invalid hostnames", () => {
    expect(isValidHost("")).toBe(false);
    expect(isValidHost("invalid@hostname")).toBe(false);
    expect(isValidHost("http://example.com")).toBe(false);
    expect(isValidHost("example..com")).toBe(false);
    expect(isValidHost("example.com/")).toBe(false);
  });
});

describe("isValidPort", () => {
  it("should return true for valid port numbers", () => {
    expect(isValidPort(80)).toBe(true);
    expect(isValidPort(443)).toBe(true);
    expect(isValidPort(8080)).toBe(true);
    expect(isValidPort(65535)).toBe(true);
  });

  it("should return false for invalid port numbers", () => {
    expect(isValidPort(0)).toBe(false);
    expect(isValidPort(-1)).toBe(false);
    expect(isValidPort(65536)).toBe(false);
    expect(isValidPort(3.14)).toBe(false);
  });

  it("should return false for non-numeric values", () => {
    expect(isValidPort("80" as any)).toBe(false);
    expect(isValidPort(null as any)).toBe(false);
    expect(isValidPort(undefined as any)).toBe(false);
    expect(isValidPort({} as any)).toBe(false);
  });
});

describe("isValidScanRate", () => {
  it("should return true for valid scan rates", () => {
    expect(isValidScanRate(1)).toBe(true);
    expect(isValidScanRate(100)).toBe(true);
    expect(isValidScanRate(1000)).toBe(true);
    expect(isValidScanRate(Number.MAX_SAFE_INTEGER)).toBe(true);
  });

  it("should return false for invalid scan rates", () => {
    expect(isValidScanRate(0)).toBe(false);
    expect(isValidScanRate(-1)).toBe(false);
    expect(isValidScanRate(3.14)).toBe(false);
  });

  it("should return false for non-numeric values", () => {
    expect(isValidScanRate("100" as any)).toBe(false);
    expect(isValidScanRate(null as any)).toBe(false);
    expect(isValidScanRate(undefined as any)).toBe(false);
    expect(isValidScanRate({} as any)).toBe(false);
  });
});

describe("validate", () => {
  it("should throw an error for invalid host", () => {
    expect(validate(null, null, () => false, "MANTLE_HOST")).toEqual(null);
  });
  it("should return default value for invalid host", () => {
    using infoStub = stub(console, "info");
    expect(validate("invalid", "hostname", () => false, "MANTLE_HOST")).toEqual(
      "hostname",
    );
    assertSpyCalls(infoStub, 1);
  });
  it("should return the input if it is valid", () => {
    expect(validate("valid", "hostname", () => true, "MANTLE_HOST")).toEqual(
      "valid",
    );
  });
});

describe("makeNumberOrUndefined", () => {
  it("should return undefined for null", () => {
    expect(makeNumberOrUndefined(null as any)).toEqual(undefined);
  });
  it("should return undefined for undefined", () => {
    expect(makeNumberOrUndefined(undefined)).toEqual(undefined);
  });
  it("should return a number for a valid number", () => {
    expect(makeNumberOrUndefined("123")).toEqual(123);
  });
});
