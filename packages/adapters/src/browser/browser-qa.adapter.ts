import type { CommandRecord } from "../../../contracts/src";
import { ControlPlaneError } from "../../../shared/src/control-plane-error";

export interface BrowserQaResult {
  url: string;
  statusCode: number;
  matchedText: boolean;
  selector?: string;
  summary: string;
  checkedAt: string;
}

export class BrowserQaAdapter {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async execute(command: CommandRecord): Promise<BrowserQaResult> {
    const url = typeof command.payload.url === "string" ? command.payload.url : "";
    if (!url) {
      throw new ControlPlaneError(400, "browser_check_url_required");
    }

    const response = await this.fetchImpl(url, {
      method: "GET",
      headers: {
        "user-agent": "control-plane-browser-check/1.0",
      },
    });
    const body = await response.text();
    const expectedText = typeof command.payload.expectedText === "string" ? command.payload.expectedText : undefined;
    const matchedText = expectedText ? body.includes(expectedText) : response.ok;
    const selector = typeof command.payload.selector === "string" ? command.payload.selector : undefined;
    const checkedAt = new Date().toISOString();

    if (!response.ok || !matchedText) {
      throw new ControlPlaneError(409, "browser_check_failed", {
        url,
        statusCode: response.status,
        expectedText,
      });
    }

    return {
      url,
      statusCode: response.status,
      matchedText,
      selector,
      summary: expectedText ? `Verified "${expectedText}" at ${url}` : `Verified ${url}`,
      checkedAt,
    };
  }
}
