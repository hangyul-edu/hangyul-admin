import type { FieldDoc } from "../../components/BulkImportButton";

/** The example file the bulk-import dialog offers for download. */
export const BATCH_TEMPLATE = JSON.stringify(
  [
    {
      answer_format: "single_choice",
      material_kind: "text",
      topik_section: "reading",
      topik_question_type: "reading_01",
      prompt: "빈칸에 들어갈 말로 가장 알맞은 것을 고르십시오.",
      content_html: "<p>주말에 친구를 (      ).</p>",
      level: 1,
      choices: [
        { key: "1", text: "만납니다" },
        { key: "2", text: "먹습니다" },
        { key: "3", text: "읽습니다" },
        { key: "4", text: "봅니다" },
      ],
      correct_choice: "1",
      explanation: "사람을 만나다: '친구를 만납니다'가 자연스럽습니다.",
    },
    {
      answer_format: "short_answer",
      topik_section: "writing",
      topik_question_type: "writing_51_52",
      prompt: "빈칸 ㄱ에 알맞은 말을 쓰십시오.",
      content_html: "<p>내일 시간이 ( ㄱ ) 같이 영화를 봅시다.</p>",
      level: 3,
      blanks: [{ label: "ㄱ", answer: "있으면" }],
    },
  ],
  null,
  2,
);

/** The upload format, for the import dialog's field reference. */
export const QUIZ_FIELDS: FieldDoc[] = [
  { name: "answer_format", need: "필수", meaning: "답 형식: single_choice(객관식) · short_answer(단답형) · free_response(서술형)", example: "single_choice" },
  { name: "prompt", need: "필수", meaning: "지시문 (문제 위에 나오는 안내)", example: "빈칸에 들어갈 말로 가장 알맞은 것을 고르십시오." },
  { name: "level", need: "필수", meaning: "TOPIK 급수 1–6", example: "2" },
  { name: "content_html", need: "선택", meaning: "지문·본문 (HTML)", example: "<p>주말에 친구를 (   ).</p>" },
  { name: "choices", need: "객관식 필수", meaning: "보기 2개 이상: key(번호)와 text(내용)", example: '[{"key":"1","text":"만납니다"}]' },
  { name: "correct_choice", need: "객관식 필수", meaning: "정답 보기의 key", example: "1" },
  { name: "blanks", need: "단답형 필수", meaning: "빈칸: label(ㄱ·ㄴ 등)과 answer(정답)", example: '[{"label":"ㄱ","answer":"있으면"}]' },
  { name: "answer_max_length", need: "서술형 필수", meaning: "답안 최대 글자 수", example: "300" },
  { name: "scoring_criteria", need: "채점형 필수", meaning: "채점 기준 목록 (서술형·정답 없는 빈칸)", example: '["주제에 맞게 썼는가"]' },
  { name: "max_score", need: "채점형 필수", meaning: "만점", example: "10" },
  { name: "topik_section", need: "선택", meaning: "영역: listening · reading · writing", example: "reading" },
  { name: "topik_question_type", need: "선택", meaning: "문제 유형 (영역과 맞아야 함)", example: "reading_01" },
  { name: "material_kind", need: "선택", meaning: "자료 종류: text(기본) · table · audio · image", example: "text" },
  { name: "image_url", need: "그림 자료 필수", meaning: "그림 주소", example: "https://…/q1.png" },
  { name: "audio_duration_ms", need: "선택", meaning: "듣기 길이 (밀리초). 듣기 파일은 추가한 뒤 문제에서 올려요", example: "12000" },
  { name: "explanation", need: "선택", meaning: "해설", example: "'친구를 만납니다'가 자연스럽습니다." },
  { name: "hint", need: "선택", meaning: "힌트", example: "—" },
  { name: "prompt_translation", need: "선택", meaning: "지시문 번역", example: "Choose the best answer." },
];
