import { describe, expect, it } from "vitest";
import { PAYMENT_FAILURE_LABEL, TUTOR_FAILURE_LABEL, codeLabel } from "./codeLabels";

describe("codeLabel", () => {
  it("names a known code in Korean", () => {
    expect(codeLabel(PAYMENT_FAILURE_LABEL, "insufficient_funds")).toBe("잔액 부족");
    expect(codeLabel(TUTOR_FAILURE_LABEL, "model_timeout")).toBe("AI 응답 시간 초과");
  });

  it("shows a code the portal does not know yet as written, and none as a dash", () => {
    // A value added on the server must stay visible rather than vanish.
    expect(codeLabel(PAYMENT_FAILURE_LABEL, "new_failure_kind")).toBe("new_failure_kind");
    expect(codeLabel(PAYMENT_FAILURE_LABEL, null)).toBe("—");
    expect(codeLabel(PAYMENT_FAILURE_LABEL, "")).toBe("—");
  });
});
