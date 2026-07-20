export const tokenCss = `:root {
  --background: #fbf7f1;
  --paper: #fffdf9;
  --foreground: #302b28;
  --muted-foreground: #7b6d64;
  --border: #dccfc4;
  --strawberry: #d9827a;
  --butter: #f1d58a;
  --sky: #afc9d8;
  --leaf: #a9b99a;
  --danger: #a85049;

  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-5: 1.25rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --space-10: 2.5rem;

  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-panel: 16px;
  --paper-shadow: 2px 3px 0 rgb(70 50 40 / 0.12);
  --paper-shadow-strong: 3px 4px 0 rgb(70 50 40 / 0.15);
  --tape-butter: rgb(241 213 138 / 0.72);
  --tape-sky: rgb(175 201 216 / 0.62);
  --tape-leaf: rgb(169 185 154 / 0.58);
  --transition-quick: 150ms ease;
  --transition-paper: 220ms ease;
  --page-max-width: 78rem;
  --page-padding-inline: clamp(1rem, calc(4vw + 0.25rem), 3rem);
  color-scheme: light;
}`;

export const fontSetup = `import localFont from "next/font/local";

const maruLogo = localFont({
  src: "./fonts/MaruBuri-Bold.ttf",
  variable: "--font-maru-logo",
  weight: "700",
  display: "swap",
});
const maruTitle = localFont({
  src: "./fonts/MaruBuri-SemiBold.ttf",
  variable: "--font-maru-title",
  weight: "600",
  display: "swap",
});
const maruBody = localFont({
  src: "./fonts/MaruBuri-Regular.ttf",
  variable: "--font-maru-body",
  weight: "400",
  display: "swap",
});
const maruNote = localFont({
  src: [
    { path: "./fonts/MaruBuri-ExtraLight.ttf", weight: "200" },
    { path: "./fonts/MaruBuri-Light.ttf", weight: "300" },
  ],
  variable: "--font-maru-note",
  display: "swap",
});

// body className에 네 variable을 모두 연결해요
// --font-logo: 700 / --font-display: 600
// --font-body: 400 / --font-note: 200~300`;

export const foundationCss = `* { box-sizing: border-box; }

html {
  min-height: 100%;
  overflow-x: clip;
  background: var(--background);
  scrollbar-gutter: stable;
}

body {
  --font-logo: var(--font-maru-logo), serif;
  --font-display: var(--font-maru-title), serif;
  --font-body: var(--font-maru-body), serif;
  --font-note: var(--font-maru-note), serif;
  min-height: 100vh;
  width: 100%;
  margin: 0;
  overflow-x: clip;
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-body);
  font-size: 16px;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}

h1, h2, h3 {
  font-family: var(--font-display);
  font-weight: 600;
  letter-spacing: -0.045em;
}

h1 {
  font-size: clamp(1.75rem, 7vw, 2.45rem);
  line-height: 1.22;
}

::selection { background: rgb(241 213 138 / 0.68); }
:focus-visible {
  outline: 3px solid rgb(217 130 122 / 0.42);
  outline-offset: 3px;
}`;

export const componentCss = `/* 작은 종이 라벨 */
.paper-label {
  display: inline-block;
  padding: 0.24rem 0.52rem 0.18rem;
  background: var(--butter);
  color: #5f513e;
  font-family: var(--font-note);
  font-size: 0.72rem;
  font-weight: 300;
  letter-spacing: 0.075em;
  box-shadow: 1px 2px 0 rgb(70 50 40 / 0.1);
  transform: rotate(-1.4deg);
}

/* 카드가 아니라 책상 위 종이 조각 */
.paper-card {
  position: relative;
  padding: var(--space-5);
  background: var(--paper);
  border-radius: 7px 11px 8px 6px;
  box-shadow: var(--paper-shadow);
}
.paper-tape {
  position: absolute;
  top: -0.62rem;
  left: 50%;
  width: 4.8rem;
  height: 1.25rem;
  background: var(--tape-butter);
  transform: translateX(-50%) rotate(-2deg);
  pointer-events: none;
}

.button {
  position: relative;
  min-height: 44px;
  display: inline-grid;
  place-items: center;
  padding: 0.72rem 1rem;
  border: 0;
  cursor: pointer;
  font: inherit;
  transition: transform var(--transition-quick),
    background-color var(--transition-quick),
    box-shadow var(--transition-quick);
}
.button-primary {
  background: var(--strawberry);
  color: var(--paper);
  border-radius: 7px 10px 8px 6px;
  box-shadow: 2px 3px 0 rgb(107 58 53 / 0.21);
  clip-path: polygon(1% 2%, 98% 0, 100% 93%, 96% 100%, 2% 98%, 0 8%);
}
.button-primary:hover {
  background: #c9746c;
  transform: translate(-1px, -1px) rotate(-0.3deg);
  box-shadow: 3px 4px 0 rgb(107 58 53 / 0.2);
}
.button-primary:active {
  transform: translate(1px, 1px);
  box-shadow: 1px 1px 0 rgb(107 58 53 / 0.2);
}
.button-secondary {
  border: 1px dashed #c7b5a7;
  border-radius: 9px 6px 10px 7px;
  background: var(--paper);
  box-shadow: 1px 2px 0 rgb(70 50 40 / 0.1);
}
.button-quiet {
  padding-inline: 0.28rem;
  background: transparent;
  color: var(--muted-foreground);
  text-decoration: underline wavy rgb(123 109 100 / 0.38);
  text-underline-offset: 0.28rem;
}

.input {
  width: 100%;
  min-height: 44px;
  padding: 0.72rem 0.78rem;
  border: 1px solid var(--border);
  border-bottom-width: 2px;
  border-radius: 7px 9px 6px 8px;
  background: rgb(255 253 249 / 0.92);
  color: var(--foreground);
  font: inherit;
}
.input:focus {
  border-color: var(--strawberry);
  box-shadow: 0 0 0 3px rgb(217 130 122 / 0.12);
  outline: none;
}

.field { display: grid; gap: 0.4rem; }
.field-label {
  color: var(--muted-foreground);
  font-family: var(--font-note);
  font-size: 0.78rem;
  font-weight: 300;
}

.inline-notice {
  margin: var(--space-4) 0 0;
  padding: 0.75rem 0.9rem;
  border-left: 4px solid var(--sky);
  background: rgb(175 201 216 / 0.18);
  color: var(--muted-foreground);
  box-shadow: 1px 2px 0 rgb(70 50 40 / 0.08);
}
.notice-error {
  border-color: var(--strawberry);
  background: rgb(217 130 122 / 0.13);
  color: #7d3f3a;
}
.notice-success {
  border-color: var(--leaf);
  background: rgb(169 185 154 / 0.17);
  color: #52634a;
}

.status-sticker {
  display: inline-flex;
  padding: 0.13rem 0.34rem;
  background: #ede4dc;
  color: #675a52;
  font-size: 0.68rem;
  transform: rotate(0.7deg);
}
.sticker-active { background: rgb(217 130 122 / 0.28); color: #7c403a; }
.sticker-done { background: rgb(169 185 154 / 0.38); color: #506047; }
.sticker-expired { background: #e5ded8; color: #786b63; }

.memory-post {
  position: relative;
  display: grid;
  gap: 0.8rem;
  padding: 1.25rem 1rem 0.9rem;
  background: #fff8d9;
  box-shadow: var(--paper-shadow);
  transform: rotate(-0.45deg);
  transition: transform var(--transition-paper), box-shadow var(--transition-paper);
}
.memory-post:hover,
.memory-post:focus-visible {
  transform: translateY(-2px) rotate(0.1deg);
  box-shadow: var(--paper-shadow-strong);
}

.mission-note {
  position: relative;
  display: grid;
  gap: var(--space-4);
  padding: 2.25rem 1.35rem 1.55rem;
  background: #fff8d9;
  box-shadow: var(--paper-shadow-strong);
  transform: rotate(0.25deg);
}

.paper-menu {
  display: grid;
  width: 10.8rem;
  padding: 0.48rem 0.55rem;
  background: #fff8d9;
  border: 1px solid rgb(171 146 130 / 0.42);
  box-shadow: 3px 4px 0 rgb(70 50 40 / 0.16);
}
.paper-menu button {
  min-height: 44px;
  border: 0;
  border-bottom: 1px dashed rgb(123 109 100 / 0.22);
  background: transparent;
  text-align: left;
}

.page-shell {
  width: 100%;
  max-width: var(--page-max-width);
  margin-inline: auto;
  padding: 1rem var(--page-padding-inline) 4rem;
}
.page-header {
  min-height: 5.8rem;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.6rem 0 0.4rem;
}
.page-header h1 { margin-bottom: 0.55rem; }
.page-header-action { flex: 0 0 auto; margin-left: auto; }
.memory-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(15rem, 1fr));
  gap: 1rem;
}

@media (max-width: 620px) {
  .page-header { align-items: flex-start; flex-wrap: wrap; }
  .memory-grid { grid-template-columns: 1fr; }
  .memory-post { transform: none; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    scroll-behavior: auto !important;
    transition: none !important;
    animation: none !important;
  }
}`;

export const reactExamples = `export function PaperCard({ children }) {
  return (
    <section className="paper-card">
      <span className="paper-tape" aria-hidden="true" />
      {children}
    </section>
  );
}

export function PageHeader({ label, title, action }) {
  return (
    <header className="page-header">
      <div>
        <p className="paper-label">{label}</p>
        <h1>{title}</h1>
      </div>
      <div className="page-header-action">{action}</div>
    </header>
  );
}

export function MemoryPost({ title, children, meta }) {
  return (
    <article className="memory-post" tabIndex={0}>
      <span className="paper-tape" aria-hidden="true" />
      <h2>{title}</h2>
      <div>{children}</div>
      <small>{meta}</small>
    </article>
  );
}`;

export const fullStarterCss = [tokenCss, foundationCss, componentCss].join("\n\n");
