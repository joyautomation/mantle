import { createLogger, LogLevel } from "@joyautomation/coral";
import { logs as synapse } from "@joyautomation/synapse";

export const log = createLogger("mantle", LogLevel.info);

export const logs = {
  synapse,
  mantle: {
    main: log,
  },
};
