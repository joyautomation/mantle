import SchemaBuilder from "@pothos/core";
import { DateTimeResolver } from "graphql-scalars";

export type Builder = ReturnType<typeof getBuilder>;

export function getBuilder() {
  const builder = new SchemaBuilder<{
    Scalars: {
      Date: {
        Input: Date;
        Output: Date;
      };
    };
  }>({});
  builder.addScalarType("Date", DateTimeResolver, {});
  initialize(builder);
  return builder;
}

export function initialize(
  builder: Builder,
) {
  builder.queryType({
    fields: (t) => ({
      info: t.string({
        resolve: () => `Mantle Sparkplug B Data Aggregator.`,
      }),
    }),
  });

  builder.subscriptionType({});
}
