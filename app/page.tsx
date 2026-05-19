"use client";

import { createClient, type User } from "@supabase/supabase-js";
import { FormEvent, useEffect, useMemo, useState } from "react";

type Role = "admin" | "employee";
type Status = "ikke_startet" | "paagar" | "ferdig" | "maa_folges_opp";
type WorkType = "ordinaer" | "reise" | "overtid" | "materiellhenting" | "dokumentasjon";

type Profile = { id: string; full_name: string; email: string; role: Role; phone: string | null };
type Order = { id: string; order_number: string; customer_name: string; address: string; contact_person: string | null; phone: string | null; description: string; assigned_employee_id: string | null; order_date: string; estimated_hours: number | null; status: Status; internal_comment: string | null; tripletex_id: string | null };
type TimeEntry = { id: string; order_id: string; employee_id: string; entry_date: string; start_time: string; end_time: string; hours: number; comment: string | null; work_type: WorkType; approved: boolean; orders?: { order_number: string; customer_name: string; tripletex_id: string | null; status: Status } | null; profiles?: { full_name: string; email: string } | null };

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
const statusLabels: Record<Status, string> = { ikke_startet: "Ikke startet", paagar: "Pågår", ferdig: "Ferdig", maa_folges_opp: "Må følges opp" };
const workTypeLabels: Record<WorkType, string> = { ordinaer: "Ordinær", reise: "Reise", overtid: "Overtid", materiellhenting: "Materiellhenting", dokumentasjon: "Dokumentasjon" };
const statusClasses: Record<Status, string> = { ikke_startet: "border-slate-200 bg-white", paagar: "border-emerald-200 bg-emerald-50", ferdig: "border-green-200 bg-green-50", maa_folges_opp: "border-amber-200 bg-amber-50" };

function todayIso() { return new Date().toISOString().slice(0, 10); }
function weekDays() { const d = new Date(); const day = d.getDay() || 7; d.setDate(d.getDate() - day + 1); return Array.from({ length: 7 }, (_, i) => { const x = new Date(d); x.setDate(d.getDate() + i); return x.toISOString().slice(0, 10); }); }
function dateLabel(date: string) { return new Intl.DateTimeFormat("nb-NO", { weekday: "short", day: "2-digit", month: "2-digit" }).format(new Date(`${date}T12:00:00`)); }
function emptyOrder() { return { order_number: "", customer_name: "", address: "", contact_person: "", phone: "", description: "", assigned_employee_id: "", order_date: todayIso(), estimated_hours: "", internal_comment: "" }; }
function emptyTime(orderId = "") { return { order_id: orderId, entry_date: todayIso(), start_time: "08:00", end_time: "16:00", hours: "7.5", comment: "", work_type: "ordinaer" as WorkType }; }

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [tab, setTab] = useState("oversikt");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [orderForm, setOrderForm] = useState(emptyOrder());
  const [timeForm, setTimeForm] = useState(emptyTime());

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => { if (user) void loadData(user.id); else { setProfile(null); setOrders([]); setEntries([]); } }, [user]);

  async function loadData(userId: string) {
    setMessage("");
    const { data: p, error: pErr } = await supabase.from("profiles").select("*").eq("id", userId).single();
    if (pErr || !p) { setMessage("Fant ikke profil. Sjekk at brukeren finnes i profiles."); return; }
    setProfile(p as Profile);
    const isAdmin = p.role === "admin";
    const orderQuery = supabase.from("orders").select("*").order("order_date", { ascending: true });
    const { data: o } = isAdmin ? await orderQuery : await orderQuery.eq("assigned_employee_id", userId);
    setOrders((o ?? []) as Order[]);
    const timeQuery = supabase.from("time_entries").select("*, orders(order_number,customer_name,tripletex_id,status), profiles!time_entries_employee_id_fkey(full_name,email)").order("entry_date", { ascending: false });
    const { data: t } = isAdmin ? await timeQuery : await timeQuery.eq("employee_id", userId);
    setEntries((t ?? []) as TimeEntry[]);
    if (isAdmin) { const { data: e } = await supabase.from("profiles").select("*").eq("role", "employee").order("full_name"); setEmployees((e ?? []) as Profile[]); }
  }

  async function login(e: FormEvent) { e.preventDefault(); setMessage(""); const { error } = await supabase.auth.signInWithPassword({ email, password }); if (error) setMessage("Kunne ikke logge inn. Sjekk e-post og passord."); }
  async function logout() { await supabase.auth.signOut(); }

  async function createOrder(e: FormEvent) {
    e.preventDefault(); if (!profile || profile.role !== "admin") return;
    const { error } = await supabase.from("orders").insert({ ...orderForm, estimated_hours: Number(orderForm.estimated_hours) || null, assigned_employee_id: orderForm.assigned_employee_id || null, status: "ikke_startet" });
    if (error) setMessage(error.message); else { setOrderForm(emptyOrder()); await loadData(profile.id); setTab("ordre"); }
  }

  async function saveTime(e: FormEvent) {
    e.preventDefault(); if (!profile) return;
    const { error } = await supabase.from("time_entries").insert({ ...timeForm, employee_id: profile.id, hours: Number(timeForm.hours) || 0 });
    if (error) setMessage(error.message); else { setTimeForm(emptyTime()); await loadData(profile.id); setTab("timer"); }
  }

  async function updateStatus(order: Order, status: Status) { if (!profile) return; const { error } = await supabase.from("orders").update({ status }).eq("id", order.id); if (error) setMessage(error.message); else await loadData(profile.id); }
  async function approveEntry(id: string) { if (!profile) return; const { error } = await supabase.from("time_entries").update({ approved: true }).eq("id", id); if (error) setMessage(error.message); else await loadData(profile.id); }

  function exportCsv() {
    const header = ["dato", "ansatt", "epost", "ordrenummer", "kunde", "tripletex_id", "starttid", "sluttid", "timer", "arbeidstype", "kommentar", "godkjent"];
    const rows = entries.map((x) => [x.entry_date, x.profiles?.full_name ?? profile?.full_name ?? "", x.profiles?.email ?? profile?.email ?? "", x.orders?.order_number ?? "", x.orders?.customer_name ?? "", x.orders?.tripletex_id ?? "", x.start_time, x.end_time, x.hours, workTypeLabels[x.work_type], x.comment ?? "", x.approved ? "Ja" : "Nei"]);
    const esc = (v: unknown) => /[;"\n]/.test(String(v ?? "")) ? `"${String(v ?? "").replaceAll('"', '""')}"` : String(v ?? "");
    const csv = [header, ...rows].map((r) => r.map(esc).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "lasia-timeeksport.csv"; a.click(); URL.revokeObjectURL(url);
  }

  const todayOrders = orders.filter((o) => o.order_date === todayIso());
  const week = weekDays();
  const weekOrders = orders.filter((o) => week.includes(o.order_date));
  const unapproved = entries.filter((x) => !x.approved);
  const visibleOrders = useMemo(() => orders, [orders]);

  if (!user || !profile) return <main className="grid min-h-screen place-items-center p-4"><form onSubmit={login} className="w-full max-w-md rounded-lg border border-emerald-100 bg-white p-5 shadow-sm"><p className="font-semibold text-emerald-700">Låsia AS internapp</p><h1 className="mt-1 text-2xl font-bold">Logg inn</h1><input className="mt-5 w-full rounded-lg border p-3" placeholder="E-post" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /><input className="mt-3 w-full rounded-lg border p-3" placeholder="Passord" type="password" value={password} onChange={(e) => setPassword(e.target.value)} /><button className="mt-4 w-full rounded-lg bg-emerald-700 p-3 font-semibold text-white">Logg inn</button>{message && <p className="mt-3 rounded bg-red-50 p-3 text-sm text-red-700">{message}</p>}</form></main>;

  return <main className="mx-auto max-w-6xl p-4 pb-24"><header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-emerald-700">Låsia AS</p><h1 className="text-2xl font-bold">Hei, {profile.full_name}</h1><p className="text-sm text-slate-600">{profile.role === "admin" ? "Admin" : "Ansatt"}</p></div><button onClick={logout} className="rounded-lg border px-4 py-3 font-semibold">Logg ut</button></header>{message && <p className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700">{message}</p>}<nav className="mb-5 grid grid-cols-4 gap-2"><Tab id="oversikt" tab={tab} setTab={setTab}>Oversikt</Tab><Tab id="ordre" tab={tab} setTab={setTab}>Ordre</Tab><Tab id="kalender" tab={tab} setTab={setTab}>Kalender</Tab><Tab id="timer" tab={tab} setTab={setTab}>Timer</Tab></nav>{tab === "oversikt" && <section className="grid gap-4 md:grid-cols-2"><Panel title="Dagens jobber"><OrderList orders={todayOrders} onStatus={updateStatus} /></Panel><Panel title="Ukens jobber"><OrderList orders={weekOrders} onStatus={updateStatus} /></Panel><Panel title="Ikke-godkjente timer"><p className="text-3xl font-bold">{unapproved.length}</p></Panel><Panel title="Ferdige ordre"><OrderList orders={orders.filter((o) => o.status === "ferdig")} onStatus={updateStatus} /></Panel></section>}{tab === "ordre" && <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">{profile.role === "admin" && <Panel title="Ny ordre"><form onSubmit={createOrder} className="grid gap-3"><Input label="Ordrenummer" value={orderForm.order_number} onChange={(v) => setOrderForm({ ...orderForm, order_number: v })} /><Input label="Kundenavn" value={orderForm.customer_name} onChange={(v) => setOrderForm({ ...orderForm, customer_name: v })} /><Input label="Adresse" value={orderForm.address} onChange={(v) => setOrderForm({ ...orderForm, address: v })} /><Input label="Kontaktperson" value={orderForm.contact_person} onChange={(v) => setOrderForm({ ...orderForm, contact_person: v })} /><Input label="Telefonnummer" value={orderForm.phone} onChange={(v) => setOrderForm({ ...orderForm, phone: v })} /><label className="grid gap-1 text-sm font-medium">Tildelt ansatt<select className="rounded-lg border p-3" value={orderForm.assigned_employee_id} onChange={(e) => setOrderForm({ ...orderForm, assigned_employee_id: e.target.value })}><option value="">Ikke tildelt</option>{employees.map((x) => <option key={x.id} value={x.id}>{x.full_name}</option>)}</select></label><Input label="Dato" type="date" value={orderForm.order_date} onChange={(v) => setOrderForm({ ...orderForm, order_date: v })} /><Input label="Estimert tid" type="number" value={orderForm.estimated_hours} onChange={(v) => setOrderForm({ ...orderForm, estimated_hours: v })} /><TextArea label="Beskrivelse" value={orderForm.description} onChange={(v) => setOrderForm({ ...orderForm, description: v })} /><TextArea label="Intern kommentar" value={orderForm.internal_comment} onChange={(v) => setOrderForm({ ...orderForm, internal_comment: v })} /><button className="rounded-lg bg-emerald-700 p-3 font-semibold text-white">Opprett ordre</button></form></Panel>}<Panel title="Ordreliste"><OrderList orders={visibleOrders} onStatus={updateStatus} /></Panel></section>}{tab === "kalender" && <section className="grid gap-3 md:grid-cols-7">{week.map((day) => <Panel key={day} title={dateLabel(day)}><OrderList orders={orders.filter((o) => o.order_date === day)} onStatus={updateStatus} compact /></Panel>)}</section>}{tab === "timer" && <section className="grid gap-4 lg:grid-cols-[1fr_1fr]"><Panel title="Ny timeføring"><form onSubmit={saveTime} className="grid gap-3"><label className="grid gap-1 text-sm font-medium">Ordre<select className="rounded-lg border p-3" value={timeForm.order_id} onChange={(e) => setTimeForm({ ...timeForm, order_id: e.target.value })} required><option value="">Velg ordre</option>{orders.map((o) => <option key={o.id} value={o.id}>{o.order_number} - {o.customer_name}</option>)}</select></label><Input label="Dato" type="date" value={timeForm.entry_date} onChange={(v) => setTimeForm({ ...timeForm, entry_date: v })} /><Input label="Starttid" type="time" value={timeForm.start_time} onChange={(v) => setTimeForm({ ...timeForm, start_time: v })} /><Input label="Sluttid" type="time" value={timeForm.end_time} onChange={(v) => setTimeForm({ ...timeForm, end_time: v })} /><Input label="Antall timer" type="number" value={timeForm.hours} onChange={(v) => setTimeForm({ ...timeForm, hours: v })} /><label className="grid gap-1 text-sm font-medium">Type arbeid<select className="rounded-lg border p-3" value={timeForm.work_type} onChange={(e) => setTimeForm({ ...timeForm, work_type: e.target.value as WorkType })}>{Object.entries(workTypeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label><TextArea label="Kommentar" value={timeForm.comment} onChange={(v) => setTimeForm({ ...timeForm, comment: v })} /><button className="rounded-lg bg-emerald-700 p-3 font-semibold text-white">Lagre timer</button></form></Panel><Panel title="Timer"><div className="mb-3 flex justify-end">{profile.role === "admin" && <button onClick={exportCsv} className="rounded-lg border border-emerald-700 px-4 py-2 font-semibold text-emerald-700">Eksporter CSV</button>}</div><div className="grid gap-2">{entries.map((x) => <div key={x.id} className="rounded-lg border bg-white p-3 text-sm"><div className="flex justify-between gap-2"><strong>{x.entry_date} · {x.orders?.order_number}</strong><span>{x.hours} t</span></div><p className="text-slate-600">{workTypeLabels[x.work_type]} · {x.approved ? "Godkjent" : "Ikke godkjent"}</p>{profile.role === "admin" && !x.approved && <button onClick={() => approveEntry(x.id)} className="mt-2 rounded bg-emerald-700 px-3 py-2 text-white">Godkjenn</button>}</div>)}</div></Panel></section>}</main>;
}

function Tab({ id, tab, setTab, children }: { id: string; tab: string; setTab: (id: string) => void; children: React.ReactNode }) { return <button onClick={() => setTab(id)} className={`rounded-lg px-3 py-3 text-sm font-semibold ${tab === id ? "bg-emerald-700 text-white" : "bg-white text-slate-700"}`}>{children}</button>; }
function Panel({ title, children }: { title: string; children: React.ReactNode }) { return <section className="rounded-lg border border-emerald-100 bg-white p-4 shadow-sm"><h2 className="mb-3 font-semibold">{title}</h2>{children}</section>; }
function Input({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) { return <label className="grid gap-1 text-sm font-medium">{label}<input required className="rounded-lg border p-3" type={type} value={value} onChange={(e) => onChange(e.target.value)} /></label>; }
function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) { return <label className="grid gap-1 text-sm font-medium">{label}<textarea className="rounded-lg border p-3" rows={3} value={value} onChange={(e) => onChange(e.target.value)} /></label>; }
function OrderList({ orders, onStatus, compact = false }: { orders: Order[]; onStatus: (o: Order, s: Status) => void; compact?: boolean }) { if (!orders.length) return <p className="text-sm text-slate-600">Ingen ordre.</p>; return <div className="grid gap-2">{orders.map((o) => <article key={o.id} className={`rounded-lg border p-3 ${statusClasses[o.status]}`}><div className="flex justify-between gap-2"><div><p className="text-xs font-semibold uppercase">{o.order_number}</p><h3 className="font-semibold">{o.customer_name}</h3></div><span className="text-xs font-semibold">{statusLabels[o.status]}</span></div>{!compact && <><p className="mt-2 text-sm text-slate-700">{o.address}</p><p className="text-sm text-slate-600">{dateLabel(o.order_date)} · {o.estimated_hours ?? 0} t estimert</p><p className="mt-2 whitespace-pre-line text-sm">{o.description}</p></>}<select className="mt-3 w-full rounded-lg border bg-white p-2 text-sm" value={o.status} onChange={(e) => onStatus(o, e.target.value as Status)}>{Object.entries(statusLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></article>)}</div>; }
