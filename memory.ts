import type { getBuilder } from "@joyautomation/conch";

export enum MemoryUsageUnits {
  BYTES,
  KB,
  MB,
  GB,
}

export type MemoryUsage = {
  rss: number;
  heapTotal: number;
  heapUsed: number;
  external: number;
};

export function convertBytesToUnits(
  bytes: number,
  units?: MemoryUsageUnits | null
) {
  switch (units) {
    case MemoryUsageUnits.KB:
      return bytes / 1024;
    case MemoryUsageUnits.MB:
      return bytes / (1024 * 1024);
    case MemoryUsageUnits.GB:
      return bytes / (1024 * 1024 * 1024);
    default:
      return bytes;
  }
}

export const convertDenoMemoryUsage = (
  memoryUsage: MemoryUsage,
  units?: MemoryUsageUnits | null
) => ({
  rss: convertBytesToUnits(memoryUsage.rss, units),
  heapTotal: convertBytesToUnits(memoryUsage.heapTotal, units),
  heapUsed: convertBytesToUnits(memoryUsage.heapUsed, units),
  external: convertBytesToUnits(memoryUsage.external, units),
});

export function addMemoryUsageToSchema(builder: ReturnType<typeof getBuilder>) {
  const MemoryUsageRef =
    builder.objectRef<ReturnType<typeof Deno.memoryUsage>>("MemoryUsage");
  const MemoryUsageUnitsRef = builder.enumType(MemoryUsageUnits, {
    name: "MemoryUsageUnits",
  });
  MemoryUsageRef.implement({
    fields: (t) => ({
      rss: t.expose("rss", {
        type: "Float",
      }),
      heapTotal: t.expose("heapTotal", {
        type: "Float",
      }),
      heapUsed: t.expose("heapUsed", {
        type: "Float",
      }),
      external: t.expose("external", {
        type: "Float",
      }),
    }),
  });
  builder.queryField("memoryUsage", (t) =>
    t.field({
      args: {
        units: t.arg({ type: MemoryUsageUnitsRef }),
      },
      type: MemoryUsageRef,
      resolve: (_root, args) =>
        convertDenoMemoryUsage(Deno.memoryUsage(), args.units),
    })
  );
}
