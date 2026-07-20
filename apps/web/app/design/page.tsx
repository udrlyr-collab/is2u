import type { Metadata } from "next";
import Link from "next/link";
import { CopyCode, KitActions } from "./copy-code";
import { componentCss, fontSetup, foundationCss, fullStarterCss, reactExamples, tokenCss } from "./design-kit";
import "./design.css";

export const metadata: Metadata = {
  title: "디자인 안내서",
  description: "is2u의 디자인 철학, 토큰, 컴포넌트와 구현 규칙을 담은 재사용 가능한 디자인 시스템",
};

const colors = [
  ["Background", "#FBF7F1", "책상과 다이어리 바탕"],
  ["Paper", "#FFFDF9", "글을 올리는 깨끗한 종이"],
  ["Foreground", "#302B28", "검정보다 부드러운 먹색"],
  ["Muted", "#7B6D64", "날짜와 보조 설명"],
  ["Border", "#DCCFC4", "종이 사이의 조용한 구분"],
  ["Strawberry", "#D9827A", "행동과 애정의 포인트"],
  ["Butter", "#F1D58A", "라벨과 선택"],
  ["Sky", "#AFC9D8", "정보와 차분한 상태"],
  ["Leaf", "#A9B99A", "완료와 안정"],
] as const;

const principles = [
  ["기억 상자이지 대시보드가 아니에요", "정보를 같은 카드에 반복 포장하지 않고 사진, 메모, 라벨처럼 내용에 맞는 물성을 골라요"],
  ["귀여움은 색보다 손맛에서 와요", "하트와 핑크를 늘리는 대신 미세한 회전, 짧은 그림자, 테이프 한 조각으로 친밀함을 만들어요"],
  ["한 화면에는 중심이 하나예요", "홈에서는 추억 하나, 미션에서는 문장 하나처럼 가장 중요한 대상을 먼저 보이게 해요"],
  ["비정형은 규칙 안에서만 써요", "회전은 대체로 0.2~1.4도, 장식은 화면마다 0~2개로 제한해 가독성을 지켜요"],
  ["조용한 인터랙션을 사용해요", "150~220ms 안에서 종이가 들리거나 붙는 정도만 표현하고 bounce와 큰 scale은 피해야 해요"],
  ["사적인 문장을 사용해요", "관리 용어나 기술 용어 대신 짧은 해요체를 쓰고 사용자 문구 끝에는 마침표를 붙이지 않아요"],
] as const;

const donts = [
  "모든 내용을 같은 rounded 카드에 넣기",
  "그라데이션·유리 효과·넓고 흐린 그림자",
  "화면마다 반복되는 거대한 제목과 설명",
  "모든 요소를 pill 형태로 만들기",
  "한 화면에 포인트 색을 세 가지 이상 사용하기",
  "큰 Lucide 아이콘이나 장식용 이모지 남발",
  "의미 없는 접힌 모서리와 과도한 낙서",
  "SaaS 대시보드처럼 균일한 정렬만 사용하기",
] as const;

const recipes = [
  ["비밀 상자", "로그인", "작은 종이 한 장과 네 개의 PIN 칸만 중심에 두고 정체성 선택은 PIN 결과에 맡겨요"],
  ["한 장의 인화 사진", "홈", "과거 추억 하나가 시선을 차지하고 탐색·설정은 작은 링크나 하단 dock으로 물러나요"],
  ["약속 메모 묶음", "달력", "업무용 월간 그리드보다 날짜 라벨과 약속 종이가 이어지는 시간 흐름을 우선해요"],
  ["잠깐 펼친 쪽지", "미션", "미션 문장, 수행 동작 하나, 부담 없는 건너뛰기만 남겨요"],
  ["조용한 목록", "설정", "관리 패널 대신 얇은 종이 행으로 나누고 위험한 작업만 맨 아래에 분리해요"],
] as const;

export default function DesignPage() {
  return <div className="design-guide">
    <header className="design-topbar">
      <Link href="/" className="design-wordmark" aria-label="그대로 멈춰라 홈으로 이동">그대로 멈춰라</Link>
      <span>DESIGN FIELD NOTES</span>
      <a href="#starter" className="design-jump">바로 적용하기 ↓</a>
    </header>

    <main>
      <section className="design-hero" aria-labelledby="design-title">
        <div className="design-hero-copy">
          <p className="paper-label">IS2U DESIGN SYSTEM</p>
          <h1 id="design-title">작은 기억을<br />손으로 붙여두는 법</h1>
          <p className="design-lead">작은 문구점의 스티커 다이어리, 오래된 디지털카메라 사진첩, 손으로 붙여둔 메모 조각을 하나의 웹 언어로 정리했어요</p>
          <p className="design-purpose">이 페이지의 원칙과 코드를 옮기면 다른 프로젝트에서도 is2u의 따뜻하고 사적인 종이 감각을 재현할 수 있어요</p>
          <KitActions code={fullStarterCss} />
        </div>
        <div className="design-hero-board" aria-label="is2u 디자인 조합 예시">
          <span className="design-board-tape" aria-hidden="true" />
          <p className="design-board-date">JUL 15</p>
          <div className="design-polaroid">
            <div aria-hidden="true"><span /><i /><b /></div>
            <p>둘의 작은 조각</p>
          </div>
          <blockquote>평범한 순간이<br />오래 남는 방식</blockquote>
          <span className="design-board-star" aria-hidden="true">✦</span>
        </div>
      </section>

      <nav className="design-toc" aria-label="디자인 안내서 목차">
        <a href="#principles">철칙</a><a href="#colors">색</a><a href="#type">글자</a><a href="#materials">물성</a><a href="#components">컴포넌트</a><a href="#layout">레이아웃</a><a href="#motion">인터랙션</a><a href="#voice">문구</a><a href="#accessibility">접근성</a><a href="#starter">코드</a>
      </nav>

      <section id="principles" className="design-section design-principles">
        <div className="design-section-heading"><span>01</span><div><p>DESIGN PRINCIPLES</p><h2>흔들리지 않는 여섯 가지 철칙</h2></div></div>
        <div className="design-principle-list">{principles.map(([title, detail], index) => <article key={title}><b>{String(index + 1).padStart(2, "0")}</b><div><h3>{title}</h3><p>{detail}</p></div></article>)}</div>
        <aside className="design-dont">
          <p className="paper-label">하지 않는 것</p>
          <ul>{donts.map((item) => <li key={item}>{item}</li>)}</ul>
        </aside>
      </section>

      <section id="colors" className="design-section">
        <div className="design-section-heading"><span>02</span><div><p>COLOR SYSTEM</p><h2>빛이 조금 바랜 종이색</h2></div></div>
        <p className="design-section-intro">바탕은 순백 대신 크림색을 쓰고, 검정은 먹색으로 낮춰요. 한 화면의 포인트는 Strawberry·Butter·Sky·Leaf 중 한두 개만 골라요</p>
        <div className="design-color-grid">{colors.map(([name, hex, use]) => <figure key={name}><div style={{ background: hex }} className={name === "Paper" ? "light" : ""} /><figcaption><strong>{name}</strong><code>{hex}</code><span>{use}</span></figcaption></figure>)}</div>
        <div className="design-color-rule"><div><span style={{ background: "var(--strawberry)" }} /><span style={{ background: "var(--butter)" }} /><b>한 화면에서 함께 써도 좋아요</b></div><div className="wrong"><span style={{ background: "var(--strawberry)" }} /><span style={{ background: "var(--butter)" }} /><span style={{ background: "var(--sky)" }} /><span style={{ background: "var(--leaf)" }} /><b>모든 포인트를 한꺼번에 쓰지 않아요</b></div></div>
        <CopyCode title="design-tokens.css" note="현재 운영 코드의 정확한 값이에요" code={tokenCss} />
      </section>

      <section id="type" className="design-section">
        <div className="design-section-heading"><span>03</span><div><p>TYPOGRAPHY</p><h2>한 서체, 네 가지 목소리</h2></div></div>
        <p className="design-section-intro">현재 is2u는 MaruBuri 한 계열만 사용해요. 굵기로 역할을 나누기 때문에 한 화면이 조용하게 이어져요</p>
        <div className="design-type-specimens">
          <article className="logo"><small>Logo · Bold 700</small><p>그대로 멈춰라</p><code>--font-logo</code></article>
          <article className="display"><small>Display · SemiBold 600</small><p>우리의 추억</p><code>--font-display</code></article>
          <article className="body"><small>Body · Regular 400</small><p>평범했던 순간을 오래 기억할 수 있게 조용히 붙여두어요</p><code>--font-body</code></article>
          <article className="note"><small>Note · ExtraLight 200 / Light 300</small><p>7월 15일 · 둘만의 작은 메모</p><code>--font-note</code></article>
        </div>
        <div className="design-type-rules"><p><b>제목</b><span>모바일 28px 안팎, 최대 39px · 자간 -0.045em · 줄높이 1.22</span></p><p><b>본문</b><span>16px · 줄높이 1.55 · 긴 문장은 65ch 안쪽</span></p><p><b>작은 메모</b><span>11~13px · Light 계열 · 짧은 날짜와 라벨에만 사용</span></p><p><b>폰트 수</b><span>한 화면에서 계열은 최대 2개, 손글씨풍은 작은 라벨에만 사용</span></p></div>
        <CopyCode title="Next.js localFont 설정" note="파일명과 굵기 역할까지 그대로 옮겨요" code={fontSetup} />
      </section>

      <section id="materials" className="design-section">
        <div className="design-section-heading"><span>04</span><div><p>PAPER & MATERIAL</p><h2>귀여움을 만드는 물성</h2></div></div>
        <div className="design-material-grid">
          <article><span className="design-material-paper" /><h3>짧고 단단한 그림자</h3><p><code>2px 3px 0</code>처럼 방향이 보이는 그림자를 사용해요. 흐릿하고 넓은 SaaS 그림자는 쓰지 않아요</p></article>
          <article><span className="design-material-radius" /><h3>조금씩 다른 모서리</h3><p>일반 요소는 8~12px, 큰 패널도 16px 이하예요. 네 모서리를 완전히 같게 만들 필요는 없어요</p></article>
          <article><span className="design-material-tilt" /><h3>0.2~1.4도의 어긋남</h3><p>정보를 흔들지 않는 범위에서 종이와 라벨만 미세하게 회전해요. 모바일 본문 카드는 회전을 줄여요</p></article>
          <article><span className="design-material-tape" /><h3>테이프는 한 조각</h3><p>테이프와 별, 낙서는 화면마다 0~2개만 사용하고 장식에는 <code>aria-hidden</code>을 붙여요</p></article>
        </div>
        <div className="design-measures">
          <div><span style={{ width: "8px" }} /><b>8</b></div><div><span style={{ width: "12px" }} /><b>12</b></div><div><span style={{ width: "16px" }} /><b>16</b></div><div><span style={{ width: "24px" }} /><b>24</b></div><div><span style={{ width: "32px" }} /><b>32</b></div><div><span style={{ width: "40px" }} /><b>40</b></div>
        </div>
      </section>

      <section id="components" className="design-section">
        <div className="design-section-heading"><span>05</span><div><p>COMPONENT LANGUAGE</p><h2>같은 카드 대신 서로 다른 종이</h2></div></div>
        <div className="design-component-board">
          <article className="design-component-piece labels"><small>LABELS</small><div><span className="paper-label">OUR LITTLE MEMORIES</span><span className="status-sticker sticker-active">지금 해야 해요</span><span className="status-sticker sticker-done">잘 붙여뒀어요</span></div></article>
          <article className="design-component-piece buttons"><small>ACTIONS</small><div><button type="button" className="button button-primary">추억 남기기</button><button type="button" className="button button-secondary">다른 기억 보기</button><button type="button" className="button button-quiet">이번에는 그냥 지나가기</button></div></article>
          <article className="design-component-piece fields"><small>FIELD</small><label><span>제목</span><input className="input" placeholder="이 추억에 이름을 붙여주세요" /></label><p>입력은 종이 위에 조용히 눌러쓴 것처럼 보여요</p></article>
          <article className="design-component-piece notices"><small>FEEDBACK</small><p className="inline-notice">미리보기를 차분히 준비하고 있어요</p><p className="inline-notice notice-success">추억을 잘 붙여뒀어요</p><p className="inline-notice notice-error">저장하지 못했어요 잠시 뒤 다시 시도해 주세요</p></article>
          <article className="design-component-piece memory"><small>MEMORY POST</small><div className="design-memory-post" tabIndex={0}><span aria-hidden="true" /><header><h3>기억할 한마디</h3><i>한 줄 기록</i></header><blockquote>오늘을 오래 기억하고 싶어</blockquote><footer><time>오후 8:14</time><b>둘의 추억</b></footer></div></article>
          <article className="design-component-piece menu"><small>PAPER MENU</small><div className="design-paper-menu"><button type="button">추억 열기</button><button type="button">수정하기</button><button type="button" className="danger">추억 떼기</button></div></article>
        </div>
        <p className="design-component-rule">컴포넌트 로직은 공유해도 시각적 표면은 내용의 역할에 맞춰 달라져야 해요. 버튼, 메모, 사진, 상태를 같은 둥근 카드로 통일하지 않아요</p>
      </section>

      <section id="layout" className="design-section">
        <div className="design-section-heading"><span>06</span><div><p>LAYOUT & RHYTHM</p><h2>같은 종이 위의 공통 기준선</h2></div></div>
        <div className="design-layout-demo">
          <div className="design-ruler"><span>page padding</span><i /><b>content</b><i /><span>page padding</span></div>
          <div className="design-layout-header"><div><small>OUR LITTLE MEMORIES</small><strong>우리의 추억</strong></div><button type="button">+ 추억 남기기</button></div>
          <div className="design-layout-date"><span>2026년 7월 15일</span><i /></div>
          <div className="design-layout-content"><div /><div /><div /></div>
        </div>
        <dl className="design-layout-values"><div><dt>최대 폭</dt><dd>78rem / 1248px</dd></div><div><dt>좌우 여백</dt><dd>clamp(16px, 4vw + 4px, 48px)</dd></div><div><dt>모바일 기준</dt><dd>390px 우선, 320px까지 보장</dd></div><div><dt>카드 열</dt><dd>모바일 1 · 태블릿 2 · 데스크톱 3</dd></div><div><dt>터치 영역</dt><dd>최소 44 × 44px</dd></div><div><dt>본문 길이</dt><dd>읽는 글은 약 65ch 이하</dd></div></dl>
        <div className="design-recipes">{recipes.map(([title, screen, detail]) => <article key={screen}><span>{screen}</span><h3>{title}</h3><p>{detail}</p></article>)}</div>
      </section>

      <section id="motion" className="design-section">
        <div className="design-section-heading"><span>07</span><div><p>MOTION & SOUND</p><h2>종이가 움직이는 만큼만</h2></div></div>
        <div className="design-motion-row">
          <article><button type="button" className="design-motion-paper">살짝 들기</button><h3>150ms · quick</h3><p>버튼과 작은 상태 변화</p></article>
          <article><button type="button" className="design-motion-note">메모 붙이기</button><h3>220ms · paper</h3><p>종이 등장과 위치 변화</p></article>
          <article><span className="design-motion-stop">×</span><h3>사용하지 않아요</h3><p>bounce, 큰 scale, 과한 spring</p></article>
        </div>
        <ul className="design-motion-notes"><li>hover만으로 소리를 재생하지 않아요</li><li>종이 소리는 명시적 클릭·저장·삭제에만 아주 작게 사용해요</li><li>실패한 소리가 기능 동작을 막지 않아야 해요</li><li><code>prefers-reduced-motion</code>에서는 전환과 애니메이션을 제거해요</li></ul>
      </section>

      <section id="voice" className="design-section design-voice">
        <div className="design-section-heading"><span>08</span><div><p>VOICE & CONTENT</p><h2>기술보다 마음을 먼저 말해요</h2></div></div>
        <div className="design-voice-examples">
          <article><span>좋아요</span><p>추억을 잘 붙여뒀어요</p><p>잠시 뒤 다시 펼쳐주세요</p><p>이번에는 그냥 지나갈게요</p></article>
          <article className="wrong"><span>피해요</span><p>저장이 완료되었습니다.</p><p>Cannot read properties of null</p><p>Submit / Cancel / Delete</p></article>
        </div>
        <ul><li>사용자 문구는 짧은 해요체를 사용해요</li><li>문장 끝에는 마침표를 붙이지 않아요</li><li>원인보다 다음에 할 수 있는 행동을 알려줘요</li><li>PIN, 토큰, 내부 오류, 버킷 키 같은 기술 정보를 노출하지 않아요</li><li>삭제는 ‘삭제’보다 맥락에 맞는 ‘추억 떼기’를 사용해요</li></ul>
      </section>

      <section id="accessibility" className="design-section">
        <div className="design-section-heading"><span>09</span><div><p>ACCESSIBILITY</p><h2>손맛이 사용성을 가리지 않게</h2></div></div>
        <div className="design-access-grid"><article><b>44</b><span>모든 주요 터치 영역의 최소 크기</span></article><article><b>3px</b><span>focus-visible 손그림 외곽선</span></article><article><b>2개</b><span>색과 함께 쓰는 텍스트·형태 단서</span></article><article><b>0</b><span>스크린리더에 전달할 장식 요소 수</span></article></div>
        <ol className="design-check-list"><li>Tab 순서가 시각적 흐름과 같아야 해요</li><li>Enter·Space와 Escape를 기본 동작으로 지원해요</li><li>상태는 색만으로 구분하지 않고 문구를 함께 보여줘요</li><li>장식용 테이프·별·낙서는 <code>aria-hidden=&quot;true&quot;</code>로 숨겨요</li><li>오류와 성공은 소리만으로 전달하지 않아요</li><li>320px에서 가로 스크롤과 잘린 메뉴가 없어야 해요</li></ol>
      </section>

      <section id="starter" className="design-section design-starter">
        <div className="design-section-heading"><span>10</span><div><p>STARTER KIT</p><h2>다른 프로젝트에 옮기는 순서</h2></div></div>
        <ol className="design-adoption-steps"><li><b>01</b><div><h3>토큰부터 붙여요</h3><p>색을 임의로 고치기 전에 배경·종이·글자·포인트의 관계를 그대로 가져와요</p></div></li><li><b>02</b><div><h3>서체 역할을 연결해요</h3><p>MaruBuri 파일을 프로젝트에 넣고 Logo·Display·Body·Note 변수를 연결해요</p></div></li><li><b>03</b><div><h3>기본 종이를 만들어요</h3><p>라벨, PaperCard, Button, Input, MemoryPost 순서로 작은 표면부터 구현해요</p></div></li><li><b>04</b><div><h3>화면별 중심을 정해요</h3><p>한 화면에서 가장 중요한 대상 하나를 고른 다음 주변 기능의 주목도를 낮춰요</p></div></li><li><b>05</b><div><h3>모바일에서 먼저 확인해요</h3><p>390px을 중심으로 320px, 430px, 태블릿, 데스크톱 순서로 기준선을 확인해요</p></div></li></ol>
        <KitActions code={fullStarterCss} />
        <CopyCode title="foundation.css" note="배경, 글자, 제목, focus의 최소 기반이에요" code={foundationCss} />
        <CopyCode title="paper-components.css" note="라벨, 종이, 버튼, 입력, 추억 포스트와 반응형 규칙이에요" code={componentCss} />
        <CopyCode title="React 기본 컴포넌트" note="프로젝트 프레임워크에 맞게 props만 확장해요" code={reactExamples} />
      </section>

      <footer className="design-footer"><span aria-hidden="true">✦</span><p><strong>그대로 멈춰라</strong><br />둘만의 평범한 시간을 조용히 보관하는 디자인</p><a href="#design-title">처음으로 ↑</a></footer>
    </main>
  </div>;
}
