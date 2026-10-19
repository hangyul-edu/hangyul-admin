/**
 * Server errors reach operators in Korean: the server's English `detail` is
 * never shown, the problem's `details.reason` beats its `code`, the portal's
 * own catalog beats the member one, and a code neither catalog knows falls
 * back to the status's message.
 */
import { describe, expect, it } from "vitest";
import { ApiError, NetworkError, errorMessage } from "../lib/http";
import { apiErrorText } from "./apiErrors";
import { apiErrorsKo } from "./locales/apiErrors.ko";

const wrongCode = new ApiError(422, "phone_verification_failed", "Verification code is incorrect.", {
  reason: "code_incorrect",
});

describe("errorMessage", () => {
  it("words errors for operators in Korean, never the server's English", () => {
    const notEmpty = new ApiError(409, "conflict", "Course still has 2 series and 5 lecture(s); delete or move them first.", {
      reason: "course_not_empty",
      series: 2,
      lectures: 5,
    });
    expect(errorMessage(notEmpty)).toBe("과정에 시리즈 2개와 강의 5개가 남아 있어요. 먼저 삭제하거나 옮겨 주세요.");
  });

  it("falls back to the Korean member wording for errors members meet too", () => {
    expect(errorMessage(wrongCode)).toBe("인증번호가 맞지 않아요.");
    expect(errorMessage(new ApiError(404, "not_found", "Lecture 'x' not found."))).toBe("요청한 정보를 찾을 수 없어요.");
  });

  it("uses the code's sentence when the reason has none", () => {
    const unknownReason = new ApiError(422, "phone_verification_failed", "x", { reason: "something_new" });
    expect(errorMessage(unknownReason)).toBe(apiErrorsKo.codes.phone_verification_failed);
  });

  it("never shows an unfilled slot: a reason missing its numbers falls back to the code", () => {
    const e = new ApiError(429, "rate_limited", "Please wait.", { reason: "resend_cooldown" });
    expect(errorMessage(e)).toBe(apiErrorsKo.codes.rate_limited);
  });

  it("keeps the provider's own explanation where an operator needs it", () => {
    const e = new ApiError(502, "llm.auth_failed", "OpenAI가 API 키를 거부했습니다. 키를 확인하세요.", {
      problem: "OpenAI가 API 키를 거부했습니다. 키를 확인하세요.",
    });
    expect(errorMessage(e)).toBe("AI 제공사가 요청을 거부했어요: OpenAI가 API 키를 거부했습니다. 키를 확인하세요.");
    // Without the explanation, the member's general sentence.
    expect(errorMessage(new ApiError(502, "llm.auth_failed", "x"))).toBe(apiErrorsKo.codes["llm.auth_failed"]);
  });

  it("joins a list into the sentence", () => {
    const e = new ApiError(422, "settings.required_missing", "켜기 전에 필수 항목을 입력하세요.", {
      missing: ["Account ID", "API 토큰"],
    });
    expect(errorMessage(e)).toBe("켜기 전에 필수 항목을 입력해 주세요: Account ID, API 토큰");
    // An empty list leaves the slot unfilled: the code has no other sentence, so the status's.
    expect(errorMessage(new ApiError(422, "settings.required_missing", "x", { missing: [] }))).toBe(
      "요청을 처리하지 못했어요.",
    );
  });

  it("gives an unknown code the message for its status", () => {
    expect(errorMessage(new ApiError(404, "brand_new_code", "No such thing."))).toBe("요청한 정보를 찾을 수 없어요.");
    expect(errorMessage(new ApiError(503, "brand_new_code", "Down."))).toBe(
      "일시적인 서버 오류예요. 잠시 후 다시 시도해 주세요.",
    );
    expect(errorMessage(new ApiError(400, "brand_new_code", "Bad."))).toBe("요청을 처리하지 못했어요.");
  });

  it("words a lost connection, and passes other display text through", () => {
    expect(errorMessage(new NetworkError())).toBe("네트워크에 연결할 수 없어요. 인터넷 연결을 확인해 주세요.");
    expect(errorMessage(new Error("파일이 너무 커요."))).toBe("파일이 너무 커요.");
    expect(errorMessage(undefined)).toBe("알 수 없는 오류가 발생했어요.");
  });
});

describe("apiErrorText", () => {
  it("looks up a dotted code as a whole", () => {
    expect(apiErrorText({ code: "auth.social_token_invalid" })).toBe(apiErrorsKo.codes["auth.social_token_invalid"]);
  });
});
