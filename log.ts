import { createLogger, LogLevel, setLogLevel } from "@joyautomation/coral";
import { logs as synapse } from "@joyautomation/synapse";

export const log = createLogger("mantle", LogLevel.info);

setLogLevel(synapse.main, LogLevel.debug);

export const logs = {
  synapse,
  mantle: {
    main: log,
  },
};
