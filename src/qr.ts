/**
 * The QR film, the start list and the clock code, for moving data between devices with a
 * camera (e.g. from CompetitionFreak to the start clock). A separate entry point, so that apps which
 * only read course files do not carry it.
 */
export {
  CLOCK_CODE_PREFIX,
  ClockSampler,
  readClockCode,
  writeClockCode,
  type ClockOffset,
} from "./clock-code.js";
export {
  encodeFrames,
  FRAME_DATA_SIZE,
  FRAME_PREFIX,
  FrameCollector,
  type FrameProgress,
} from "./qr-film.js";
export {
  readStartList,
  START_LIST_FORMAT,
  START_LIST_VERSION,
  writeStartList,
  type StartList,
  type StartListRunner,
} from "./start-list.js";
