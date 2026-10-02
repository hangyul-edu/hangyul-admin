/**
 * The portal's one rule for naming a person.
 *
 * The name leads everywhere; the email is the proof shown beside it where an
 * action is worth being sure about. Both helpers accept whatever a caller
 * happens to hold, so the interesting cases are the incomplete records — an
 * account with no name must still identify somebody.
 */
import { describe, expect, it } from "vitest";
import { personName, personNameWithEmail } from "./adminIdentity";

const full = { name: "이재명", email: "jm@talkhangyul.co.kr", user_id: "usr_1" };

describe("personName — the compact label", () => {
  it("uses the name", () => {
    expect(personName(full)).toBe("이재명");
  });

  it("falls back to the email when there is no name", () => {
    expect(personName({ name: null, email: "jm@talkhangyul.co.kr" })).toBe("jm@talkhangyul.co.kr");
  });

  it("never shows the id when there is neither", () => {
    expect(personName({ name: null, email: null, user_id: "usr_1" })).toBe("(이름 없는 계정)");
  });

  it("never renders an empty label", () => {
    expect(personName({})).toBe("—");
    expect(personName(null)).toBe("—");
    expect(personName(undefined)).toBe("—");
  });

  it("treats blank strings as missing", () => {
    // A name of spaces would otherwise render as an invisible label.
    expect(personName({ name: "   ", email: "jm@talkhangyul.co.kr" })).toBe("jm@talkhangyul.co.kr");
  });

  it("does not promote the nickname over the name", () => {
    const withNickname = { ...full, nickname: "jaemyung" } as never;
    expect(personName(withNickname)).toBe("이재명");
  });
});

describe("personNameWithEmail — the label plus its proof", () => {
  it("reads Name (email)", () => {
    expect(personNameWithEmail(full)).toBe("이재명 (jm@talkhangyul.co.kr)");
  });

  it("does not repeat the email when that is all there is", () => {
    expect(personNameWithEmail({ name: null, email: "jm@talkhangyul.co.kr" })).toBe(
      "jm@talkhangyul.co.kr",
    );
  });

  it("omits the parenthetical when there is no email", () => {
    expect(personNameWithEmail({ name: "이재명", email: null })).toBe("이재명");
  });

  it("never renders an empty label", () => {
    expect(personNameWithEmail({})).toBe("—");
    expect(personNameWithEmail(null)).toBe("—");
  });

  it("agrees with personName on which identifier leads", () => {
    for (const person of [full, { name: null, email: "a@b.co" }, { user_id: "usr_9" }]) {
      expect(personNameWithEmail(person).startsWith(personName(person))).toBe(true);
    }
  });
});
