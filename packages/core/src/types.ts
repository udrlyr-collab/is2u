export const DATE_STATUSES = ["scheduled", "active", "completed", "cancelled"] as const;
export type DateStatus = (typeof DATE_STATUSES)[number];

export const MISSION_TYPES = ["audio", "photo", "video", "text", "emotion"] as const;
export type MissionType = (typeof MISSION_TYPES)[number];

export const MISSION_STATUSES = ["scheduled", "sent", "completed", "skipped", "expired", "cancelled"] as const;
export type MissionStatus = (typeof MISSION_STATUSES)[number];

export const MEMORY_TYPES = ["audio", "photo", "video", "text", "emotion", "manual_video"] as const;
export type MemoryType = (typeof MEMORY_TYPES)[number];

export const ASSET_ROLES = ["original", "preview", "thumbnail", "poster"] as const;
export type AssetRole = (typeof ASSET_ROLES)[number];

export const UPLOAD_STATUSES = ["created", "uploading", "uploaded", "aborted", "expired", "failed"] as const;
export type UploadStatus = (typeof UPLOAD_STATUSES)[number];

export const PROCESSING_STATUSES = ["pending", "processing", "ready", "failed"] as const;
export type ProcessingStatus = (typeof PROCESSING_STATUSES)[number];

export const FIXED_USERS = {
  seoyeong: {
    id: "8f35b489-0d7d-48ad-b45c-598b9a9f0560",
    displayName: "이서영",
    roleLabel: "여자친구",
  },
  seongmin: {
    id: "8b871773-c4e1-439e-9272-e7ed386ee32b",
    displayName: "홍성민",
    roleLabel: "남자친구",
  },
} as const;

export const EMOTION_CATEGORY_DEFINITIONS = [
  { id: "comfort", label: "편안함", color: "cream", icon: "⌁" },
  { id: "joy", label: "즐거움", color: "butter", icon: "✦" },
  { id: "flutter", label: "설렘", color: "strawberry", icon: "✣" },
  { id: "affection", label: "애정", color: "rose", icon: "♡" },
  { id: "stillness", label: "잔잔함", color: "sky", icon: "≈" },
  { id: "tired", label: "피곤함", color: "faded", icon: "—" },
  { id: "complicated", label: "복잡함", color: "mauve", icon: "◇" },
  { id: "special", label: "특별한 순간", color: "star", icon: "⋆" },
] as const;

export type EmotionCategoryId = (typeof EMOTION_CATEGORY_DEFINITIONS)[number]["id"];
export type EmotionColor = (typeof EMOTION_CATEGORY_DEFINITIONS)[number]["color"];

const emotionLabels: Record<EmotionCategoryId, readonly string[]> = {
  comfort: ["편안해요", "평화로워요", "안정돼요", "느긋해요", "포근해요", "나른해요"],
  joy: ["신나요", "재밌어요", "웃겨요", "들떠요", "장난치고 싶어요", "기분이 좋아요"],
  flutter: ["설레요", "두근거려요", "기대돼요", "수줍어요", "애틋해요", "사랑스러워요"],
  affection: ["고마워요", "다정해요", "보고 싶어요", "안아주고 싶어요", "소중해요", "함께 있고 싶어요"],
  stillness: ["조용해요", "멍해요", "생각이 많아요", "아늑해요", "차분해요", "감성적이에요"],
  tired: ["피곤해요", "졸려요", "지쳤어요", "쉬고 싶어요", "배고파요", "아무것도 하기 싫어요"],
  complicated: ["어색해요", "긴장돼요", "서운해요", "아쉬워요", "걱정돼요", "복잡해요"],
  special: ["행복해요", "벅차요", "기억하고 싶어요", "시간이 멈췄으면 좋겠어요", "오늘이 오래 남을 것 같아요", "지금이 참 좋아요"],
};

export type EmotionDefinition = {
  id: string;
  category: EmotionCategoryId;
  label: string;
  icon: string;
  color: EmotionColor;
  enabled: boolean;
};

export const EMOTIONS: readonly EmotionDefinition[] = EMOTION_CATEGORY_DEFINITIONS.flatMap((category) =>
  emotionLabels[category.id].map((label, index) => ({
    id: `${category.id}-${index + 1}`,
    category: category.id,
    label,
    icon: category.icon,
    color: category.color,
    enabled: true,
  })),
);

export type MissionInputMode = MissionType | "choice";
export type MissionTemplate = {
  id: string;
  type: MissionType;
  title: string;
  prompt: string;
  inputMode: MissionInputMode;
  durationSeconds: number | null;
  audience: "recipient" | "couple";
  enabled: boolean;
  weight: number;
  options?: readonly string[];
};

export const MISSION_TYPE_WEIGHTS: Record<MissionType, number> = {
  audio: 1,
  photo: 1.2,
  video: 0.65,
  text: 1.35,
  emotion: 1.1,
};

function template(template: MissionTemplate): MissionTemplate {
  return template;
}

export const MISSION_TEMPLATES: readonly MissionTemplate[] = [
  template({ id: "audio-now", type: "audio", title: "지금의 소리", prompt: "주변의 소리를 10초만 담아주세요.", inputMode: "audio", durationSeconds: 10, audience: "recipient", enabled: true, weight: 1 }),
  template({ id: "photo-now", type: "photo", title: "눈앞의 한 장면", prompt: "지금 눈앞에 있는 장면을 하나만 담아주세요.", inputMode: "photo", durationSeconds: null, audience: "recipient", enabled: true, weight: 1 }),
  template({ id: "video-now", type: "video", title: "잠깐의 움직임", prompt: "지금 이 시간을 짧은 영상으로 담아주세요.", inputMode: "video", durationSeconds: 5, audience: "recipient", enabled: true, weight: 0.7 }),
  template({ id: "text-one-line", type: "text", title: "한 문장", prompt: "방금 나눈 말 중 기억하고 싶은 한마디를 남겨주세요.", inputMode: "text", durationSeconds: null, audience: "recipient", enabled: true, weight: 1.2 }),
  template({ id: "emotion-now", type: "emotion", title: "지금의 마음", prompt: "지금 이 시간의 기분을 하나만 골라주세요.", inputMode: "emotion", durationSeconds: null, audience: "recipient", enabled: true, weight: 1.2 }),

  template({ id: "sense-sound", type: "audio", title: "귀에 담긴 순간", prompt: "지금 들리는 소리를 10초 남겨주세요.", inputMode: "audio", durationSeconds: 10, audience: "recipient", enabled: true, weight: 1 }),
  template({ id: "sense-color", type: "photo", title: "오늘의 색", prompt: "지금 보이는 색 하나를 찍어주세요.", inputMode: "photo", durationSeconds: null, audience: "recipient", enabled: true, weight: 1 }),
  template({ id: "sense-nearest", type: "photo", title: "가장 가까운 것", prompt: "지금 가장 가까이 있는 물건을 찍어주세요.", inputMode: "photo", durationSeconds: null, audience: "recipient", enabled: true, weight: 1 }),
  template({ id: "sense-favorite-scene", type: "photo", title: "마음에 든 장면", prompt: "지금 주변에서 가장 마음에 드는 장면을 찍어주세요.", inputMode: "photo", durationSeconds: null, audience: "recipient", enabled: true, weight: 1 }),
  template({ id: "sense-weather", type: "text", title: "지금의 날씨", prompt: "지금의 날씨를 한 단어로 남겨주세요.", inputMode: "text", durationSeconds: null, audience: "recipient", enabled: true, weight: 1 }),
  template({ id: "sense-smell", type: "text", title: "기억할 냄새", prompt: "지금 느껴지는 냄새를 한 문장으로 남겨주세요.", inputMode: "text", durationSeconds: null, audience: "recipient", enabled: true, weight: 1 }),

  template({ id: "partner-expression", type: "text", title: "마주 본 표정", prompt: "지금 상대방의 표정을 한 단어로 표현해주세요.", inputMode: "text", durationSeconds: null, audience: "couple", enabled: true, weight: 1 }),
  template({ id: "partner-words", type: "text", title: "방금 그 말", prompt: "상대방이 방금 한 말을 적어주세요.", inputMode: "text", durationSeconds: null, audience: "couple", enabled: true, weight: 1 }),
  template({ id: "partner-message", type: "text", title: "건네고 싶은 말", prompt: "지금 상대방에게 해주고 싶은 말을 남겨주세요.", inputMode: "text", durationSeconds: null, audience: "couple", enabled: true, weight: 1 }),
  template({ id: "partner-cute", type: "text", title: "오늘의 귀여움", prompt: "오늘 상대방의 귀여웠던 점 하나를 적어주세요.", inputMode: "text", durationSeconds: null, audience: "couple", enabled: true, weight: 1 }),
  template({ id: "partner-photo", type: "photo", title: "지금의 너", prompt: "지금 상대방의 모습을 한 장 남겨주세요.", inputMode: "photo", durationSeconds: null, audience: "couple", enabled: true, weight: 1 }),
  template({ id: "partner-color", type: "text", title: "너를 닮은 색", prompt: "지금 상대방을 떠올리게 하는 색을 골라주세요.", inputMode: "text", durationSeconds: null, audience: "couple", enabled: true, weight: 1 }),

  template({ id: "couple-place", type: "text", title: "우리의 자리", prompt: "지금 둘이 있는 곳을 한 단어로 표현해주세요.", inputMode: "text", durationSeconds: null, audience: "couple", enabled: true, weight: 1 }),
  template({ id: "couple-funny", type: "text", title: "가장 웃긴 순간", prompt: "오늘 가장 웃겼던 순간을 적어주세요.", inputMode: "text", durationSeconds: null, audience: "couple", enabled: true, weight: 1 }),
  template({ id: "couple-emoji", type: "text", title: "둘의 분위기", prompt: "지금 둘의 분위기를 이모지 하나로 남겨주세요.", inputMode: "text", durationSeconds: null, audience: "couple", enabled: true, weight: 1 }),
  template({ id: "couple-food", type: "photo", title: "오늘의 한입", prompt: "지금 먹고 있는 것을 찍어주세요.", inputMode: "photo", durationSeconds: null, audience: "couple", enabled: true, weight: 1 }),
  template({ id: "couple-again", type: "text", title: "다시 만나고 싶은 순간", prompt: "오늘 다시 하고 싶은 순간을 적어주세요.", inputMode: "text", durationSeconds: null, audience: "couple", enabled: true, weight: 1 }),
  template({ id: "couple-song", type: "text", title: "지금의 노래", prompt: "지금 듣고 싶은 노래를 적어주세요.", inputMode: "text", durationSeconds: null, audience: "couple", enabled: true, weight: 1 }),
  template({ id: "couple-next", type: "text", title: "다음에 우리", prompt: "다음에 함께 하고 싶은 것을 한 줄로 남겨주세요.", inputMode: "text", durationSeconds: null, audience: "couple", enabled: true, weight: 1 }),
  template({ id: "couple-title", type: "text", title: "이 순간의 제목", prompt: "지금 이 순간에 제목을 붙여주세요.", inputMode: "text", durationSeconds: null, audience: "couple", enabled: true, weight: 1 }),

  template({ id: "play-eye-word", type: "text", title: "눈을 보고 한 단어", prompt: "서로 눈을 보고 떠오르는 단어 하나를 적어주세요.", inputMode: "text", durationSeconds: null, audience: "couple", enabled: true, weight: 1 }),
  template({ id: "play-guess-emotion", type: "emotion", title: "마음 맞히기", prompt: "상대방이 고를 것 같은 감정을 예상해주세요.", inputMode: "emotion", durationSeconds: null, audience: "couple", enabled: true, weight: 1 }),
  template({ id: "play-three-letters", type: "text", title: "오늘 세 글자", prompt: "오늘을 세 글자로 표현해주세요.", inputMode: "text", durationSeconds: null, audience: "couple", enabled: true, weight: 1 }),
  template({ id: "play-movie-title", type: "text", title: "우리 영화 제목", prompt: "지금의 순간을 영화 제목처럼 적어주세요.", inputMode: "text", durationSeconds: null, audience: "couple", enabled: true, weight: 1 }),
  template({ id: "play-secret-word", type: "text", title: "둘만 아는 말", prompt: "둘만 알아들을 수 있는 말을 남겨주세요.", inputMode: "text", durationSeconds: null, audience: "couple", enabled: true, weight: 1 }),
  template({ id: "play-action", type: "text", title: "지금 함께", prompt: "지금 당장 함께 하고 싶은 행동을 적어주세요.", inputMode: "text", durationSeconds: null, audience: "couple", enabled: true, weight: 1 }),

  template({ id: "photo-hands", type: "photo", title: "마주 잡은 손", prompt: "서로의 손을 찍어주세요.", inputMode: "photo", durationSeconds: null, audience: "couple", enabled: true, weight: 1 }),
  template({ id: "photo-shoes", type: "photo", title: "오늘의 발끝", prompt: "지금 신고 있는 신발을 찍어주세요.", inputMode: "photo", durationSeconds: null, audience: "recipient", enabled: true, weight: 1 }),
  template({ id: "photo-shared-view", type: "photo", title: "함께 보는 장면", prompt: "둘이 보고 있는 장면을 찍어주세요.", inputMode: "photo", durationSeconds: null, audience: "couple", enabled: true, weight: 1 }),
  template({ id: "photo-food", type: "photo", title: "오늘의 음식", prompt: "오늘의 음식을 찍어주세요.", inputMode: "photo", durationSeconds: null, audience: "couple", enabled: true, weight: 1 }),
  template({ id: "video-five-seconds", type: "video", title: "5초의 우리", prompt: "지금의 모습을 5초 영상으로 남겨주세요.", inputMode: "video", durationSeconds: 5, audience: "couple", enabled: true, weight: 1 }),
  template({ id: "video-around", type: "video", title: "주변 한 바퀴", prompt: "주변을 천천히 한 바퀴 영상으로 남겨주세요.", inputMode: "video", durationSeconds: 8, audience: "recipient", enabled: true, weight: 0.8 }),
  template({ id: "video-laughter", type: "video", title: "웃음이 담긴 5초", prompt: "웃음소리가 담기게 5초 영상으로 남겨주세요.", inputMode: "video", durationSeconds: 5, audience: "couple", enabled: true, weight: 1 }),

  template({ id: "audio-name", type: "audio", title: "이름 부르기", prompt: "지금 상대방 이름을 불러주세요.", inputMode: "audio", durationSeconds: 10, audience: "couple", enabled: true, weight: 1 }),
  template({ id: "audio-mood", type: "audio", title: "목소리로 남긴 기분", prompt: "오늘의 기분을 목소리로 한마디 남겨주세요.", inputMode: "audio", durationSeconds: 10, audience: "recipient", enabled: true, weight: 1 }),
  template({ id: "audio-around", type: "audio", title: "주변의 소리", prompt: "주변 소리를 10초 담아주세요.", inputMode: "audio", durationSeconds: 10, audience: "recipient", enabled: true, weight: 1 }),
  template({ id: "audio-remember", type: "audio", title: "기억할 한마디", prompt: "오늘 가장 기억하고 싶은 말을 음성으로 남겨주세요.", inputMode: "audio", durationSeconds: 10, audience: "recipient", enabled: true, weight: 1 }),
  template({ id: "audio-together", type: "audio", title: "동시에 한마디", prompt: "둘이 동시에 한마디를 녹음해주세요.", inputMode: "audio", durationSeconds: 10, audience: "couple", enabled: true, weight: 1 }),

  template({ id: "choice-temperature", type: "emotion", title: "오늘의 온도", prompt: "오늘의 온도와 가장 가까운 것을 골라주세요.", inputMode: "choice", durationSeconds: null, audience: "recipient", enabled: true, weight: 1, options: ["차분함", "따뜻함", "신남", "피곤함", "설렘"] }),
  template({ id: "choice-near-emotion", type: "emotion", title: "가까운 마음", prompt: "지금 더 가까운 감정을 골라주세요.", inputMode: "emotion", durationSeconds: null, audience: "recipient", enabled: true, weight: 1 }),
  template({ id: "choice-return", type: "emotion", title: "다시 오고 싶은 마음", prompt: "오늘 다시 오고 싶은 정도를 골라주세요.", inputMode: "choice", durationSeconds: null, audience: "couple", enabled: true, weight: 1, options: ["천천히 생각해볼래요", "한 번 더", "자주 오고 싶어요", "곧 다시 오고 싶어요", "계속 기억할래요"] }),
  template({ id: "choice-season", type: "emotion", title: "지금의 계절", prompt: "지금의 순간을 계절로 골라주세요.", inputMode: "choice", durationSeconds: null, audience: "couple", enabled: true, weight: 1, options: ["봄", "여름", "가을", "겨울"] }),
  template({ id: "choice-color", type: "emotion", title: "지금의 색", prompt: "지금의 분위기와 가까운 색을 골라주세요.", inputMode: "choice", durationSeconds: null, audience: "couple", enabled: true, weight: 1, options: ["크림", "딸기", "버터", "하늘", "잎사귀", "회보라"] }),
];

export const DEFAULT_MISSION_TEMPLATE_IDS: Record<MissionType, string> = {
  audio: "audio-now",
  photo: "photo-now",
  video: "video-now",
  text: "text-one-line",
  emotion: "emotion-now",
};

export function getMissionTemplate(templateId: string | null | undefined, type: MissionType): MissionTemplate {
  return MISSION_TEMPLATES.find((item) => item.id === templateId && item.enabled)
    ?? MISSION_TEMPLATES.find((item) => item.id === DEFAULT_MISSION_TEMPLATE_IDS[type])!;
}

export const MISSION_COPY: Record<MissionType, { title: string; prompt: string }> = Object.fromEntries(
  MISSION_TYPES.map((type) => {
    const item = getMissionTemplate(null, type);
    return [type, { title: item.title, prompt: item.prompt }];
  }),
) as Record<MissionType, { title: string; prompt: string }>;
