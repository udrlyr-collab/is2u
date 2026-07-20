import type { BoardStickerId, BoardStickerVariant } from "../../../lib/board-style";

export function StickerGraphic({
  id,
  variant = "outline",
  className = "",
}: {
  id: BoardStickerId;
  variant?: BoardStickerVariant;
  className?: string;
}) {
  const filled = variant === "filled";
  const common = {
    fill: filled ? "currentColor" : "none",
    stroke: "currentColor",
    strokeWidth: filled ? 1.4 : 2.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    vectorEffect: "non-scaling-stroke" as const,
  };

  return <svg className={`board-sticker-graphic variant-${variant}${className ? ` ${className}` : ""}`} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    {id === "sparkle" && <path {...common} d="M32 5c2.6 13.8 7.2 21.2 22 27-14.8 5.8-19.4 13.2-22 27-2.6-13.8-7.2-21.2-22-27 14.8-5.8 19.4-13.2 22-27Z" />}
    {id === "heart" && <path {...common} d="M32 55C25 48.8 10 38.2 10 23.7 10 15.6 15.4 10 23 10c4.6 0 7.5 2.5 9 5.2C33.5 12.5 36.4 10 41 10c7.6 0 13 5.6 13 13.7C54 38.2 39 48.8 32 55Z" />}
    {id === "star" && <path {...common} d="m32 6 7.7 16 17.6 2.5-12.8 12.3 3 17.4L32 46l-15.5 8.2 3-17.4L6.7 24.5l17.6-2.5L32 6Z" />}
    {id === "flower" && <g {...common}>
      <path d="M32 28c-7-12-2-20 5-20 7.5 0 9 10.5 2.6 18 10.6-8.7 20.3-4.6 19 3-1.2 7.4-11.7 8-19 2.8 9.2 10 5.6 20-2 20.3-7.3.3-9.2-9.8-4.5-18.2-6.8 12-17.4 12.2-20.6 5.4-3-6.7 6-12.1 17.5-8.9-9.7-9.8-7.3-19.8 0-21.4 7-1.5 11 7.7 10.5 18Z" />
      <circle cx="32" cy="31" r="6" fill={filled ? "#fff8e8" : "none"} />
    </g>}
    {id === "moon" && <path {...common} fillRule="evenodd" d="M45.5 7.8C32.2 11 23.6 23.2 26.4 36.4c2.5 11.5 12.5 19.4 23.7 19.8-4.2 2.1-9 3.2-14 2.8C20.6 57.8 8.8 44.5 10 29 11 15.7 21.4 5.2 34.7 4c3.8-.3 7.5.3 10.8 1.7v2.1Z" />}
    {id === "sun" && <g stroke="currentColor" strokeWidth={filled ? 2 : 2.5} strokeLinecap="round" vectorEffect="non-scaling-stroke">
      <circle cx="32" cy="32" r="13" fill={filled ? "currentColor" : "none"} />
      <path d="M32 4v9M32 51v9M4 32h9M51 32h9M12.2 12.2l6.4 6.4M45.4 45.4l6.4 6.4M51.8 12.2l-6.4 6.4M18.6 45.4l-6.4 6.4" fill="none" />
    </g>}
    {id === "music" && <g stroke="currentColor" strokeWidth={filled ? 4.6 : 2.7} strokeLinecap="round" strokeLinejoin="round" fill="none" vectorEffect="non-scaling-stroke">
      <path d="M24 45V15l27-5v30" />
      <ellipse cx="16.5" cy="47" rx="8.5" ry="6.5" fill={filled ? "currentColor" : "none"} />
      <ellipse cx="43.5" cy="42" rx="8.5" ry="6.5" fill={filled ? "currentColor" : "none"} />
    </g>}
    {id === "smile" && <g stroke={filled ? "#fff8e8" : "currentColor"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke">
      <circle cx="32" cy="32" r="25" fill={filled ? "currentColor" : "none"} stroke="currentColor" />
      <path d="M22 27h.1M42 27h.1M20 39c3.2 6 8 9 12 9s8.8-3 12-9" fill="none" />
    </g>}
    {id === "clover" && <g {...common}>
      <path d="M32 28C18 27 14 18 18.6 12.2 23 6.6 31 12.6 32 22c1-9.4 9-15.4 13.4-9.8C50 18 46 27 32 28Zm0 0c14-1 20 6.8 16.2 13.5C44.7 47.8 35.8 43.6 32 34c-3.8 9.6-12.7 13.8-16.2 7.5C12 34.8 18 27 32 28Z" />
      <path d="M32 34v23" fill="none" />
    </g>}
    {id === "arrow" && (filled
      ? <path fill="currentColor" d="M6 27h34V14l19 18-19 18V37H6V27Z" />
      : <path {...common} d="M7 32h48M39 16l16 16-16 16" />)}
    {id === "tape" && <g {...common}>
      <path d="m12 18 43-4-3 32-43 4 3-32Z" />
      {!filled && <path d="m17 22 7-.7M39 19.8l7-.7M14.5 43l7-.7M38 40.8l7-.7" />}
    </g>}
    {id === "bow" && <g {...common}>
      <path d="M29 28C20 15 8 13 7 22c-1 8 10 12 22 10M35 28c9-13 21-15 22-6 1 8-10 12-22 10M29 36C20 49 9 52 8 43c-.8-7 9-11 21-11M35 36c9 13 20 16 21 7 .8-7-9-11-21-11" />
      <rect x="27" y="26" width="10" height="12" rx="3" fill={filled ? "#fff8e8" : "none"} />
    </g>}
  </svg>;
}
