import type {
  OperatorRequestRecord,
  SubmitOperatorRequestInput,
} from "../../../contracts/src";
import type { ControlPlaneStore } from "../../../adapters/src/store/control-plane-store";
import { ControlPlaneError } from "../../../shared/src/control-plane-error";

export class SubmitOperatorRequestService {
  constructor(
    private readonly store: ControlPlaneStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: SubmitOperatorRequestInput): Promise<OperatorRequestRecord> {
    if (!input.requestId || !input.actorId || !input.queue || !input.title || !input.prompt) {
      throw new ControlPlaneError(400, "invalid_operator_request");
    }

    const now = this.now().toISOString();
    const record: OperatorRequestRecord = {
      requestId: input.requestId,
      actorId: input.actorId,
      source: input.source ?? "console",
      queue: input.queue,
      locale: input.locale ?? "ko",
      title: input.title,
      prompt: input.prompt,
      missionId: input.missionId,
      relatedCommandId: input.relatedCommandId,
      targetUrl: input.targetUrl,
      selector: input.selector,
      expectedText: input.expectedText,
      status: "received",
      createdAt: now,
      updatedAt: now,
    };

    await this.store.putOperatorRequest(record);
    return record;
  }
}
