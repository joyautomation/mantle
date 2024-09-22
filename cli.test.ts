import { describe, it } from "@std/testing/bdd";
import { assertSpyCallArgs, assertSpyCalls, stub } from "@std/testing/mock";
import { main } from "./cli.ts";
import { _internal } from "./cli.ts";

describe("cli", () => {
  it("should print version", () => {
    const version = JSON.parse(Deno.readTextFileSync("./deno.json")).version;
    using logStub = stub(console, "log");
    using denoExitStub = stub(Deno, "exit");
    using _argsStub = stub(
      _internal,
      "parseArguments",
      () => ({ _: [], version: true }),
    );
    main();
    assertSpyCalls(logStub, 1);
    assertSpyCallArgs(logStub, 0, [`mantle v${version}`]);
    assertSpyCalls(denoExitStub, 1);
  });
  it("should print help", () => {
    using denoExitStub = stub(Deno, "exit");
    using _argsStub = stub(
      _internal,
      "parseArguments",
      () => ({ _: [], help: true }),
    );
    using logStub = stub(console, "log");
    main();
    assertSpyCalls(logStub, 1);
    assertSpyCalls(denoExitStub, 1);
  });
});
