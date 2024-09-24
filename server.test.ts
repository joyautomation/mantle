import { assertSpyCalls, stub } from "@std/testing/mock";
import { runServer } from "./server.ts";
import type { Args } from "@std/cli";
import { describe, it } from "@std/testing/bdd";
import { _internal } from "./server.ts";
import type postgres from "postgres";
import type { Db } from "./db/db.ts";
import type { SparkplugHost } from "@joyautomation/synapse";
import { EventEmitter } from "node:events";

describe("server", () => {
  it("should run server", async () => {
    using _infoStub = stub(console, "info");
    const servStub = stub(Deno, "serve");
    const getDbStub = stub(_internal, "getDb", () =>
      Promise.resolve({
        db: {} as Db,
        connection: {} as ReturnType<typeof postgres>,
      }));
    const getHostStub = stub(
      _internal,
      "getHost",
      () => {
        console.log("getHostStub");
        return { events: new EventEmitter() } as SparkplugHost;
      },
    );
    await runServer({} as Args);
    assertSpyCalls(getHostStub, 1);
    assertSpyCalls(getDbStub, 1);
    assertSpyCalls(servStub, 1);
  });
});
