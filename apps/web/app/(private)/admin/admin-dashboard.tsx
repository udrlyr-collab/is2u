"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Field, InlineNotice, Input, Select, StatusSticker } from "../../../components/ui";
import { PaperConfirmDialog } from "../../../components/paper-dialog";
import { apiFetch } from "../../../lib/client";
import { AdminTestPanel } from "./admin-test-panel";

type Section = "overview" | "users" | "couples" | "tests" | "logs";
const sections: Array<{ id: Section; label: string }> = [
  { id: "overview", label: "한눈에 보기" }, { id: "users", label: "계정" }, { id: "couples", label: "연결" },
  { id: "tests", label: "미션 테스트" }, { id: "logs", label: "관리 기록" },
];
type Pagination = { page: number; pageSize: number; total: number; pages: number };
type UserItem = {
  id: string; displayName: string; username: string | null; gender: "male" | "female"; role: "user" | "admin";
  accountStatus: string; createdAt: string; lastLoginAt: string | null; coupleId: string | null;
  partner: { id: string; displayName: string; username: string | null } | null; memoryCount: number; missionCount: number; dateCount: number;
};
type CoupleItem = {
  kind: "couple" | "invitation"; id: string; status: string; createdAt: string; startedAt?: string; endedAt?: string | null; expiresAt?: string;
  members: Array<{ id?: string; userId?: string; displayName: string; username: string | null }>;
  counts?: { dates: number; memories: number; missions: number };
  settings?: { intervalMin: number; intervalMax: number } | null;
};
type UserAction = "suspend" | "activate" | "clear-invitations";
type DisconnectReason = "user_request" | "wrong_connection" | "account_deletion" | "operations" | "custom";

const dateTime = (value: string | null | undefined) => value ? new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "기록 없음";
const statusLabels: Record<string, string> = {
  active: "사용 중", suspended: "정지", pending_deletion: "삭제 처리 중", deleted: "삭제됨", user: "일반", admin: "관리자",
  ended: "연결 종료", pending: "초대 대기", waiting: "발송 대기", paused: "일시 정지", completed: "완료", declined: "거절", cancelled: "취소", expired: "만료",
};
const reasonLabels: Record<DisconnectReason, string> = {
  user_request: "사용자 요청", wrong_connection: "잘못 연결됨", account_deletion: "계정 삭제", operations: "운영 처리", custom: "직접 입력",
};

export function AdminDashboard() {
  const [section, setSection] = useState<Section>("overview");
  return <div className="admin-dashboard"><nav className="admin-section-tabs" aria-label="관리자 메뉴">{sections.map((item) => <button key={item.id} type="button" aria-current={section === item.id ? "page" : undefined} onClick={() => setSection(item.id)}>{item.label}</button>)}</nav>{section === "overview" && <Overview />}{section === "users" && <Users />}{section === "couples" && <Couples />}{section === "tests" && <AdminTestPanel />}{section === "logs" && <Logs />}</div>;
}

function Overview() {
  const [data, setData] = useState<{ counts: Record<string, number>; recentTests: Array<{ id: string; missionStatus: string; deliveryStatus: string; recipientName: string; templateId: string | null; createdAt: string }> } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { void apiFetch<typeof data>("/api/admin/overview").then(setData).catch(() => setError("관리 현황을 불러오지 못했어요")); }, []);
  if (error) return <InlineNotice tone="error">{error}</InlineNotice>;
  if (!data) return <p className="admin-loading">관리 장부를 펼치고 있어요</p>;
  const labels: Record<string, string> = { accounts: "전체 계정", activeAccounts: "활성 계정", unpairedAccounts: "연결 없는 계정", activeCouples: "활성 연결", pendingInvites: "대기 초대", endedCouples: "종료 연결", dates: "약속", memories: "추억", newAccounts7d: "7일 새 계정", newMemories7d: "7일 새 추억" };
  return <section className="admin-file-section"><div className="admin-stat-grid">{Object.entries(data.counts).map(([key, value]) => <article key={key}><span>{labels[key] ?? key}</span><strong>{value.toLocaleString("ko-KR")}</strong></article>)}</div><div className="admin-ledger-block"><h2>최근 테스트 전달</h2>{data.recentTests.length === 0 ? <p className="muted">아직 전달 기록이 없어요</p> : <div className="admin-list">{data.recentTests.map((item) => <article key={item.id}><div><strong>{item.recipientName}</strong><p>{item.templateId ?? "미션"} · {statusLabels[item.missionStatus] ?? item.missionStatus}</p></div><time>{dateTime(item.createdAt)}</time></article>)}</div>}</div></section>;
}

function Users() {
  const [items, setItems] = useState<UserItem[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 20, total: 0, pages: 1 });
  const [q, setQ] = useState(""); const [role, setRole] = useState(""); const [status, setStatus] = useState("");
  const [connection, setConnection] = useState(""); const [sort, setSort] = useState("newest"); const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null); const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), q, role, status, connection, sort });
    try { const result = await apiFetch<{ items: UserItem[]; pagination: Pagination }>(`/api/admin/users?${params}`); setItems(result.items); setPagination(result.pagination); setError(""); }
    catch { setError("계정 목록을 불러오지 못했어요"); }
  }, [connection, page, q, role, sort, status]);
  useEffect(() => { const timer = window.setTimeout(() => void refresh(), 180); return () => window.clearTimeout(timer); }, [refresh]);
  return <section className="admin-file-section">
    <div className="admin-filters">
      <Field label="이름·아이디·계정 ID"><Input value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }} placeholder="계정을 찾아요" /></Field>
      <Field label="역할"><Select value={role} onChange={(event) => { setRole(event.target.value); setPage(1); }}><option value="">전체</option><option value="user">일반</option><option value="admin">관리자</option></Select></Field>
      <Field label="상태"><Select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">삭제 제외</option><option value="all">전체</option><option value="active">사용 중</option><option value="suspended">정지</option><option value="pending_deletion">삭제 처리 중</option><option value="deleted">삭제됨</option></Select></Field>
      <Field label="연결"><Select value={connection} onChange={(event) => { setConnection(event.target.value); setPage(1); }}><option value="">전체</option><option value="connected">연결됨</option><option value="unpaired">연결 없음</option></Select></Field>
      <Field label="정렬"><Select value={sort} onChange={(event) => setSort(event.target.value)}><option value="newest">최근 가입</option><option value="oldest">오래된 가입</option><option value="name">이름</option><option value="username">아이디</option><option value="last-login">최근 로그인</option><option value="memories">추억 수</option><option value="missions">미션 수</option></Select></Field>
    </div>
    {error && <InlineNotice tone="error">{error}</InlineNotice>}
    <div className="admin-list admin-user-list">{items.map((user) => <article key={user.id}><button type="button" onClick={() => setSelected(user.id)}><div className="admin-list-title"><strong>{user.displayName}</strong><span>@{user.username ?? "전환 전"}</span><span>{user.gender === "male" ? "남성 · 남자친구" : "여성 · 여자친구"}</span></div><div className="admin-list-meta"><StatusSticker tone={user.accountStatus === "active" ? "active" : "expired"}>{statusLabels[user.accountStatus] ?? user.accountStatus}</StatusSticker><span>{statusLabels[user.role]}</span><span>{user.partner ? `${user.partner.displayName}님과 연결` : "연결 없음"}</span><span>추억 {user.memoryCount}</span><span>약속 {user.dateCount}</span><span>미션 {user.missionCount}</span></div><small>가입 {dateTime(user.createdAt)} · 최근 로그인 {dateTime(user.lastLoginAt)}</small></button></article>)}</div>
    <Pager value={pagination} onChange={setPage} />
    {selected && <UserDetail id={selected} onClose={() => setSelected(null)} onChanged={() => { setSelected(null); void refresh(); }} />}
  </section>;
}

function UserDetail({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const [data, setData] = useState<{ user: UserItem; relationship: { coupleId: string; joinedAt: string; partner: { displayName: string; username: string | null } | null } | null; counts: Record<string, number> } | null>(null);
  const [confirm, setConfirm] = useState<UserAction | null>(null); const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0);
  const [typedUsername, setTypedUsername] = useState(""); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  useEffect(() => { void apiFetch<typeof data>(`/api/admin/users/${id}`).then(setData).catch(() => setMessage("계정 기록을 불러오지 못했어요")); }, [id]);
  async function runAction() {
    if (!confirm) return; setBusy(true);
    try { await apiFetch(`/api/admin/users/${id}`, { method: "POST", body: JSON.stringify({ action: confirm }) }); onChanged(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "작업을 완료하지 못했어요"); setConfirm(null); }
    finally { setBusy(false); }
  }
  async function deleteAccount() {
    if (!data?.user.username || typedUsername !== data.user.username) return; setBusy(true); setMessage("");
    try { await apiFetch(`/api/admin/users/${id}`, { method: "POST", body: JSON.stringify({ action: "delete", username: typedUsername }) }); onChanged(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "계정을 삭제하지 못했어요"); }
    finally { setBusy(false); }
  }
  const deleted = data?.user.accountStatus === "deleted";
  return <aside className="admin-detail-sheet" aria-label="계정 상세"><button className="admin-sheet-close" onClick={onClose} aria-label="계정 상세 닫기">닫기</button>{data && <>
    <p className="paper-label">ACCOUNT FILE</p><h2>{data.user.displayName}</h2>
    <dl><div><dt>계정 ID</dt><dd>{data.user.id}</dd></div><div><dt>아이디</dt><dd>@{data.user.username ?? "전환 전"}</dd></div><div><dt>성별과 관계</dt><dd>{data.user.gender === "male" ? "남성 · 남자친구" : "여성 · 여자친구"}</dd></div><div><dt>역할</dt><dd>{statusLabels[data.user.role]}</dd></div><div><dt>계정 상태</dt><dd>{statusLabels[data.user.accountStatus] ?? data.user.accountStatus}</dd></div><div><dt>가입</dt><dd>{dateTime(data.user.createdAt)}</dd></div><div><dt>최근 로그인</dt><dd>{dateTime(data.user.lastLoginAt)}</dd></div><div><dt>연결</dt><dd>{data.relationship?.partner ? `${data.relationship.partner.displayName} · ${data.relationship.partner.username ? `@${data.relationship.partner.username}` : "아이디 준비 중"}` : "연결 없음"}</dd></div>{Object.entries(data.counts).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>
    {!deleted && <div className="admin-detail-actions"><Button variant="secondary" onClick={() => setConfirm(data.user.accountStatus === "suspended" ? "activate" : "suspend")}>{data.user.accountStatus === "suspended" ? "정지 해제" : "계정 정지"}</Button><Button variant="quiet" onClick={() => setConfirm("clear-invitations")}>대기 초대 정리</Button></div>}
    {!deleted && <section className="admin-danger-zone"><h3>계정 관리</h3><p>계정 접근을 막고 연결과 예정 작업을 정리해요 기존 기록은 보관돼요</p>{deleteStep === 0 && <button type="button" onClick={() => setDeleteStep(1)}>계정 삭제</button>}{deleteStep === 1 && <div className="admin-danger-confirm"><h4>이 계정을 삭제할까요</h4><p>로그인과 새 활동은 중지되지만 작성한 추억과 약속, 미디어는 보존돼요 연결된 상대가 있다면 함께 쓰는 공간도 정리돼요</p><div><Button variant="quiet" size="small" onClick={() => setDeleteStep(0)}>취소</Button><Button variant="danger" size="small" onClick={() => setDeleteStep(2)}>계속</Button></div></div>}{deleteStep === 2 && <div className="admin-danger-confirm"><p>확인을 위해 <strong>@{data.user.username}</strong>을 입력해 주세요</p><Field label="아이디"><Input value={typedUsername} onChange={(event) => setTypedUsername(event.target.value)} autoComplete="off" /></Field><div><Button variant="quiet" size="small" onClick={() => setDeleteStep(1)}>이전</Button><Button variant="danger" size="small" disabled={busy || !data.user.username || typedUsername !== data.user.username} onClick={() => void deleteAccount()}>{busy ? "삭제하고 있어요" : "계정 삭제하기"}</Button></div></div>}</section>}
  </>}{message && <InlineNotice tone="error">{message}</InlineNotice>}{confirm && <PaperConfirmDialog title={confirm === "suspend" ? "이 계정을 정지할까요" : confirm === "activate" ? "이 계정의 정지를 해제할까요" : "대기 중인 초대를 정리할까요"} description="관리 기록에 작업 내용과 시각이 남아요" confirmLabel="확인" busy={busy} onCancel={() => setConfirm(null)} onConfirm={() => void runAction()} />}</aside>;
}

function Couples() {
  const [items, setItems] = useState<CoupleItem[]>([]); const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 15, total: 0, pages: 1 });
  const [q, setQ] = useState(""); const [status, setStatus] = useState("all"); const [page, setPage] = useState(1); const [selected, setSelected] = useState<string | null>(null);
  const refresh = useCallback(async () => { const params = new URLSearchParams({ page: String(page), q, status }); const result = await apiFetch<{ items: CoupleItem[]; pagination: Pagination }>(`/api/admin/couples?${params}`); setItems(result.items); setPagination(result.pagination); }, [page, q, status]);
  useEffect(() => { void refresh(); }, [refresh]);
  return <section className="admin-file-section"><div className="admin-filters compact"><Field label="이름 또는 아이디"><Input value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }} /></Field><Field label="관계 상태"><Select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="all">전체</option><option value="active">활성 연결</option><option value="pending">초대 대기</option><option value="ended">종료 연결</option></Select></Field></div><div className="admin-list">{items.map((item) => <article key={`${item.kind}-${item.id}`}><button type="button" disabled={item.kind !== "couple"} onClick={() => item.kind === "couple" && setSelected(item.id)}><div><strong>{item.members.map((member) => member.displayName).join(" · ") || "연결 정보 없음"}</strong><p>{item.members.map((member) => `@${member.username ?? "전환 전"}`).join(" · ")}</p></div><div className="admin-list-meta"><StatusSticker tone={item.status === "active" ? "active" : item.status === "pending" ? "neutral" : "expired"}>{statusLabels[item.status] ?? item.status}</StatusSticker>{item.counts && <span>약속 {item.counts.dates} · 추억 {item.counts.memories} · 미션 {item.counts.missions}</span>}{item.settings && <span>{item.settings.intervalMin}~{item.settings.intervalMax}분</span>}</div><time>{dateTime(item.createdAt)}</time></button></article>)}</div><Pager value={pagination} onChange={setPage} />{selected && <CoupleDetail id={selected} onClose={() => setSelected(null)} onChanged={() => { setSelected(null); void refresh(); }} />}</section>;
}

function CoupleDetail({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const [data, setData] = useState<{ couple: { status: string; startedAt: string; endedAt: string | null; disconnectedAt: string | null; initiatedByUserId: string | null; initiatedByAdminId: string | null; disconnectReason: string | null }; members: Array<{ id: string; displayName: string; username: string | null; accountStatus: string }>; settings: { timezone: string; weeklyMissionLimit: number; randomMissionIntervalMin: number; randomMissionIntervalMax: number } | null; dateStatuses: Array<{ status: string; value: number }>; missionStatuses: Array<{ status: string; value: number }>; memoryCount: number; invitations: Array<{ status: string; createdAt: string }>; recentDates: Array<{ id: string; status: string; startAt: string }>; recentMemories: Array<{ id: string; type: string; createdAt: string }>; missionSchedules: Array<{ id: string; eventTitle: string | null; eventStartAt: string; eventEndAt: string; status: string; nextMissionAt: string | null; lastMissionAt: string | null; missionsSentCount: number; maleReceivedCount: number; femaleReceivedCount: number; openMissionCount: number }> } | null>(null);
  const [step, setStep] = useState<0 | 1 | 2>(0); const [reason, setReason] = useState<DisconnectReason>("user_request"); const [customReason, setCustomReason] = useState(""); const [phrase, setPhrase] = useState(""); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  useEffect(() => { void apiFetch<typeof data>(`/api/admin/couples/${id}`).then(setData).catch(() => setMessage("연결 기록을 불러오지 못했어요")); }, [id]);
  async function disconnect() {
    if (phrase !== "연결을 정리할게요" || (reason === "custom" && !customReason.trim())) return;
    setBusy(true); setMessage("");
    try { await apiFetch(`/api/admin/couples/${id}`, { method: "POST", body: JSON.stringify({ action: "disconnect", reason, customReason: reason === "custom" ? customReason : undefined, phrase }) }); onChanged(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "연결을 정리하지 못했어요"); }
    finally { setBusy(false); }
  }
  return <aside className="admin-detail-sheet" aria-label="연결 상세"><button className="admin-sheet-close" onClick={onClose}>닫기</button>{data && <><p className="paper-label">COUPLE FILE</p><h2>{data.members.map((member) => member.displayName).join(" · ")}</h2><dl><div><dt>상태</dt><dd>{statusLabels[data.couple.status] ?? data.couple.status}</dd></div><div><dt>연결 시작</dt><dd>{dateTime(data.couple.startedAt)}</dd></div><div><dt>연결 종료</dt><dd>{dateTime(data.couple.disconnectedAt ?? data.couple.endedAt)}</dd></div>{data.couple.status === "ended" && <><div><dt>정리 주체</dt><dd>{data.couple.initiatedByAdminId ? "관리자" : data.couple.initiatedByUserId ? "사용자" : "이전 기록"}</dd></div><div><dt>정리 사유</dt><dd>{data.couple.disconnectReason ?? "기록 없음"}</dd></div></>}<div><dt>추억 수</dt><dd>{data.memoryCount}</dd></div><div><dt>랜덤 간격</dt><dd>{data.settings ? `${data.settings.randomMissionIntervalMin}~${data.settings.randomMissionIntervalMax}분` : "설정 없음"}</dd></div><div><dt>약속 상태</dt><dd>{data.dateStatuses.map((item) => `${item.status} ${item.value}`).join(" · ") || "기록 없음"}</dd></div><div><dt>미션 상태</dt><dd>{data.missionStatuses.map((item) => `${item.status} ${item.value}`).join(" · ") || "기록 없음"}</dd></div></dl><h3>랜덤 발송 상태</h3><div className="admin-schedule-list">{data.missionSchedules.length ? data.missionSchedules.map((schedule) => <article key={schedule.id}><strong>{schedule.eventTitle || "이름 없는 약속"}</strong><span>{dateTime(schedule.eventStartAt)} ~ {dateTime(schedule.eventEndAt)}</span><dl><div><dt>상태</dt><dd>{statusLabels[schedule.status] ?? schedule.status}</dd></div><div><dt>설정 간격</dt><dd>{data.settings ? `${data.settings.randomMissionIntervalMin}~${data.settings.randomMissionIntervalMax}분` : "설정 없음"}</dd></div><div><dt>마지막 발송</dt><dd>{dateTime(schedule.lastMissionAt)}</dd></div><div><dt>다음 발송</dt><dd>{schedule.nextMissionAt ? dateTime(schedule.nextMissionAt) : "예정 없음"}</dd></div><div><dt>발송 수</dt><dd>{schedule.missionsSentCount}</dd></div><div><dt>남자친구</dt><dd>{schedule.maleReceivedCount}</dd></div><div><dt>여자친구</dt><dd>{schedule.femaleReceivedCount}</dd></div><div><dt>열린 미션</dt><dd>{schedule.openMissionCount}</dd></div></dl></article>) : <p className="muted">랜덤 발송 일정이 없어요</p>}</div><h3>계정 상태</h3>{data.members.map((member) => <p key={member.id}>{member.displayName} · {member.username ? `@${member.username}` : "아이디 준비 중"} · {statusLabels[member.accountStatus] ?? member.accountStatus}</p>)}<h3>최근 활동</h3>{data.recentDates.map((item) => <p key={item.id}>약속 · {statusLabels[item.status] ?? item.status} · {dateTime(item.startAt)}</p>)}{data.recentMemories.map((item) => <p key={item.id}>추억 · {item.type} · {dateTime(item.createdAt)}</p>)}{data.recentDates.length + data.recentMemories.length === 0 && <p className="muted">최근 활동이 없어요</p>}<h3>초대 기록</h3>{data.invitations.length ? data.invitations.map((item, index) => <p key={`${item.createdAt}-${index}`}>{statusLabels[item.status] ?? item.status} · {dateTime(item.createdAt)}</p>) : <p className="muted">초대 기록이 없어요</p>}
    {data.couple.status === "active" && <section className="admin-danger-zone"><h3>연결 관리</h3><p>두 계정의 기록은 보존하고 앞으로의 공동 작업만 중지해요</p>{step === 0 && <button type="button" onClick={() => setStep(1)}>연결 정리</button>}{step === 1 && <div className="admin-danger-confirm"><h4>이 연결을 정리할까요</h4><p>{data.members.map((member) => `${member.displayName} ${member.username ? `@${member.username}` : "아이디 준비 중"}`).join(" · ")} · {dateTime(data.couple.startedAt)}부터 연결</p><Field label="처리 사유"><Select value={reason} onChange={(event) => setReason(event.target.value as DisconnectReason)}>{Object.entries(reasonLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field>{reason === "custom" && <Field label="직접 입력"><Input value={customReason} onChange={(event) => setCustomReason(event.target.value.slice(0, 200))} maxLength={200} /></Field>}<div><Button variant="quiet" size="small" onClick={() => setStep(0)}>취소</Button><Button variant="danger" size="small" disabled={reason === "custom" && !customReason.trim()} onClick={() => setStep(2)}>계속</Button></div></div>}{step === 2 && <div className="admin-danger-confirm"><p>아래 문구를 그대로 입력해 주세요</p><strong>연결을 정리할게요</strong><Field label="확인 문구"><Input value={phrase} onChange={(event) => setPhrase(event.target.value)} autoComplete="off" /></Field><div><Button variant="quiet" size="small" onClick={() => setStep(1)}>이전</Button><Button variant="danger" size="small" disabled={busy || phrase !== "연결을 정리할게요"} onClick={() => void disconnect()}>{busy ? "정리하고 있어요" : "연결 정리하기"}</Button></div></div>}</section>}
  </>}{message && <InlineNotice tone="error">{message}</InlineNotice>}</aside>;
}

function Logs() {
  const [items, setItems] = useState<Array<{ id: number; action: string; entityType: string | null; entityId: string | null; metadata: Record<string, string | number | boolean | null>; createdAt: string; actor: { displayName: string; username: string | null } | null }>>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 20, total: 0, pages: 1 }); const [page, setPage] = useState(1);
  useEffect(() => { void apiFetch<{ items: typeof items; pagination: Pagination }>(`/api/admin/logs?page=${page}`).then((result) => { setItems(result.items); setPagination(result.pagination); }); }, [page]);
  return <section className="admin-file-section"><div className="admin-list admin-log-list">{items.map((item) => <article key={item.id}><div><strong>{item.action}</strong><p>{item.actor ? `${item.actor.displayName} · @${item.actor.username ?? "전환 전"}` : "시스템"}</p></div><span>{item.entityType ?? "기록"}{item.entityId ? ` · ${item.entityId.slice(0, 8)}` : ""}</span><time>{dateTime(item.createdAt)}</time></article>)}</div><Pager value={pagination} onChange={setPage} /></section>;
}

function Pager({ value, onChange }: { value: Pagination; onChange: (page: number) => void }) {
  return <nav className="admin-pager" aria-label="목록 페이지"><Button variant="quiet" size="small" disabled={value.page <= 1} onClick={() => onChange(value.page - 1)}>이전</Button><span>{value.page} / {value.pages} · {value.total}개</span><Button variant="quiet" size="small" disabled={value.page >= value.pages} onClick={() => onChange(value.page + 1)}>다음</Button></nav>;
}
