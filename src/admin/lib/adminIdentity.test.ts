/**
 * The portal's one rule for naming a person.
 *
 * The name leads everywhere; the email is the proof shown beside it where an
 * action is worth being sure about. Both helpers accept whatever a caller
 * happens to hold, so the interesting cases are the incomplete records — an
 * account with no name must still identify somebody.
 */
import { describe, expect, it } from "vitest";
import { adminName, adminNameWithEmail } from "./adminIdentity";

const full = { name: "이재명", email: "jm@talkhangyul.co.kr", user_id: "usr_1" };

describe("adminName — the compact label", () => {
  it("uses the name", () => {
    expect(adminName(full)).toBe("이재명");
  });

  it("falls back to the email when there is no name", () => {
    expect(adminName({ name: null, email: "jm@talkhangyul.co.kr" })).toBe("jm@talkhangyul.co.kr");
  });

  it("falls back to the id when there is neither", () => {
    expect(adminName({ name: null, email: null, user_id: "usr_1" })).toBe("usr_1");
  });

  it("never renders an empty label", () => {
    expect(adminName({})).toBe("—");
    expect(adminName(null)).toBe("—");
    expect(adminName(undefined)).toBe("—");
  });

  it("treats blank strings as missing", () => {
    // A name of spaces would otherwise render as an invisible label.
    expect(adminName({ name: "   ", email: "jm@talkhangyul.co.kr" })).toBe("jm@talkhangyul.co.kr");
  });

  it("does not promote the nickname over the name", () => {
    const withNickname = { ...full, nickname: "jaemyung" } as never;
    expect(adminName(withNickname)).toBe("이재명");
  });
});

describe("adminNameWithEmail — the label plus its proof", () => {
  it("reads Name (email)", () => {
    expect(adminNameWithEmail(full)).toBe("이재명 (jm@talkhangyul.co.kr)");
  });

  it("does not repeat the email when that is all there is", () => {
    expect(adminNameWithEmail({ name: null, email: "jm@talkhangyul.co.kr" })).toBe(
      "jm@talkhangyul.co.kr",
    );
  });

  it("omits the parenthetical when there is no email", () => {
    expect(adminNameWithEmail({ name: "이재명", email: null })).toBe("이재명");
  });

  it("never renders an empty label", () => {
    expect(adminNameWithEmail({})).toBe("—");
    expect(adminNameWithEmail(null)).toBe("—");
  });

  it("agrees with adminName on which identifier leads", () => {
    for (const person of [full, { name: null, email: "a@b.co" }, { user_id: "usr_9" }]) {
      expect(adminNameWithEmail(person).startsWith(adminName(person))).toBe(true);
    }
  });
});
