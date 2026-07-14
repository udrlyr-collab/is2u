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

export const MISSION_COPY: Record<MissionType, { title: string; prompt: string }> = {
  audio: { title: "지금의 소리", prompt: "주변의 소리를 10초만 담아주세요." },
  photo: { title: "눈앞의 한 장면", prompt: "지금 눈앞에 있는 장면을 하나만 담아주세요." },
  video: { title: "잠깐의 움직임", prompt: "지금 이 시간을 짧은 영상으로 담아주세요." },
  text: { title: "한 문장", prompt: "방금 나눈 말 중 기억하고 싶은 한마디를 남겨주세요." },
  emotion: { title: "지금의 마음", prompt: "지금 이 시간의 기분을 하나만 골라주세요." },
};

export const EMOTIONS = ["편안해", "즐거워", "설레", "따뜻해", "고마워", "조용해"] as const;

