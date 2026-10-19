import type { AdminNotice, NoticeTranslation } from "../../api";

/** The editor's working copy: Korean and English, pinning and publishing. */
export interface NoticeDraft {
  ko_title: string;
  ko_body: string;
  en_title: string;
  en_body: string;
  pinned: boolean;
  published: boolean;
}

export function emptyNoticeDraft(): NoticeDraft {
  return { ko_title: "", ko_body: "", en_title: "", en_body: "", pinned: false, published: false };
}

function pick(notice: AdminNotice, locale: string): NoticeTranslation | undefined {
  return notice.translations.find((t) => t.locale === locale);
}

/** The notice's title as the list names it: Korean first, else any. */
export function noticeTitle(notice: AdminNotice): string | undefined {
  return (pick(notice, "ko") ?? notice.translations[0])?.title;
}

export function draftFromNotice(n: AdminNotice): NoticeDraft {
  const ko = pick(n, "ko");
  const en = pick(n, "en");
  return {
    ko_title: ko?.title ?? "",
    ko_body: ko?.body ?? "",
    en_title: en?.title ?? "",
    en_body: en?.body ?? "",
    pinned: n.pinned,
    published: n.published,
  };
}

/**
 * The languages the draft actually authors, trimmed.
 *
 * A language counts only when BOTH its title and body pass the API's 2-char
 * minimum: a half-filled language would be rejected by the server and fail
 * the whole save, so it is treated as not authored instead.
 */
export function draftTranslations(d: NoticeDraft): NoticeTranslation[] {
  const pairs: [string, string, string][] = [
    ["ko", d.ko_title, d.ko_body],
    ["en", d.en_title, d.en_body],
  ];
  return pairs
    .map(([locale, title, body]) => ({ locale, title: title.trim(), body: body.trim() }))
    .filter((t) => t.title.length >= 2 && t.body.length >= 2);
}
