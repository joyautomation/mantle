import { describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";
import { getValueType } from "./history.ts";
import type { SparkplugMetric, SparkplugTopic } from "@joyautomation/neuron";
import { calcTimestamp } from "./history.ts";
import Long from "long";
import { getUnixTime } from "npm:date-fns@^3.6.0/getUnixTime";
import { recordValues } from "./history.ts";
import { assertSpyCalls, spy, stub } from "@std/testing/mock";
import { getDb } from "./db/db.ts";
import type { TypeStr } from "sparkplug-payload/lib/sparkplugbpayload.js";
import { parseArguments } from "./cli.ts";

describe("getValueType", () => {
  function makeMetric(type: string) {
    return { type, value: 0 } as SparkplugMetric;
  }
  const tests = [{
    tests: [
      "Int8",
      "Int16",
      "Int32",
      "Int64",
      "UInt8",
      "UInt16",
      "UInt32",
      "UInt64",
    ],
    expected: "intValue",
  }, {
    tests: ["Float", "Double"],
    expected: "floatValue",
  }, {
    tests: ["Boolean"],
    expected: "boolValue",
  }, {
    tests: ["String", "DateTime", "Text"],
    expected: "stringValue",
  }];
  tests.forEach(({ tests, expected }) => {
    it(`should return '${expected}' for ${expected.replace("Value", "")} types`, () => {
      tests.forEach((type) => {
        expect(getValueType(makeMetric(type))).toBe(expected);
      });
    });
    it(`should be case-insensitive for ${expected.replace("Value", "")} types`, () => {
      tests.forEach((type) => {
        expect(getValueType(makeMetric(type.toUpperCase()))).toBe(expected);
        expect(getValueType(makeMetric(type.toLowerCase()))).toBe(expected);
      });
    });
  });
});

describe("calcTimestamp", () => {
  const tests = [
    {
      description: `should return null for null, undefined, or 0`,
      cases: [
        undefined,
        null,
        0,
      ],
      expected: null,
    },
    {
      description:
        `should return the right date for unix timestamps (Long or number)`,
      cases: [
        Long.fromNumber(getUnixTime(new Date("2024-01-01T00:00:00.000Z"))),
        getUnixTime(new Date("2024-01-01T00:00:00.000Z")),
      ],
      expected: new Date("2024-01-01T00:00:00.000Z"),
    },
  ];
  tests.forEach(({ description, cases, expected }) => {
    it(description, () => {
      cases.forEach((test) => {
        expect(calcTimestamp(test)).toEqual(expected);
      });
    });
  });
});

const mockArgs = parseArguments([
  "-D",
  "test",
  "-U",
  "test",
  "-P",
  "test",
  "-N",
  "test",
]);
const db = await getDb(mockArgs);
describe("recordValues", () => {
  const insertStub = stub(db, "insert", () => ({
    values: () => spy(),
  } as unknown as ReturnType<typeof db.insert>));
  it("should record values", () => {
    using _debugStub = stub(console, "debug");
    const topic = {
      groupId: "test",
      edgeNode: "test",
      deviceId: "test",
    } as SparkplugTopic;
    const message = {
      timestamp: 1,
      metrics: [
        {
          timestamp: 1,
          name: "test",
          type: "Int32" as TypeStr,
          value: 1,
        },
      ],
    };
    recordValues(db, topic, message);
    assertSpyCalls(insertStub, 1);
  });
});
