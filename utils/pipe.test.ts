import { describe, test } from "@std/testing/bdd";
import { expect } from "@std/expect";
import { pipe } from "./pipe.ts";

describe("pipe", () => {
  // Test case for a single function
  test("should work with a single function", () => {
    const addOne = (x: number) => x + 1;
    const result = pipe(5, addOne);
    expect(result).toBe(6);
  });

  // Test case for multiple functions
  test("should work with multiple functions", () => {
    const addOne = (x: number) => x + 1;
    const double = (x: number) => x * 2;
    const square = (x: number) => x * x;
    const result = pipe(3, addOne, double, square);
    expect(result).toBe(64); // ((3 + 1) * 2)^2 = 64
  });

  // Test case for functions with different input/output types
  test("should work with functions of different types", () => {
    const toString = (x: number) => x.toString();
    const addExclamation = (s: string) => s + "!";
    const result = pipe(42, toString, addExclamation);
    expect(result).toBe("42!");
  });

  // Test case for an empty array of functions
  test("should return the initial value when no functions are provided", () => {
    const result = pipe(10);
    expect(result).toBe(10);
  });

  // Test case for functions that return undefined
  test("should handle functions that return undefined", () => {
    const returnUndefined = () => undefined;
    const addOne = (x: number | undefined) => x === undefined ? 0 : x + 1;
    const result = pipe(5, returnUndefined, addOne);
    expect(result).toBe(0);
  });
});
