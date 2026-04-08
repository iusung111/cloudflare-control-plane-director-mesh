import type { YoloMode } from "../../../contracts/src";
import type { ControlPlaneStore } from "../../../adapters/src/store/control-plane-store";

export class YoloModeService {
  constructor(
    private readonly store: ControlPlaneStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  get(): Promise<YoloMode> {
    return this.store.getYoloMode();
  }

  async set(input: { enabled: boolean; updatedBy: string; note?: string }): Promise<YoloMode> {
    const mode: YoloMode = {
      enabled: input.enabled,
      updatedAt: this.now().toISOString(),
      updatedBy: input.updatedBy,
      note: input.note,
    };

    await this.store.setYoloMode(mode);
    return mode;
  }
}
