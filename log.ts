import { createLogger, LogLevel } from "@joyautomation/coral";
import { logs as synapse } from "@joyautomation/synapse";

function validateLogLevel(logLevel?: string): LogLevel {
  switch (logLevel) {
    case "debug":
      return LogLevel.debug;
    case "info":
      return LogLevel.info;
    case "warn":
      return LogLevel.warn;
    case "error":
      return LogLevel.error;
    default:
      return LogLevel.info;
  }
}

export const log = createLogger("mantle", validateLogLevel(Deno.env.get("MANTLE_LOG_LEVEL")))

export const logs = {
  synapse,
  mantle: {
    main: log,
  },
};
