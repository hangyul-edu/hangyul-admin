import { describe, expect, it } from "vitest";
import { providerLabel, signInMethods } from "./signInMethods";

describe("signInMethods", () => {
  it("lists email first, then the social sign-ins by name in a fixed order", () => {
    expect(signInMethods(true, ["line", "google", "kakao"])).toEqual(["이메일", "Google", "카카오", "LINE"]);
    expect(signInMethods(false, ["apple", "facebook", "apple"])).toEqual(["Apple", "Facebook"]);
    expect(signInMethods(false, [])).toEqual([]);
  });

  it("shows an unknown provider as sent", () => {
    expect(providerLabel("naver")).toBe("naver");
    expect(signInMethods(false, ["naver", "google"])).toEqual(["Google", "naver"]);
  });
});
