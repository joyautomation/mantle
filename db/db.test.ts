import { describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";
import { createConnectionString } from "./db.ts";
import { Args } from "@std/cli";

describe("getConnectionString", () => {
  it("should return the correct connection string", () => {
    const args: Args = {
      _: [],
      "db-host": "localhost",
      "db-port": "5432",
      "db-name": "testdb",
      "db-user": "user",
      "db-password": "password",
    };

    const expectedConnectionString =
      "postgres://user:password@localhost:5432/testdb";
    const result = createConnectionString(args);

    expect(result).toEqual(expectedConnectionString);
  });

  const requiredCredentials = [
    { key: "db-user", envKey: "MANTLE_DB_USER" },
    { key: "db-password", envKey: "MANTLE_DB_PASSWORD" },
    { key: "db-host", envKey: "MANTLE_DB_HOST" },
    { key: "db-name", envKey: "MANTLE_DB_NAME" },
  ];

  requiredCredentials.forEach(({ key, envKey }) => {
    it(`should throw an error if ${key} is not set`, () => {
      const args: Args = {
        _: [],
        "db-user": "user",
        "db-password": "password",
        "db-host": "localhost",
        "db-name": "testdb",
      };
      delete args[key as keyof typeof args];

      const originalEnv = Deno.env.get(envKey);
      try {
        Deno.env.delete(envKey);
        expect(() => createConnectionString(args)).toThrow(
          "Database credentials are not set",
        );
      } finally {
        if (originalEnv) {
          Deno.env.set(envKey, originalEnv);
        }
      }
    });
  });

  it("should use environment variables when args are not provided", () => {
    const originalEnv = Deno.env.toObject();
    try {
      Deno.env.set("MANTLE_DB_HOST", "envhost");
      Deno.env.set("MANTLE_DB_NAME", "envdb");
      Deno.env.set("MANTLE_DB_USER", "envuser");
      Deno.env.set("MANTLE_DB_PASSWORD", "envpass");

      const args: Args = { _: [] };
      const expectedConnectionString =
        "postgres://envuser:envpass@envhost:5432/envdb";
      const result = createConnectionString(args);

      expect(result).toEqual(expectedConnectionString);
    } finally {
      // Restore original environment
      for (const key in originalEnv) {
        Deno.env.set(key, originalEnv[key]);
      }
    }
  });

  it("should connect to the 'postgres' database when root is true", () => {
    const args: Args = { _: [], root: true };

    const result = createConnectionString(args, true);

    expect(result.endsWith("/postgres")).toBe(true);
  });
});
