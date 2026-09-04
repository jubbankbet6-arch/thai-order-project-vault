import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/useMobile";
import { trpc } from "@/lib/trpc";
import { Check, ChevronDown, CircleUserRound, Clipboard, ImagePlus, LoaderCircle, MessageCircle, RefreshCw, Search, Send, Sparkles, Users, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

function timeLabel(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function imageUrls(value: string | null | undefined) {
  if (!value) return [];
  try {
    const attachments = JSON.parse(value) as unknown;
    const urls: string[] = [];
    const walk = (item: unknown) => {
      if (!item || typeof item !== "object") return;
      const record = item as Record<string, unknown>;
      for (const candidate of [record.url, record.file_url, (record.payload as Record<string, unknown> | undefined)?.url]) {
        if (typeof candidate === "string" && /^https?:\/\//i.test(candidate) && !urls.includes(candidate)) urls.push(candidate);
      }
      Object.values(record).forEach(child => Array.isArray(child) && child.forEach(walk));
    };
    if (Array.isArray(attachments)) attachments.forEach(walk); else walk(attachments);
    return urls;
  } catch { return []; }
}

function isPageTimelineLine(line: string) { return /\[\s*เพจ\s*[:：]/i.test(line); }
function isCustomerTimelineLine(line: string) { return /\[\s*ลูกค้า\s*[:：]/i.test(line); }

const quickReplies = [
  "สวัสดีค่ะ สนใจรับกี่คอตดีคะ?",
  "มีบริการเก็บเงินปลายทางค่ะ",
  "ขอชื่อ ที่อยู่ และเบอร์โทรสำหรับจัดส่งด้วยค่ะ",
  "ขอบคุณค่ะ เดี๋ยวแอดมินรีบเช็กให้ค่ะ",
];

export default function ChatHub() {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pageFilterOpen, setPageFilterOpen] = useState(false);
  const [selectedPages, setSelectedPages] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | "unread" | "ordered">("all");
  const [replyText, setReplyText] = useState("");
  const [replyImageUrl, setReplyImageUrl] = useState("");
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryText, setSummaryText] = useState("");
  const [summary, setSummary] = useState<{ orderNumber: string; copyText: string } | null>(null);
  const [messageFilter, setMessageFilter] = useState<"all" | "customer" | "page">("all");
  const [copied, setCopied] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [orderDetailOpen, setOrderDetailOpen] = useState(false);
  const chatTimelineRef = useRef<HTMLDivElement>(null);
  const threadsQuery = trpc.orders.threads.useQuery(undefined, { refetchInterval: 60_000 });
  const threads = threadsQuery.data ?? [];
  const availablePages = useMemo<Array<[string, string]>>(
    () => Array.from(new Map(threads.filter(thread => thread.pageId && thread.pageName && thread.pageName !== "ไม่ระบุเพจ").map(thread => [thread.pageId as string, thread.pageName as string] as [string, string])).entries()).sort((a, b) => a[1].localeCompare(b[1], "th")),
    [threads],
  );
  const filteredThreads = useMemo(() => {
    const query = search.trim().toLowerCase();
    return threads.filter(thread => {
      const matchesPage = selectedPages.length === 0 || Boolean(thread.pageId && selectedPages.includes(thread.pageId));
      const matchesStatus = statusFilter === "all" || (statusFilter === "unread" ? thread.unread : thread.orderCount > 0);
      const matchesSearch = !query || [thread.customerName, thread.pageName, thread.preview, thread.searchText, thread.latestOrderNumber].some(value => String(value ?? "").toLowerCase().includes(query));
      return matchesPage && matchesStatus && matchesSearch;
    });
  }, [threads, search, selectedPages, statusFilter]);
  const selected = filteredThreads.find(thread => thread.key === selectedKey) ?? filteredThreads[0];
  const selectedPageId = selected?.pageId ?? selected?.orders[0]?.page_id ?? "";
  const selectedThreadId = selected?.threadId ?? "";
  const messagesQuery = trpc.chat.messages.useQuery({ pageId: selectedPageId, threadId: selectedThreadId }, { enabled: Boolean(selectedPageId && selectedThreadId), refetchInterval: 10_000 });
  const linkedOrdersQuery = trpc.orders.forThread.useQuery({ pageId: selectedPageId, threadId: selectedThreadId }, { enabled: Boolean(selectedPageId && selectedThreadId), refetchInterval: 60_000 });
  const totalMessages = useMemo(() => threads.reduce((total, thread) => total + thread.messageCount, 0), [threads]);
  const sendReply = trpc.chat.sendReply.useMutation({ onSuccess: () => { setReplyText(""); setReplyImageUrl(""); messagesQuery.refetch(); } });
  const generateSummary = trpc.orders.generateSummary.useMutation({ onSuccess: result => { setSummary(result); setSummaryText(""); setSummaryOpen(false); setReplyText(result.copyText); } });

  useEffect(() => { if (!selectedKey && filteredThreads[0]) setSelectedKey(filteredThreads[0].key); }, [filteredThreads, selectedKey]);
  useEffect(() => { if (selectedKey && !filteredThreads.some(thread => thread.key === selectedKey)) setSelectedKey(filteredThreads[0]?.key ?? null); }, [filteredThreads, selectedKey]);
  useEffect(() => {
    const element = chatTimelineRef.current;
    if (!element) return;
    const frame = window.requestAnimationFrame(() => element.scrollTo({ top: element.scrollHeight, behavior: "smooth" }));
    return () => window.cancelAnimationFrame(frame);
  }, [selectedKey, messagesQuery.data?.length, messageFilter]);

  const sendCurrentReply = () => {
    if (!selectedPageId || !selectedThreadId || (!replyText.trim() && !replyImageUrl.trim())) return;
    sendReply.mutate({ pageId: selectedPageId, threadId: selectedThreadId, recipientId: selectedThreadId, text: replyText.trim() || undefined, imageUrl: replyImageUrl.trim() || undefined });
  };
  const copySummary = async () => {
    if (!replyText.trim()) return;
    await navigator.clipboard.writeText(replyText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };
  const visibleTimeline = (selected?.chatTimeline ?? []).filter(line => messageFilter === "all" || (messageFilter === "page" ? isPageTimelineLine(line) : isCustomerTimelineLine(line)));
  const visibleStoredMessages = (messagesQuery.data ?? []).filter(message => messageFilter === "all" || (messageFilter === "page" ? message.direction === "outbound" : message.direction === "inbound"));

  const composer = <div className="border-t border-violet-500/10 pt-2">
    <div className="mb-2 flex flex-wrap gap-1.5">
      {quickReplies.map(reply => <button key={reply} type="button" onClick={() => setReplyText(reply)} className="rounded-lg border border-fuchsia-400/15 bg-fuchsia-500/[0.06] px-2 py-1 text-[10px] text-fuchsia-200/75 transition hover:bg-fuchsia-500/20 hover:text-fuchsia-100">{reply}</button>)}
    </div>
    <div className="flex gap-2"><Input value={replyText} onChange={event => setReplyText(event.target.value)} placeholder="พิมพ์ตอบลูกค้า…" className="border-violet-500/15 bg-black/25 text-white placeholder:text-violet-100/25" onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendCurrentReply(); } }} /><Button aria-label="ส่งข้อความ" disabled={sendReply.isPending || (!replyText.trim() && !replyImageUrl.trim())} onClick={sendCurrentReply} className="shrink-0 rounded-xl bg-gradient-to-r from-fuchsia-600 to-violet-600"><Send className="h-4 w-4" /></Button></div>
    <div className="mt-1 flex items-center gap-2"><ImagePlus className="h-3.5 w-3.5 text-violet-100/35" /><Input value={replyImageUrl} onChange={event => setReplyImageUrl(event.target.value)} placeholder="URL รูปภาพ (ถ้ามี)" className="h-7 border-violet-500/10 bg-black/20 text-xs text-white placeholder:text-violet-100/20" /><span className="whitespace-nowrap text-[10px] text-violet-100/25">Meta API</span></div>
    {sendReply.isError ? <p className="mt-2 text-[11px] text-amber-300">{sendReply.error.message.includes("No Meta page token") ? "เพจนี้ยังไม่ได้ตั้งค่า Page Access Token ในเซิร์ฟเวอร์" : `ส่งไม่สำเร็จ: ${sendReply.error.message}`}</p> : null}
  </div>;

  const conversation = selected ? <>
    <div className="flex items-center justify-between gap-3 border-b border-violet-500/10 px-5 py-3"><div className="flex min-w-0 items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-500/25 to-violet-500/25 text-fuchsia-200"><CircleUserRound className="h-5 w-5" /></div><div className="min-w-0"><h2 className="truncate text-base font-semibold text-white">{selected.customerName || "ลูกค้าใหม่"}</h2><div className="mt-1 flex items-center gap-2 text-[11px] text-violet-100/40"><span className="truncate">{selected.pageName}</span><span>·</span><span>{timeLabel(selected.latestAt)}</span></div></div></div><div className="flex items-center gap-2"><Badge className="hidden border border-emerald-400/25 bg-emerald-400/10 text-emerald-300 sm:inline-flex">● ONLINE</Badge><Button size="sm" variant="outline" onClick={() => setOrderDetailOpen(true)} className="rounded-xl border-amber-400/25 bg-amber-400/10 text-xs text-amber-200 hover:bg-amber-400/20">ออเดอร์ ({linkedOrdersQuery.data?.length ?? 0})</Button><Button size="sm" onClick={() => setSummaryOpen(true)} className="rounded-xl bg-fuchsia-600/80 text-xs hover:bg-fuchsia-500">สรุปออเดอร์</Button>{isMobile ? <button onClick={() => setMobileOpen(false)} className="rounded-xl p-2 text-violet-100/55 hover:bg-violet-500/10 hover:text-white" aria-label="ปิดห้องแชท"><X className="h-5 w-5" /></button> : null}</div></div>
    <div ref={chatTimelineRef} className="relative flex min-h-[430px] flex-col justify-end gap-3 overflow-y-auto bg-[radial-gradient(circle_at_70%_20%,rgba(168,85,247,0.09),transparent_32%),#0b0910] p-5">
      {messagesQuery.isFetching ? <div className="absolute right-4 top-4 z-10 inline-flex items-center gap-1.5 rounded-full border border-fuchsia-400/20 bg-[#15101d]/90 px-2.5 py-1 text-[10px] text-fuchsia-200"><LoaderCircle className="h-3 w-3 animate-spin" />กำลังอัปเดต</div> : null}
      {visibleStoredMessages.length === 0 ? <>{visibleTimeline.length ? visibleTimeline.map((line, index) => <div key={`${line}-${index}`} className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-lg ${isPageTimelineLine(line) ? "ml-auto rounded-br-md bg-gradient-to-br from-fuchsia-600/80 to-violet-600/80 text-white" : "rounded-bl-md border border-white/10 bg-white/[0.06] text-violet-50/85"}`}><p className="whitespace-pre-wrap">{line}</p></div>) : <div className="rounded-2xl border border-violet-500/10 bg-black/20 p-4 text-sm leading-6 text-violet-100/60"><p>{selected.preview}</p></div>}<p className="text-[11px] text-violet-100/30">แชทจากตารางกลาง · n8n API รอบถัดไปจะอัปเดตเข้าห้องนี้อัตโนมัติ</p></> : null}
      {[...visibleStoredMessages].reverse().map(message => { const isRight = ("side" in message && message.side === "right") || message.direction === "outbound" || message.senderType === "page"; const senderName = ("senderName" in message ? message.senderName : null) ?? (isRight ? "เพจ / แอดมิน" : "ลูกค้า"); return <div key={message.id} className={`flex w-full ${isRight ? "justify-end" : "justify-start"}`}><div className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-lg ${isRight ? "rounded-br-md bg-gradient-to-br from-fuchsia-600/80 to-violet-600/80 text-white" : "rounded-bl-md border border-white/10 bg-white/[0.06] text-violet-50/85"}`}><p className="mb-1 text-[10px] font-semibold uppercase tracking-wide opacity-60">{senderName}</p><p className="whitespace-pre-wrap">{message.text || "ส่งรูปภาพ"}</p>{imageUrls(message.attachmentsJson).map(url => <button key={url} type="button" onClick={() => setLightboxUrl(url)} className="mt-2 block cursor-zoom-in text-left"><img src={url} alt="ไฟล์แนบจากแชท คลิกเพื่อขยาย" className="max-h-56 rounded-xl object-cover transition hover:brightness-110" /></button>)}<p className="mt-1 text-[10px] opacity-50">{isRight ? "เพจ / แอดมิน" : "ลูกค้า"} · {timeLabel(String(message.occurredAt))}</p></div></div>; })}
    </div>
    <div className="border-t border-violet-500/10 bg-[#100d15] p-4"><div className="mb-3 flex flex-wrap items-center gap-1.5"><span className="mr-1 text-[10px] uppercase tracking-wider text-violet-100/35">ดูข้อความ</span>{([ ["all", "ทั้งหมด"], ["customer", "ลูกค้า"], ["page", "เพจ"] ] as const).map(([value, label]) => <button key={value} onClick={() => setMessageFilter(value)} className={`rounded-lg px-2.5 py-1 text-[10px] transition ${messageFilter === value ? "bg-fuchsia-500/20 text-fuchsia-200 ring-1 ring-fuchsia-400/30" : "text-violet-100/45 hover:bg-violet-500/10 hover:text-violet-100"}`}>{label}</button>)}</div>{summary ? <div className="mb-3 rounded-2xl border border-fuchsia-400/20 bg-fuchsia-500/[0.06] p-3"><div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold text-fuchsia-200">พรีวิวใบสรุป · {summary.orderNumber}</p><button onClick={() => setSummary(null)} className="text-[10px] text-violet-100/40 hover:text-white">ล้าง</button></div><p className="mt-1 text-[11px] text-violet-100/45">ตรวจข้อความด้านล่างให้ถูกต้องก่อนกดส่งให้ลูกค้า</p><Button variant="outline" size="sm" onClick={copySummary} className="mt-2 h-7 border-fuchsia-400/20 bg-transparent text-[10px] text-fuchsia-200">{copied ? <Check className="mr-1 h-3 w-3" /> : <Clipboard className="mr-1 h-3 w-3" />}{copied ? "คัดลอกแล้ว" : "คัดลอกข้อความสรุป"}</Button></div> : null}{composer}</div>
  </> : <div className="flex min-h-[560px] items-center justify-center text-sm text-violet-100/35">เลือกห้องแชทเพื่อเริ่มดูข้อความ</div>;

  return <div className="min-h-[calc(100vh-2rem)] bg-[#09070d] text-white"><div className="mx-auto max-w-[1600px] space-y-5 p-2 sm:p-4 lg:p-6">
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-violet-500/15 bg-[#100c19] px-4 py-2 text-[11px] text-violet-100/55"><span className="inline-flex items-center gap-1.5 text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />SYNC OK</span><span>รอบล่าสุด: {threadsQuery.dataUpdatedAt ? new Date(threadsQuery.dataUpdatedAt).toLocaleString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "กำลังโหลด"}</span><span className="text-violet-100/20">·</span><span><Users className="mr-1 inline h-3 w-3" />{totalMessages.toLocaleString("th-TH")} ข้อความจากตารางกลาง</span><span className="ml-auto text-violet-100/30">n8n API รอบละ 1 นาที</span></div>
    <header className="relative overflow-hidden rounded-3xl border border-violet-500/20 bg-[#100c19] px-6 py-7 shadow-2xl shadow-violet-950/20 sm:px-8"><div className="pointer-events-none absolute -right-24 -top-36 h-80 w-80 rounded-full bg-fuchsia-600/20 blur-3xl" /><div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div><div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.28em] text-fuchsia-300"><Sparkles className="h-4 w-4" /> NIGHTOPS · PAGE CHAT HUB</div><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">กล่องข้อความรวม</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-violet-100/55">กรองห้องตามเพจ สถานะอ่าน และออเดอร์ได้จากแถบด้านซ้าย</p></div><div className="flex flex-wrap items-center gap-2"><Badge className="border border-emerald-400/30 bg-emerald-400/10 text-emerald-300"><span className="mr-2 h-1.5 w-1.5 rounded-full bg-emerald-400" /> LIVE API · 60s</Badge><Button variant="outline" size="sm" onClick={() => threadsQuery.refetch()} className="border-violet-400/20 bg-violet-400/5 text-violet-100 hover:bg-violet-400/10"><RefreshCw className={`mr-2 h-3.5 w-3.5 ${threadsQuery.isFetching ? "animate-spin" : ""}`} /> รีเฟรช</Button></div></div></header>
    <div className="grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)]"><Card className="overflow-hidden rounded-3xl border-violet-500/15 bg-[#100d15] shadow-xl shadow-violet-950/10"><CardHeader className="border-b border-violet-500/10 pb-3"><div className="flex items-center justify-between"><CardTitle className="text-base">แชทส่วนตัว <span className="ml-1 text-xs font-normal text-violet-100/35">{filteredThreads.length}</span></CardTitle><button onClick={() => setPageFilterOpen(value => !value)} className={`flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] ${selectedPages.length ? "bg-fuchsia-500/15 text-fuchsia-200" : "text-violet-100/45 hover:bg-violet-500/10 hover:text-violet-100"}`}><span className="h-2 w-2 rounded-sm border border-current" />เพจ{selectedPages.length ? ` · ${selectedPages.length}` : ""}<ChevronDown className="h-3 w-3" /></button></div>
      <div className="relative mt-3"><Search className="absolute left-3 top-2.5 h-4 w-4 text-violet-100/30" /><Input value={search} onChange={event => setSearch(event.target.value)} placeholder="ค้นหาชื่อลูกค้าหรือข้อความ…" className="rounded-xl border-violet-500/15 bg-black/20 pl-9 text-white placeholder:text-violet-100/25 focus-visible:ring-fuchsia-400" />{pageFilterOpen ? <div className="absolute right-0 top-12 z-20 w-64 rounded-2xl border border-violet-400/20 bg-[#181020] p-3 shadow-2xl shadow-black/50"><div className="mb-2 flex items-center justify-between"><p className="text-[10px] font-semibold uppercase tracking-wider text-fuchsia-300">เลือกเพจ</p><button onClick={() => setSelectedPages([])} className="text-[10px] text-violet-100/40 hover:text-white">ล้าง</button></div>{availablePages.map(([pageId, pageName]) => <label key={pageId} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-xs text-violet-50/80 hover:bg-violet-500/10"><input type="checkbox" checked={selectedPages.includes(pageId)} onChange={event => setSelectedPages(current => event.target.checked ? [...current, pageId] : current.filter(item => item !== pageId))} className="accent-fuchsia-500" /> <span className="truncate">{pageName}</span></label>)}{!availablePages.length ? <p className="p-2 text-xs text-violet-100/35">ยังไม่มีรายชื่อเพจ</p> : null}</div> : null}</div>
      <div className="mt-3 flex flex-wrap gap-1.5">{([ ["all", "ทั้งหมด"], ["unread", "ยังไม่อ่าน"], ["ordered", "มีออเดอร์"] ] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setStatusFilter(value)} className={`rounded-lg px-2.5 py-1 text-[10px] transition ${statusFilter === value ? "bg-amber-400/15 text-amber-200 ring-1 ring-amber-300/25" : "text-violet-100/45 hover:bg-violet-500/10 hover:text-violet-100"}`}>{label}</button>)}</div></CardHeader><CardContent className="max-h-[700px] overflow-y-auto p-2">{threadsQuery.isLoading ? <div className="flex items-center justify-center gap-2 p-12 text-sm text-violet-100/40"><RefreshCw className="h-4 w-4 animate-spin" />กำลังโหลดห้อง…</div> : filteredThreads.length === 0 ? <div className="p-12 text-center text-sm text-violet-100/40"><MessageCircle className="mx-auto mb-3 h-8 w-8 text-violet-100/15" />ยังไม่มีห้องตามตัวกรอง</div> : filteredThreads.map((thread, index) => <button key={thread.key} onClick={() => { setSelectedKey(thread.key); if (isMobile) setMobileOpen(true); }} className={`relative mb-1 flex w-full items-start gap-3 rounded-2xl p-3.5 text-left transition ${selected?.key === thread.key ? "bg-fuchsia-500/[0.10] ring-1 ring-fuchsia-400/35" : "hover:bg-violet-400/[0.06]"}`}><span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${index % 2 ? "bg-violet-500/20 text-violet-200" : "bg-fuchsia-500/20 text-fuchsia-200"}`}>{(thread.customerName || "ลูกค้า").slice(0, 1)}</span><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-semibold text-violet-50">{thread.customerName || "ลูกค้าใหม่"}</span><span className="shrink-0 text-[10px] text-violet-100/35">{timeLabel(thread.latestAt)}</span></span><span className="mt-1 flex items-center gap-1.5 truncate text-[10px] text-fuchsia-200/55">{thread.unread ? <span className="rounded bg-amber-400/15 px-1 text-amber-200">ใหม่</span> : null}{thread.orderCount > 0 ? <span className="rounded bg-emerald-400/15 px-1 text-emerald-200">ORD {thread.orderCount}</span> : null}<span className="truncate">{thread.pageName}</span></span><span className="mt-1 block truncate text-xs text-violet-100/45">{thread.preview}</span></span></button>)}</CardContent></Card>
      <Card className="hidden overflow-hidden rounded-3xl border-violet-500/15 bg-[#100d15] shadow-xl shadow-violet-950/10 lg:block">{conversation}</Card>
    </div>
    {isMobile && mobileOpen ? <div className="fixed inset-0 z-50 flex items-end bg-black/75 p-2 backdrop-blur-sm"><div className="max-h-[94vh] w-full overflow-hidden rounded-3xl border border-fuchsia-400/25 bg-[#100d15] shadow-2xl shadow-fuchsia-950/30">{conversation}</div></div> : null}
    {summaryOpen ? <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"><div className="w-full max-w-2xl rounded-3xl border border-fuchsia-400/25 bg-[#15101d] p-5 shadow-2xl shadow-fuchsia-950/40"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-fuchsia-300">ADMIN ORDER SUMMARY</p><h3 className="mt-2 text-xl font-semibold text-white">สร้างใบสรุปออเดอร์ในห้องนี้</h3></div><button onClick={() => setSummaryOpen(false)} className="rounded-xl p-2 text-violet-100/50 hover:bg-violet-500/10 hover:text-white"><X className="h-5 w-5" /></button></div><Textarea autoFocus value={summaryText} onChange={event => setSummaryText(event.target.value)} placeholder="วางข้อความลูกค้าที่นี่…" className="mt-4 min-h-48 border-violet-500/20 bg-black/25 text-sm leading-6 text-white placeholder:text-violet-100/25" /><div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={() => setSummaryOpen(false)} className="border-violet-400/20 bg-transparent text-violet-100/70">ยกเลิก</Button><Button disabled={!summaryText.trim() || generateSummary.isPending} onClick={() => generateSummary.mutate({ rawText: summaryText, pageId: selectedPageId || undefined, threadId: selectedThreadId || undefined })} className="bg-gradient-to-r from-fuchsia-600 to-violet-600">{generateSummary.isPending ? "กำลังอ่าน…" : "สรุปออเดอร์"}</Button></div></div></div> : null}
    {orderDetailOpen ? <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"><div className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-amber-400/25 bg-[#15101d] p-5 shadow-2xl"><div className="flex items-center justify-between"><div><p className="text-xs uppercase tracking-[0.2em] text-amber-300">LINKED ORDERS</p><h3 className="mt-1 text-xl font-semibold text-white">ออเดอร์ของ {selected?.customerName || "ลูกค้ารายนี้"}</h3></div><button onClick={() => setOrderDetailOpen(false)} className="rounded-xl p-2 text-violet-100/50 hover:bg-violet-500/10 hover:text-white"><X className="h-5 w-5" /></button></div>{linkedOrdersQuery.isLoading || linkedOrdersQuery.isFetching ? <div className="mt-8 flex items-center justify-center gap-2 text-sm text-violet-100/50"><LoaderCircle className="h-4 w-4 animate-spin text-amber-300" />กำลังค้นหาออเดอร์…</div> : linkedOrdersQuery.data?.length ? <div className="mt-4 space-y-3">{linkedOrdersQuery.data.map(order => <div key={order.order_number} className="rounded-2xl border border-amber-400/15 bg-amber-400/[0.05] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold text-amber-100">{order.order_number}</p><span className="text-xs text-violet-100/50">COD {order.cod_amount ?? order.expected_cod ?? "—"} บาท</span></div><p className="mt-2 text-sm text-violet-100/75">{order.customer_name || "ไม่ระบุชื่อ"} · {order.phone || "ไม่ระบุเบอร์"}</p><p className="mt-1 text-xs leading-5 text-violet-100/50">{order.full_address || "ไม่ระบุที่อยู่"}</p><p className="mt-2 text-xs text-fuchsia-200/70">{order.items.map(item => item.label_display || item.telegram_final_mapped || item.display_for_packer || item.sku).filter(Boolean).join(" · ") || "ไม่ระบุสินค้า"}</p></div>)}</div> : <p className="mt-5 rounded-2xl border border-violet-500/10 bg-black/20 p-4 text-sm text-violet-100/50">ยังไม่พบออเดอร์ที่เชื่อมกับห้องนี้</p>}</div></div> : null}
    {lightboxUrl ? <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 p-4" onClick={() => setLightboxUrl(null)}><img src={lightboxUrl} alt="รูปภาพขนาดเต็ม" className="max-h-[92vh] max-w-[94vw] rounded-2xl object-contain shadow-2xl" /></div> : null}
    <footer className="flex items-center gap-2 px-2 text-[11px] text-violet-100/30"><MessageCircle className="h-3.5 w-3.5" />n8n API → Supabase ทุก 1 นาที · ห้องแชทอ่านจากตารางกลาง · ทุกการตอบกลับบันทึก Audit Log</footer>
  </div></div>;
}
