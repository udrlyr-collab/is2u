"use client";

import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from "react";
import { BOARD_STICKER_IDS, BOARD_STICKERS, BOARD_STICKER_VARIANT_IDS, type BoardStickerId, type BoardStickerVariant } from "../../../lib/board-style";
import { PAPER_COLORS } from "./board-types";
import { StickerGraphic } from "./board-sticker-graphic";

function handleRadioKeys<T extends string>(event: ReactKeyboardEvent<HTMLButtonElement>, index: number, values: readonly T[], onChange: (value: T) => void) {
  let nextIndex: number | null = null;
  if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (index + 1) % values.length;
  else if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = (index - 1 + values.length) % values.length;
  else if (event.key === "Home") nextIndex = 0;
  else if (event.key === "End") nextIndex = values.length - 1;
  if (nextIndex === null) return;
  event.preventDefault();
  onChange(values[nextIndex]);
  const radios = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
  window.requestAnimationFrame(() => radios?.[nextIndex!]?.focus());
}

export function PaperSwatches({
  value,
  onChange,
  allowDefault = false,
  label = "종이 분위기",
}: {
  value: string;
  onChange: (value: string) => void;
  allowDefault?: boolean;
  label?: string;
}) {
  const colors = allowDefault
    ? [{ id: "", label: "기본", value: "#fffdf9" }, ...PAPER_COLORS]
    : [...PAPER_COLORS];
  const values = colors.map((color) => color.id);

  return <div className="paper-swatch-grid" role="radiogroup" aria-label={label}>{colors.map((color, index) => <button key={color.id || "default"} type="button" role="radio" aria-checked={value === color.id} tabIndex={value === color.id ? 0 : -1} onKeyDown={(event) => handleRadioKeys(event, index, values, onChange)} onClick={() => onChange(color.id)} style={{ "--swatch-color": color.value, "--swatch-turn": `${(index % 3 - 1) * 0.6}deg` } as CSSProperties}><i aria-hidden="true" /> <span>{color.label}</span>{value === color.id && <b aria-hidden="true">✓</b>}</button>)}</div>;
}

const attachmentOptions = [
  { id: "pin", label: "압정", description: "콕 눌러 붙여요" },
  { id: "tape", label: "테이프", description: "종이 테이프로 붙여요" },
  { id: "none", label: "그대로", description: "장식 없이 놓아요" },
] as const;

export function AttachmentPicker({ value, onChange }: { value: string; onChange: (value: "pin" | "tape" | "none") => void }) {
  const values = attachmentOptions.map((option) => option.id);
  return <div className="attachment-choice-grid" role="radiogroup" aria-label="붙이는 방법">{attachmentOptions.map((option, index) => <button key={option.id} type="button" role="radio" aria-checked={value === option.id} tabIndex={value === option.id ? 0 : -1} onKeyDown={(event) => handleRadioKeys(event, index, values, onChange)} onClick={() => onChange(option.id)}>
    <span className={`attachment-choice-preview preview-${option.id}`} aria-hidden="true"><i /></span>
    <span><strong>{option.label}</strong><small>{option.description}</small></span>
    {value === option.id && <b aria-hidden="true">✓</b>}
  </button>)}</div>;
}

export function StickerPicker({ value, onChange, label = "스티커 고르기" }: { value: BoardStickerId; onChange: (value: BoardStickerId) => void; label?: string }) {
  return <div className="board-sticker-grid" role="radiogroup" aria-label={label}>{BOARD_STICKERS.map((sticker, index) => <button key={sticker.id} type="button" role="radio" aria-checked={value === sticker.id} tabIndex={value === sticker.id ? 0 : -1} onKeyDown={(event) => handleRadioKeys(event, index, BOARD_STICKER_IDS, onChange)} onClick={() => onChange(sticker.id)} style={{ "--sticker-turn": `${(index % 5 - 2) * 0.5}deg` } as CSSProperties}>
    <StickerGraphic id={sticker.id} className={`sticker-sample sticker-${sticker.id}`} />
    <strong>{sticker.label}</strong>
    {value === sticker.id && <b aria-hidden="true">✓</b>}
  </button>)}</div>;
}

const stickerVariantOptions = [
  { id: "outline", label: "선으로", description: "가볍게 그린 스티커" },
  { id: "filled", label: "채워서", description: "속이 꽉 찬 스티커" },
] as const;

export function StickerVariantPicker({ sticker, value, onChange }: { sticker: BoardStickerId; value: BoardStickerVariant; onChange: (value: BoardStickerVariant) => void }) {
  return <div className="sticker-variant-grid" role="radiogroup" aria-label="스티커 채움 방식">{stickerVariantOptions.map((option, index) => <button key={option.id} type="button" role="radio" aria-checked={value === option.id} tabIndex={value === option.id ? 0 : -1} onKeyDown={(event) => handleRadioKeys(event, index, BOARD_STICKER_VARIANT_IDS, onChange)} onClick={() => onChange(option.id)}>
    <StickerGraphic id={sticker} variant={option.id} />
    <span><strong>{option.label}</strong><small>{option.description}</small></span>
    {value === option.id && <b aria-hidden="true">✓</b>}
  </button>)}</div>;
}
