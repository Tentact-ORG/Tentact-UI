import type { Prospect } from "./prospect.types";
import { SAMPLE_PROSPECTS } from "./sample-prospects";

/**
 * Where the dashboard reads prospects from. The sample repository is the only
 * implementation today; a workspace's real data source plugs in here.
 */
export interface ProspectRepository {
  /** Shown in the UI so visitors always know what they are looking at. */
  readonly label: string;
  readonly isSample: boolean;
  all(): readonly Prospect[];
}

export const sampleProspectRepository: ProspectRepository = {
  label: "Sample workspace data",
  isSample: true,
  all: () => SAMPLE_PROSPECTS,
};
