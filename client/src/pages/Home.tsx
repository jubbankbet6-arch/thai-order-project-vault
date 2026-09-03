import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import {
  Archive,
  CheckCircle2,
  Code2,
  Database,
  FileCode2,
  FileJson2,
  FileText,
  FolderKanban,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Terminal,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const kindLabels: Record<string, string> = {
  code: "โค้ด",
  sql: "SQL",
  workflow: "Workflow",
  document: "เอกสาร",
  config: "ตั้งค่า",
  other: "อื่น ๆ",
};

const kindColors: Record<string, string> = {
  code: "bg-blue-50 text-blue-700 border-blue-200",
  sql: "bg-emerald-50 text-emerald-700 border-emerald-200",
  workflow: "bg-violet-50 text-violet-700 border-violet-200",
  document: "bg-amber-50 text-amber-700 border-amber-200",
  config: "bg-slate-100 text-slate-700 border-slate-200",
  other: "bg-slate-100 text-slate-600 border-slate-200",
};

function fileIcon(kind: string) {
  if (kind === "sql") return <Database className="h-4 w-4 text-emerald-600" />;
  if (kind === "workflow") return <FileJson2 className="h-4 w-4 text-violet-600" />;
  if (kind === "code") return <FileCode2 className="h-4 w-4 text-blue-600" />;
  if (kind === "document") return <FileText className="h-4 w-4 text-amber-600" />;
  return <Archive className="h-4 w-4 text-slate-500" />;
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "ยังไม่มีข้อมูล";
  return new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

export default function Home() {
  const utils = trpc.useUtils();
  const { data: projects = [], isLoading: projectsLoading } = trpc.vault.projects.useQuery();
  const { data: stats } = trpc.vault.stats.useQuery();
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [selectedFileId, setSelectedFileId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [editorTitle, setEditorTitle] = useState("");
  const [editorPath, setEditorPath] = useState("");
  const [editorLanguage, setEditorLanguage] = useState("text");
  const [editorKind, setEditorKind] = useState<"code" | "sql" | "workflow" | "document" | "config" | "other">("code");
  const [editorContent, setEditorContent] = useState("");
  const [editorFavorite, setEditorFavorite] = useState(false);

  useEffect(() => {
    if (selectedProjectId === null && projects[0]) setSelectedProjectId(projects[0].id);
  }, [projects, selectedProjectId]);

  useEffect(() => {
    setSelectedFileId(null);
    setEditorTitle("");
    setEditorPath("");
    setEditorLanguage("text");
    setEditorKind("code");
    setEditorContent("");
  }, [selectedProjectId]);

  const { data: files = [], isLoading: filesLoading } = trpc.vault.files.useQuery(
    { projectId: selectedProjectId ?? 0, search: search || undefined },
    { enabled: selectedProjectId !== null },
  );
  const { data: selectedFile } = trpc.vault.file.useQuery(
    { fileId: selectedFileId ?? 0 },
    { enabled: selectedFileId !== null },
  );

  useEffect(() => {
    if (!selectedFile || selectedFile.id !== selectedFileId) return;
    setEditorTitle(selectedFile.title);
    setEditorPath(selectedFile.path);
    setEditorLanguage(selectedFile.language);
    setEditorKind(selectedFile.kind);
    setEditorContent(selectedFile.content);
    setEditorFavorite(selectedFile.isFavorite);
  }, [selectedFile, selectedFileId]);

  const selectedProject = useMemo(
    () => projects.find(project => project.id === selectedProjectId),
    [projects, selectedProjectId],
  );
  const sqlCount = files.filter(file => file.kind === "sql").length;
  const workflowCount = files.filter(file => file.kind === "workflow").length;

  const createProject = trpc.vault.createProject.useMutation({
    onSuccess: project => {
      if (project) {
        setSelectedProjectId(project.id);
        setProjectName("");
        setProjectDescription("");
      }
      utils.vault.projects.invalidate();
      utils.vault.stats.invalidate();
    },
  });
  const createFile = trpc.vault.createFile.useMutation({
    onSuccess: file => {
      if (file) setSelectedFileId(file.id);
      utils.vault.files.invalidate();
      utils.vault.stats.invalidate();
    },
  });
  const updateFile = trpc.vault.updateFile.useMutation({
    onSuccess: file => {
      if (file) setSelectedFileId(file.id);
      utils.vault.files.invalidate();
      utils.vault.file.invalidate();
      utils.vault.stats.invalidate();
    },
  });

  const startNewFile = () => {
    setSelectedFileId(null);
    setEditorTitle("ไฟล์ใหม่");
    setEditorPath("notes/new-file.txt");
    setEditorLanguage("text");
    setEditorKind("document");
    setEditorContent("");
    setEditorFavorite(false);
  };

  const saveFile = () => {
    if (!selectedProjectId || !editorTitle.trim() || !editorPath.trim()) return;
    const payload = {
      projectId: selectedProjectId,
      title: editorTitle,
      path: editorPath,
      language: editorLanguage,
      kind: editorKind,
      content: editorContent,
    } as const;
    if (selectedFileId) updateFile.mutate({ ...payload, fileId: selectedFileId, isFavorite: editorFavorite });
    else createFile.mutate(payload);
  };

  return (
    <div className="min-h-[calc(100vh-2rem)] bg-[#f6f8fb] text-slate-950">
      <div className="mx-auto max-w-[1600px] space-y-5 p-2 sm:p-4 lg:p-6">
        <header className="flex flex-col gap-5 rounded-3xl bg-slate-950 px-6 py-7 text-white shadow-2xl shadow-slate-200 sm:px-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">
              <Sparkles className="h-4 w-4" />
              private project vault
            </div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">คลังโปรเจกต์ Thai Order</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300 sm:text-base">
              รวม SQL, โค้ด n8n, workflow และเอกสารสำคัญไว้ในที่เดียว พร้อมประวัติการแก้ไขและค้นหาไฟล์ได้เร็วขึ้น
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-slate-200 backdrop-blur">
            <ShieldCheck className="h-5 w-5 text-emerald-300" />
            <span>พื้นที่ส่วนตัว ต้องเข้าสู่ระบบก่อนใช้งาน</span>
          </div>
        </header>

        <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="space-y-4">
            <Card className="overflow-hidden rounded-3xl border-slate-200/80 shadow-sm">
              <CardHeader className="bg-white pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">โปรเจกต์ของคุณ</CardTitle>
                  <FolderKanban className="h-5 w-5 text-cyan-600" />
                </div>
              </CardHeader>
              <CardContent className="space-y-2 bg-white pt-0">
                {projectsLoading ? (
                  <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">กำลังโหลดโปรเจกต์…</div>
                ) : projects.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm leading-6 text-slate-500">
                    ยังไม่มีโปรเจกต์ เริ่มจากฟอร์มด้านล่างได้เลย
                  </div>
                ) : (
                  projects.map(project => (
                    <button
                      key={project.id}
                      onClick={() => setSelectedProjectId(project.id)}
                      className={`w-full rounded-2xl p-3 text-left transition-all ${selectedProjectId === project.id ? "bg-cyan-50 ring-1 ring-cyan-200" : "hover:bg-slate-50"}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 rounded-xl p-2 ${selectedProjectId === project.id ? "bg-cyan-600 text-white" : "bg-slate-100 text-slate-500"}`}>
                          <Code2 className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{project.name}</p>
                          <p className="mt-1 truncate text-xs text-slate-500">{project.category}</p>
                        </div>
                      </div>
                    </button>
                  ))
                )}
                <Separator className="my-4" />
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">เพิ่มโปรเจกต์</p>
                  <Input value={projectName} onChange={event => setProjectName(event.target.value)} placeholder="เช่น Thai Order Parser" />
                  <Textarea value={projectDescription} onChange={event => setProjectDescription(event.target.value)} placeholder="คำอธิบายสั้น ๆ" className="min-h-20 resize-none" />
                  <Button
                    className="w-full rounded-xl bg-slate-900 hover:bg-slate-800"
                    disabled={!projectName.trim() || createProject.isPending}
                    onClick={() => createProject.mutate({ name: projectName, description: projectDescription, category: "e-commerce" })}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    {createProject.isPending ? "กำลังสร้าง…" : "สร้างโปรเจกต์"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-3xl border-cyan-100 bg-cyan-50/70 shadow-sm">
              <CardContent className="flex gap-3 p-5">
                <Terminal className="mt-0.5 h-5 w-5 shrink-0 text-cyan-700" />
                <div>
                  <p className="text-sm font-semibold text-cyan-950">แนวทางการจัดเก็บ</p>
                  <p className="mt-1 text-xs leading-5 text-cyan-900/70">แยกไฟล์ตามหน้าที่ เช่น sql/, n8n/, docs/ และเก็บ token จริงไว้ใน Secret ไม่ใส่ลงไฟล์</p>
                </div>
              </CardContent>
            </Card>
          </aside>

          <main className="min-w-0 space-y-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-cyan-700">Workspace / {selectedProject?.category ?? "project"}</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight">{selectedProject?.name ?? "เลือกหรือสร้างโปรเจกต์"}</h2>
                <p className="mt-1 text-sm text-slate-500">{selectedProject?.description || "คลังโค้ดส่วนตัวสำหรับงานหลังบ้านและระบบออเดอร์"}</p>
              </div>
              <Button onClick={startNewFile} disabled={!selectedProjectId} className="rounded-xl bg-cyan-600 shadow-lg shadow-cyan-100 hover:bg-cyan-700">
                <Plus className="mr-2 h-4 w-4" /> ไฟล์ใหม่
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {[
                { label: "โปรเจกต์", value: stats?.projects ?? projects.length, icon: FolderKanban, tone: "text-cyan-600 bg-cyan-50" },
                { label: "ไฟล์ทั้งหมด", value: stats?.files ?? files.length, icon: FileText, tone: "text-blue-600 bg-blue-50" },
                { label: "SQL ในมุมมองนี้", value: sqlCount, icon: Database, tone: "text-emerald-600 bg-emerald-50" },
                { label: "Workflow", value: workflowCount, icon: CheckCircle2, tone: "text-violet-600 bg-violet-50" },
              ].map(stat => (
                <Card key={stat.label} className="rounded-2xl border-slate-200/80 shadow-sm">
                  <CardContent className="flex items-center gap-3 p-4">
                    <div className={`rounded-xl p-2.5 ${stat.tone}`}><stat.icon className="h-4 w-4" /></div>
                    <div><p className="text-2xl font-semibold">{stat.value}</p><p className="text-xs text-slate-500">{stat.label}</p></div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)]">
              <Card className="overflow-hidden rounded-3xl border-slate-200/80 shadow-sm">
                <CardHeader className="border-b border-slate-100 bg-white pb-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div><CardTitle className="text-base">ไฟล์ในโปรเจกต์</CardTitle><p className="mt-1 text-xs text-slate-500">เลือกไฟล์เพื่อดูหรือแก้ไข</p></div>
                    <div className="relative sm:w-44"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><Input value={search} onChange={event => setSearch(event.target.value)} placeholder="ค้นหาไฟล์…" className="rounded-xl pl-9" /></div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="max-h-[590px] overflow-y-auto">
                    {filesLoading ? <p className="p-6 text-sm text-slate-500">กำลังโหลดไฟล์…</p> : files.length === 0 ? (
                      <div className="m-5 rounded-2xl border border-dashed border-slate-200 p-8 text-center"><FileText className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-medium">ยังไม่มีไฟล์ในโปรเจกต์นี้</p><p className="mt-1 text-xs text-slate-500">กด “ไฟล์ใหม่” หรือ import ไฟล์สำคัญเข้ามา</p></div>
                    ) : files.map(file => (
                      <button key={file.id} onClick={() => setSelectedFileId(file.id)} className={`flex w-full items-start gap-3 border-b border-slate-100 px-5 py-4 text-left transition-colors ${selectedFileId === file.id ? "bg-slate-50" : "hover:bg-slate-50/70"}`}>
                        <div className="mt-0.5 rounded-lg bg-slate-100 p-2">{fileIcon(file.kind)}</div>
                        <div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-semibold">{file.title}</p><Badge variant="outline" className={`shrink-0 text-[10px] ${kindColors[file.kind]}`}>{kindLabels[file.kind]}</Badge></div><p className="mt-1 truncate font-mono text-[11px] text-slate-500">{file.path}</p><p className="mt-2 text-[11px] text-slate-400">แก้ไข {formatDate(file.updatedAt)} · {file.sizeBytes.toLocaleString()} bytes</p></div>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="overflow-hidden rounded-3xl border-slate-200/80 shadow-sm xl:sticky xl:top-5 xl:self-start">
                <CardHeader className="border-b border-slate-100 bg-white pb-4">
                  <div className="flex items-center justify-between gap-3"><div><CardTitle className="text-base">ตัวแก้ไขไฟล์</CardTitle><p className="mt-1 text-xs text-slate-500">บันทึกแล้วจะสร้าง revision เมื่อเนื้อหาเปลี่ยน</p></div><Button variant="outline" size="sm" onClick={() => setEditorFavorite(value => !value)} className={editorFavorite ? "border-amber-300 bg-amber-50 text-amber-700" : ""}>{editorFavorite ? "★ สำคัญ" : "☆ ปักหมุด"}</Button></div>
                </CardHeader>
                <CardContent className="space-y-3 bg-white p-5">
                  <div className="grid gap-3 sm:grid-cols-2"><Input value={editorTitle} onChange={event => setEditorTitle(event.target.value)} placeholder="ชื่อไฟล์" /><Input value={editorPath} onChange={event => setEditorPath(event.target.value)} placeholder="path/to/file.sql" /></div>
                  <div className="grid gap-3 sm:grid-cols-[1fr_1.2fr]"><Input value={editorLanguage} onChange={event => setEditorLanguage(event.target.value)} placeholder="ภาษา เช่น sql, javascript" /><select value={editorKind} onChange={event => setEditorKind(event.target.value as typeof editorKind)} className="h-10 rounded-xl border border-input bg-background px-3 text-sm"><option value="code">โค้ด</option><option value="sql">SQL</option><option value="workflow">Workflow</option><option value="document">เอกสาร</option><option value="config">ตั้งค่า</option><option value="other">อื่น ๆ</option></select></div>
                  <Textarea value={editorContent} onChange={event => setEditorContent(event.target.value)} placeholder="วาง SQL หรือโค้ดสำคัญที่นี่…" className="min-h-[360px] resize-y rounded-2xl bg-slate-950 px-4 py-4 font-mono text-xs leading-5 text-slate-100 placeholder:text-slate-500 focus-visible:ring-cyan-500" />
                  <div className="flex items-center justify-between gap-3"><p className="text-xs text-slate-400">{editorContent.length.toLocaleString()} ตัวอักษร</p><Button onClick={saveFile} disabled={!selectedProjectId || !editorTitle.trim() || !editorPath.trim() || createFile.isPending || updateFile.isPending} className="rounded-xl bg-slate-900 hover:bg-slate-800"><Save className="mr-2 h-4 w-4" />{createFile.isPending || updateFile.isPending ? "กำลังบันทึก…" : "บันทึกไฟล์"}</Button></div>
                </CardContent>
              </Card>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
