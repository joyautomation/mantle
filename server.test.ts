import { assertSpyCalls, stub } from "@std/testing/mock";
import { runServer } from "./server.ts";
import type { Args } from "@std/cli";
import { describe, it } from "@std/testing/bdd";
import { _internal } from "./server.ts";
import type { Client, Pool } from "pg";
import type { Db } from "./db/db.ts";
import type { SparkplugHost } from "@joyautomation/synapse";
import { EventEmitter } from "node:events";
import { getBuilder } from "@joyautomation/conch";
import { NodePgDatabase } from "drizzle-orm/node-postgres";

describe("server", () => {
  const builder = getBuilder("This is mantle.", false, true);
  it("should run server", async () => {
    using _infoStub = stub(console, "info");
    const servStub = stub(Deno, "serve");
    const getDbStub = stub(_internal, "getDb", () => ({
      db: {} as NodePgDatabase<Record<string, never>>,
      connection: {} as Pool,
    }));
    const getHostStub = stub(
      _internal,
      "getHost",
      () => {
        return { events: new EventEmitter() } as SparkplugHost;
      },
    );
    await runServer(
      "mantle",
      "this is mantle",
      {} as Args,
      false,
      true,
    );
    assertSpyCalls(getHostStub, 1);
    assertSpyCalls(getDbStub, 1);
    assertSpyCalls(servStub, 1);
  });
});
