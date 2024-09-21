import { describe, it } from "@std/testing/bdd";
import { assertSpyCalls, stub } from "@std/testing/mock";
import { main } from "./cli.ts";
import { _internal } from "./cli.ts";

describe("cli", () => {
  it("should print version", () => {
    using logStub = stub(console, "log");
    using denoExitStub = stub(Deno, "exit");
    using _argsStub = stub(
      _internal,
      "parseArguments",
      () => ({ _: [], version: true }),
    );
    main();
    assertSpyCalls(logStub, 1);
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
