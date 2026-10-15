import { useQuery } from "@tanstack/react-query";
import { adminApi } from "../api";

/** The query every topic list and label shares, so one fetch serves them all. */
export const SENTENCE_TOPICS_KEY = ["admin", "sentence-topics"] as const;

/**
 * Topics as names: the topics in use, and `topicName(code)` — the curriculum's
 * Korean name for any topic, or the code itself when it has none.
 */
export function useTopicNames() {
  const query = useQuery({ queryKey: SENTENCE_TOPICS_KEY, queryFn: adminApi.sentenceTopics });
  const labels = query.data?.labels;
  return {
    topics: query.data?.topics ?? [],
    topicName: (code: string) => labels?.[code] ?? code,
    /** Whether the curriculum names this topic (an unnamed one is new or misspelt). */
    isNamed: (code: string) => Boolean(labels?.[code]),
  };
}
