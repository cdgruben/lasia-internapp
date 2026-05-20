"use client";

import { createClient, type User } from "@supabase/supabase-js";
import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";

type Role = "admin" | "employee";
type Status = "planning" | "scheduled" | "in_progress" | "completed_pending_invoice" | "invoiced_archived";
type WorkType = "ordinaer" | "reise" | "overtid" | "materiellhenting" | "dokumentasjon";
type EntryMethod = "time_range" | "manual";

type Profile = { id: string; full_name: string; email: string; role: Role; phone: string | null };
type Order = { id: string; order_number: string; customer_name: string; address: string; contact_person: string | null; phone: string | null; description: string; assigned_employee_id: string | null; order_date: string | null; estimated_hours: number | null; status: Status; internal_comment: string | null; tripletex_id: string | null; scheduled_start: string | null; scheduled_end: string | null; completed_at: string | null; completed_by: string | null; invoiced_at: string | null; invoiced_by: string | null };
type TimeEntry = { id: string; order_id: string; employee_id: string; entry_date: string; entry_method: EntryMethod; start_time: string | null; end_time: string | null; hours: number; comment: string | null; work_type: WorkType; approved: boolean; orders?: { order_number: string; customer_name: string; tripletex_id: string | null; status: Status } | null; profiles?: { full_name: string; email: string } | null };
type PlanForm = { employee_id: string; date: string; start_time: string; estimated_hours: string };

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

const statusLabels: Record<Status, string> = { planning: "Til planlegging", scheduled: "Planlagt", in_progress: "Pågår", completed_pending_invoice: "Ferdig - til fakturering", invoiced_archived: "Fakturert / arkiv" };
const workTypeLabels: Record<WorkType, string> = { ordinaer: "Ordinær", reise: "Reise", overtid: "Overtid", materiellhenting: "Materiellhenting", dokumentasjon: "Dokumentasjon" };
const methodLabels: Record<EntryMethod, string> = { time_range: "Fra-til klokkeslett", manual: "Manuelt antall timer" };
const statusClasses: Record<Status, string> = { planning: "border-slate-200 bg-white", scheduled: "border-emerald-200 bg-emerald-50", in_progress: "border-blue-200 bg-blue-50", completed_pending_invoice: "border-amber-200 bg-amber-50", invoiced_archived: "border-slate-200 bg-slate-50 opacity-80" };

function todayIso() { return new Date().toISOString().slice(0, 10); }
function weekDays() { const d = new Date(); const day = d.getDay() || 7; d.setDate(d.getDate() - day + 1); return Array.from({ length: 7 }, (_, i) => { const x = new Date(d); x.setDate(d.getDate() + i); return x.toISOString().slice(0, 10); }); }
function dateLabel(date: string) { return new Intl.DateTimeFormat("nb-NO", { weekday: "short", day: "2-digit", month: "2-digit" }).format(new Date(`${date}T12:00:00`)); }
function timeLabel(value: string | null) { return value ? new Intl.DateTimeFormat("nb-NO", { hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "Ikke satt"; }
function orderDay(order: Order) { return order.scheduled_start?.slice(0, 10) ?? order.order_date ?? ""; }
function calculateHours(start: string, end: string) { if (!start || !end) return 0; const [sh, sm] = start.split(":").map(Number); const [eh, em] = end.split(":").map(Number); return Math.round((((eh * 60 + em) - (sh * 60 + sm)) / 60) * 100) / 100; }
function formatHours(value: number) { return Number.isFinite(value) ? value.toFixed(2).replace(".00", "") : "0"; }
function makeSchedule(date: string, startTime: string, hours: string) { const start = new Date(`${date}T${startTime}:00`); const end = new Date(start); end.setMinutes(end.getMinutes() + Math.round((Number(hours) || 1) * 60)); return { startIso: start.toISOString(), endIso: end.toISOString() }; }
function emptyOrder() { return { order_number: "", customer_name: "", address: "", contact_person: "", phone: "", description: "", assigned_employee_id: "", order_date: "", start_time: "08:00", estimated_hours: "", internal_comment: "" }; }
function emptyTime(orderId = "") { return { order_id: orderId, entry_date: todayIso(), entry_method: "time_range" as EntryMethod, start_time: "08:00", end_time: "16:00", hours: "7.5", comment: "", work_type: "ordinaer" as WorkType, mark_complete: false }; }
function defaultPlanForm(): PlanForm { return { employee_id: "", date: todayIso(), start_time: "08:00", estimated_hours: "2" }; }

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
  const [planningOrderId, setPlanningOrderId] = useState<string | null>(null);
  const [planForm, setPlanForm] = useState<PlanForm>(defaultPlanForm());
  const [archiveSearch, setArchiveSearch] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) void loadData(user.id);
    else { setProfile(null); setOrders([]); setEntries([]); setEmployees([]); }
  }, [user]);

  async function loadData(userId: string) {
    setMessage("");
    const { data: p, error: pErr } = await supabase.from("profiles").select("*").eq("id", userId).single();
    if (pErr || !p) { setMessage("Fant ikke profil. Sjekk at brukeren finnes i profiles."); return; }

    setProfile(p as Profile);
    const isAdmin = p.role === "admin";
    const orderQuery = supabase.from("orders").select("*").order("scheduled_start", { ascending: true, nullsFirst: true }).order("order_date", { ascending: true, nullsFirst: true });
    const { data: o, error: oErr } = isAdmin ? await orderQuery : await orderQuery.eq("assigned_employee_id", userId);
    if (oErr) setMessage(oErr.message);
    setOrders((o ?? []) as Order[]);

    const timeQuery = supabase.from("time_entries").select("*, orders(order_number,customer_name,tripletex_id,status), profiles!time_entries_employee_id_fkey(full_name,email)").order("entry_date", { ascending: false });
    const { data: t, error: tErr } = isAdmin ? await timeQuery : await timeQuery.eq("employee_id", userId);
    if (tErr) setMessage(tErr.message);
    setEntries((t ?? []) as TimeEntry[]);

    if (isAdmin) {
      const { data: e } = await supabase.from("profiles").select("*").eq("role", "employee").order("full_name");
      setEmployees((e ?? []) as Profile[]);
    }
  }

  async function login(e: FormEvent) { e.preventDefault(); setMessage(""); const { error } = await supabase.auth.signInWithPassword({ email, password }); if (error) setMessage("Kunne ikke logge inn. Sjekk e-post og passord."); }
  async function logout() { await supabase.auth.signOut(); }

  async function createOrder(e: FormEvent) {
    e.preventDefault(); if (!profile || profile.role !== "admin") return;
    const hasSchedule = Boolean(orderForm.assigned_employee_id && orderForm.order_date);
    const schedule = hasSchedule ? makeSchedule(orderForm.order_date, orderForm.start_time, orderForm.estimated_hours || "1") : null;
    const { error } = await supabase.from("orders").insert({ order_number: orderForm.order_number, customer_name: orderForm.customer_name, address: orderForm.address, contact_person: orderForm.contact_person || null, phone: orderForm.phone || null, description: orderForm.description, assigned_employee_id: hasSchedule ? orderForm.assigned_employee_id : null, order_date: hasSchedule ? orderForm.order_date : null, scheduled_start: schedule?.startIso ?? null, scheduled_end: schedule?.endIso ?? null, estimated_hours: Number(orderForm.estimated_hours) || null, internal_comment: orderForm.internal_comment || null, status: hasSchedule ? "scheduled" : "planning" });
    if (error) setMessage(error.message);
    else { setOrderForm(emptyOrder()); await loadData(profile.id); setTab(hasSchedule ? "ordre" : "planning"); }
  }

  async function planOrder(e: FormEvent) {
    e.preventDefault(); if (!profile || profile.role !== "admin" || !planningOrderId) return;
    if (!planForm.employee_id || !planForm.date || !planForm.start_time) { setMessage("Velg ansatt, dato og starttid."); return; }
    const schedule = makeSchedule(planForm.date, planForm.start_time, planForm.estimated_hours || "1");
    const { error } = await supabase.from("orders").update({ assigned_employee_id: planForm.employee_id, order_date: planForm.date, scheduled_start: schedule.startIso, scheduled_end: schedule.endIso, estimated_hours: Number(planForm.estimated_hours) || null, status: "scheduled" }).eq("id", planningOrderId);
    if (error) setMessage(error.message);
    else { setPlanningOrderId(null); setPlanForm(defaultPlanForm()); await loadData(profile.id); }
  }

  async function saveTime(e: FormEvent) {
    e.preventDefault(); if (!profile) return;
    const isRange = timeForm.entry_method === "time_range";
    const hours = isRange ? calculateHours(timeForm.start_time, timeForm.end_time) : Number(timeForm.hours);
    if (!timeForm.order_id) { setMessage("Velg ordre."); return; }
    if (isRange && hours <= 0) { setMessage("Sluttid må være etter starttid."); return; }
    if (!Number.isFinite(hours) || hours <= 0) { setMessage("Timer kan ikke være 0 eller negativt."); return; }
    if (hours > 24) { setMessage("Maks 24 timer per føring."); return; }

    const { error } = await supabase.from("time_entries").insert({ order_id: timeForm.order_id, employee_id: profile.id, entry_date: timeForm.entry_date, entry_method: timeForm.entry_method, start_time: isRange ? timeForm.start_time : null, end_time: isRange ? timeForm.end_time : null, hours, comment: timeForm.comment || null, work_type: timeForm.work_type });
    if (error) { setMessage(error.message); return; }
    if (timeForm.mark_complete) {
      const { error: orderError } = await supabase.from("orders").update({ status: "completed_pending_invoice", completed_at: new Date().toISOString(), completed_by: profile.id }).eq("id", timeForm.order_id);
      if (orderError) { setMessage(orderError.message); return; }
    }
    setTimeForm(emptyTime()); await loadData(profile.id); setTab("timer");
  }

  async function updateStatus(order: Order, status: Status) { if (!profile || profile.role !== "admin") return; const { error } = await supabase.from("orders").update({ status }).eq("id", order.id); if (error) setMessage(error.message); else await loadData(profile.id); }
  async function markInProgress(order: Order) { if (!profile) return; const { error } = await supabase.from("orders").update({ status: "in_progress" }).eq("id", order.id); if (error) setMessage(error.message); else await loadData(profile.id); }
  async function markInvoiced(order: Order) { if (!profile || profile.role !== "admin") return; const { error } = await supabase.from("orders").update({ status: "invoiced_archived", invoiced_at: new Date().toISOString(), invoiced_by: profile.id }).eq("id", order.id); if (error) setMessage(error.message); else await loadData(profile.id); }
  async function approveEntry(id: string) { if (!profile) return; const { error } = await supabase.from("time_entries").update({ approved: true }).eq("id", id); if (error) setMessage(error.message); else await loadData(profile.id); }

  function exportCsv() {
    const header = ["dato", "ansatt", "epost", "ordrenummer", "kunde", "tripletex_id", "metode", "starttid", "sluttid", "timer", "arbeidstype", "kommentar", "godkjent"];
    const rows = entries.map((x) => [x.entry_date, x.profiles?.full_name ?? profile?.full_name ?? "", x.profiles?.email ?? profile?.email ?? "", x.orders?.order_number ?? "", x.orders?.customer_name ?? "", x.orders?.tripletex_id ?? "", methodLabels[x.entry_method ?? "time_range"], x.start_time ?? "", x.end_time ?? "", x.hours, workTypeLabels[x.work_type], x.comment ?? "", x.approved ? "Ja" : "Nei"]);
    const esc = (v: unknown) => /[;"\n]/.test(String(v ?? "")) ? `"${String(v ?? "").replaceAll('"', '""')}"` : String(v ?? "");
    const csv = [header, ...rows].map((r) => r.map(esc).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "lasia-timeeksport.csv"; a.click(); URL.revokeObjectURL(url);
  }

  const activeOrders = orders.filter((o) => o.status !== "invoiced_archived");
  const planningOrders = orders.filter((o) => o.status === "planning");
  const invoiceOrders = orders.filter((o) => o.status === "completed_pending_invoice");
  const archiveOrders = orders.filter((o) => o.status === "invoiced_archived");
  const todayOrders = activeOrders.filter((o) => orderDay(o) === todayIso());
  const week = weekDays();
  const weekOrders = activeOrders.filter((o) => week.includes(orderDay(o)) && o.status !== "planning");
  const scheduledWeekOrders = weekOrders.filter((o) => o.assigned_employee_id);
  const unapproved = entries.filter((x) => !x.approved);
  const visibleOrders = useMemo(() => activeOrders.filter((o) => o.status !== "planning"), [activeOrders]);
  const selectedPlanningOrder = planningOrders.find((o) => o.id === planningOrderId) ?? null;
  const archiveMatches = archiveOrders.filter((o) => `${o.order_number} ${o.customer_name} ${o.address}`.toLowerCase().includes(archiveSearch.toLowerCase()));
  const tabs = profile.role === "admin" ? ["oversikt", "ordre", "planning", "invoice", "archive", "timer"] : ["oversikt", "ordre", "kalender", "timer"];
  const calculatedHours = calculateHours(timeForm.start_time, timeForm.end_time);

  if (!user || !profile) return <main className="grid min-h-screen place-items-center p-4"><form onSubmit={login} className="w-full max-w-md rounded-lg border border-emerald-100 bg-white p-5 shadow-sm"><p className="font-semibold text-emerald-700">Låsia AS internapp</p><h1 className="mt-1 text-2xl font-bold">Logg inn</h1><input className="mt-5 w-full rounded-lg border p-3" placeholder="E-post" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /><input className="mt-3 w-full rounded-lg border p-3" placeholder="Passord" type="password" value={password} onChange={(e) => setPassword(e.target.value)} /><button className="mt-4 w-full rounded-lg bg-emerald-700 p-3 font-semibold text-white">Logg inn</button>{message && <p className="mt-3 rounded bg-red-50 p-3 text-sm text-red-700">{message}</p>}</form></main>;

  return <main className="mx-auto max-w-6xl p-4 pb-24"><header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-emerald-700">Låsia AS</p><h1 className="text-2xl font-bold">Hei, {profile.full_name}</h1><p className="text-sm text-slate-600">{profile.role === "admin" ? "Admin" : "Ansatt"}</p></div><button onClick={logout} className="rounded-lg border px-4 py-3 font-semibold">Logg ut</button></header>{message && <p className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700">{message}</p>}<nav className="mb-5 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">{tabs.map((id) => <Tab key={id} id={id} tab={tab} setTab={setTab}>{tabLabel(id)}</Tab>)}</nav>{tab === "oversikt" && <section className="grid gap-4 md:grid-cols-2"><Panel title="Dagens jobber"><OrderList orders={todayOrders} profile={profile} employees={employees} onAdminStatus={updateStatus} onStart={markInProgress} /></Panel><Panel title="Ukens jobber"><OrderList orders={weekOrders} profile={profile} employees={employees} onAdminStatus={updateStatus} onStart={markInProgress} /></Panel>{profile.role === "admin" && <Panel title="Til planlegging"><p className="text-3xl font-bold">{planningOrders.length}</p></Panel>}<Panel title="Ikke-godkjente timer"><p className="text-3xl font-bold">{unapproved.length}</p></Panel>{profile.role === "admin" && <Panel title="Til fakturering"><p className="text-3xl font-bold">{invoiceOrders.length}</p></Panel>}</section>}{tab === "ordre" && <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">{profile.role === "admin" && <Panel title="Ny ordre"><form onSubmit={createOrder} className="grid gap-3"><Input label="Ordrenummer" value={orderForm.order_number} onChange={(v) => setOrderForm({ ...orderForm, order_number: v })} /><Input label="Kundenavn" value={orderForm.customer_name} onChange={(v) => setOrderForm({ ...orderForm, customer_name: v })} /><Input label="Adresse" value={orderForm.address} onChange={(v) => setOrderForm({ ...orderForm, address: v })} /><Input label="Kontaktperson" value={orderForm.contact_person} onChange={(v) => setOrderForm({ ...orderForm, contact_person: v })} required={false} /><Input label="Telefonnummer" value={orderForm.phone} onChange={(v) => setOrderForm({ ...orderForm, phone: v })} required={false} /><label className="grid gap-1 text-sm font-medium">Tildelt ansatt<select className="rounded-lg border p-3" value={orderForm.assigned_employee_id} onChange={(e) => setOrderForm({ ...orderForm, assigned_employee_id: e.target.value })}><option value="">Ikke tildelt</option>{employees.map((x) => <option key={x.id} value={x.id}>{x.full_name}</option>)}</select></label><Input label="Dato" type="date" value={orderForm.order_date} onChange={(v) => setOrderForm({ ...orderForm, order_date: v })} required={false} /><Input label="Starttid" type="time" value={orderForm.start_time} onChange={(v) => setOrderForm({ ...orderForm, start_time: v })} required={false} /><Input label="Estimert tid" type="number" value={orderForm.estimated_hours} onChange={(v) => setOrderForm({ ...orderForm, estimated_hours: v })} required={false} /><TextArea label="Beskrivelse" value={orderForm.description} onChange={(v) => setOrderForm({ ...orderForm, description: v })} /><TextArea label="Intern kommentar" value={orderForm.internal_comment} onChange={(v) => setOrderForm({ ...orderForm, internal_comment: v })} required={false} /><p className="text-sm text-slate-600">Uten dato og ansatt blir ordren lagt i Til planlegging.</p><button className="rounded-lg bg-emerald-700 p-3 font-semibold text-white">Opprett ordre</button></form></Panel>}<Panel title="Aktive ordre"><OrderList orders={visibleOrders} profile={profile} employees={employees} onAdminStatus={updateStatus} onStart={markInProgress} /></Panel></section>}{tab === "planning" && profile.role === "admin" && <section className="grid gap-4 xl:grid-cols-[360px_1fr]"><div className="grid gap-4"><Panel title="Til planlegging"><OrderList orders={planningOrders} profile={profile} employees={employees} onPlan={(o) => { setPlanningOrderId(o.id); setPlanForm({ employee_id: o.assigned_employee_id ?? "", date: o.order_date ?? todayIso(), start_time: o.scheduled_start ? new Date(o.scheduled_start).toTimeString().slice(0, 5) : "08:00", estimated_hours: String(o.estimated_hours ?? 2) }); }} /></Panel><Panel title={selectedPlanningOrder ? `Planlegg ${selectedPlanningOrder.order_number}` : "Planlegg ordre"}>{selectedPlanningOrder ? <form onSubmit={planOrder} className="grid gap-3"><label className="grid gap-1 text-sm font-medium">Ansatt<select required className="rounded-lg border p-3" value={planForm.employee_id} onChange={(e) => setPlanForm({ ...planForm, employee_id: e.target.value })}><option value="">Velg ansatt</option>{employees.map((x) => <option key={x.id} value={x.id}>{x.full_name}</option>)}</select></label><Input label="Dato" type="date" value={planForm.date} onChange={(v) => setPlanForm({ ...planForm, date: v })} /><Input label="Starttid" type="time" value={planForm.start_time} onChange={(v) => setPlanForm({ ...planForm, start_time: v })} /><Input label="Estimert varighet" type="number" value={planForm.estimated_hours} onChange={(v) => setPlanForm({ ...planForm, estimated_hours: v })} /><button className="rounded-lg bg-emerald-700 p-3 font-semibold text-white">Planlegg</button></form> : <p className="text-sm text-slate-600">Velg en ordre til venstre.</p>}</Panel></div><Panel title="Ukeplan per ansatt"><EmployeeWeek orders={scheduledWeekOrders} employees={employees} week={week} /></Panel></section>}{tab === "kalender" && profile.role === "employee" && <section className="grid gap-3 md:grid-cols-7">{week.map((day) => <Panel key={day} title={dateLabel(day)}><OrderList orders={activeOrders.filter((o) => o.status !== "planning" && orderDay(o) === day)} profile={profile} employees={employees} onStart={markInProgress} compact /></Panel>)}</section>}{tab === "invoice" && profile.role === "admin" && <Panel title="Til fakturering"><OrderList orders={invoiceOrders} profile={profile} employees={employees} onInvoice={markInvoiced} /></Panel>}{tab === "archive" && profile.role === "admin" && <Panel title="Arkiv"><input className="mb-3 w-full rounded-lg border p-3" placeholder="Søk på ordrenummer, kunde eller adresse" value={archiveSearch} onChange={(e) => setArchiveSearch(e.target.value)} /><OrderList orders={archiveMatches} profile={profile} employees={employees} /></Panel>}{tab === "timer" && <section className="grid gap-4 lg:grid-cols-[1fr_1fr]"><Panel title="Ny timeføring"><form onSubmit={saveTime} className="grid gap-3"><label className="grid gap-1 text-sm font-medium">Ordre<select className="rounded-lg border p-3" value={timeForm.order_id} onChange={(e) => setTimeForm({ ...timeForm, order_id: e.target.value })} required><option value="">Velg ordre</option>{activeOrders.filter((o) => o.status !== "planning" && o.status !== "completed_pending_invoice").map((o) => <option key={o.id} value={o.id}>{o.order_number} - {o.customer_name}</option>)}</select></label><Input label="Dato" type="date" value={timeForm.entry_date} onChange={(v) => setTimeForm({ ...timeForm, entry_date: v })} /><div className="grid gap-2 rounded-lg bg-slate-50 p-3"><p className="text-sm font-semibold">Metode</p><label className="flex items-center gap-2 text-sm"><input type="radio" checked={timeForm.entry_method === "time_range"} onChange={() => setTimeForm({ ...timeForm, entry_method: "time_range" })} />Fra-til klokkeslett</label><label className="flex items-center gap-2 text-sm"><input type="radio" checked={timeForm.entry_method === "manual"} onChange={() => setTimeForm({ ...timeForm, entry_method: "manual" })} />Manuelt antall timer</label></div>{timeForm.entry_method === "time_range" ? <><Input label="Starttid" type="time" value={timeForm.start_time} onChange={(v) => setTimeForm({ ...timeForm, start_time: v })} /><Input label="Sluttid" type="time" value={timeForm.end_time} onChange={(v) => setTimeForm({ ...timeForm, end_time: v })} /><div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-sm"><span className="font-semibold">Beregnet tid:</span> {formatHours(calculatedHours)} timer</div></> : <Input label="Antall timer" type="number" value={timeForm.hours} onChange={(v) => setTimeForm({ ...timeForm, hours: v })} />}<label className="grid gap-1 text-sm font-medium">Type arbeid<select className="rounded-lg border p-3" value={timeForm.work_type} onChange={(e) => setTimeForm({ ...timeForm, work_type: e.target.value as WorkType })}>{Object.entries(workTypeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label><TextArea label="Kommentar" value={timeForm.comment} onChange={(v) => setTimeForm({ ...timeForm, comment: v })} required={false} /><label className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm font-medium"><input type="checkbox" checked={timeForm.mark_complete} onChange={(e) => setTimeForm({ ...timeForm, mark_complete: e.target.checked })} />Marker ordre som ferdig</label><button className="rounded-lg bg-emerald-700 p-3 font-semibold text-white">Lagre timer</button></form></Panel><Panel title="Timer"><div className="mb-3 flex justify-end">{profile.role === "admin" && <button onClick={exportCsv} className="rounded-lg border border-emerald-700 px-4 py-2 font-semibold text-emerald-700">Eksporter CSV</button>}</div><div className="grid gap-2">{entries.map((x) => <div key={x.id} className="rounded-lg border bg-white p-3 text-sm"><div className="flex justify-between gap-2"><strong>{x.entry_date} · {x.orders?.order_number}</strong><span>{x.hours} t</span></div><p className="text-slate-600">{workTypeLabels[x.work_type]} · {methodLabels[x.entry_method ?? "time_range"]} · {x.approved ? "Godkjent" : "Ikke godkjent"}</p>{x.entry_method === "time_range" && <p className="text-slate-600">{x.start_time}-{x.end_time}</p>}{profile.role === "admin" && !x.approved && <button onClick={() => approveEntry(x.id)} className="mt-2 rounded bg-emerald-700 px-3 py-2 text-white">Godkjenn</button>}</div>)}</div></Panel></section>}</main>;
}

function tabLabel(id: string) { return ({ oversikt: "Dashboard", ordre: "Ordre", planning: "Planlegging", kalender: "Kalender", invoice: "Til fakturering", archive: "Arkiv", timer: "Timer/eksport" } as Record<string, string>)[id] ?? id; }
function Tab({ id, tab, setTab, children }: { id: string; tab: string; setTab: (id: string) => void; children: ReactNode }) { return <button onClick={() => setTab(id)} className={`rounded-lg px-3 py-3 text-sm font-semibold ${tab === id ? "bg-emerald-700 text-white" : "bg-white text-slate-700"}`}>{children}</button>; }
function Panel({ title, children }: { title: string; children: ReactNode }) { return <section className="rounded-lg border border-emerald-100 bg-white p-4 shadow-sm"><h2 className="mb-3 font-semibold">{title}</h2>{children}</section>; }
function Input({ label, value, onChange, type = "text", required = true }: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean }) { return <label className="grid gap-1 text-sm font-medium">{label}<input required={required} className="rounded-lg border p-3" type={type} value={value} onChange={(e) => onChange(e.target.value)} /></label>; }
function TextArea({ label, value, onChange, required = true }: { label: string; value: string; onChange: (v: string) => void; required?: boolean }) { return <label className="grid gap-1 text-sm font-medium">{label}<textarea required={required} className="rounded-lg border p-3" rows={3} value={value} onChange={(e) => onChange(e.target.value)} /></label>; }

function EmployeeWeek({ orders, employees, week }: { orders: Order[]; employees: Profile[]; week: string[] }) {
  if (!employees.length) return <p className="text-sm text-slate-600">Ingen ansatte er opprettet ennå.</p>;
  return <div className="overflow-x-auto"><div className="min-w-[760px]"><div className="grid grid-cols-[160px_repeat(7,minmax(84px,1fr))] gap-2 text-xs font-semibold text-slate-600"><div>Ansatt</div>{week.map((day) => <div key={day}>{dateLabel(day)}</div>)}</div><div className="mt-2 grid gap-2">{employees.map((employee) => <div key={employee.id} className="grid grid-cols-[160px_repeat(7,minmax(84px,1fr))] gap-2"><div className="rounded-lg bg-slate-50 p-2 text-sm font-semibold">{employee.full_name}</div>{week.map((day) => { const dayOrders = orders.filter((o) => o.assigned_employee_id === employee.id && orderDay(o) === day); return <div key={`${employee.id}-${day}`} className="min-h-20 rounded-lg border border-slate-100 bg-white p-2 text-xs">{dayOrders.length ? <div className="grid gap-1">{dayOrders.map((order) => <div key={order.id} className={`rounded border p-2 ${statusClasses[order.status]}`}><p className="font-semibold">{order.order_number}</p><p>{order.customer_name}</p><p className="text-slate-600">{timeLabel(order.scheduled_start)}-{timeLabel(order.scheduled_end)}</p></div>)}</div> : <span className="text-slate-400">Ledig</span>}</div>; })}</div>)}</div></div></div>;
}

function OrderList({ orders, profile, employees, onAdminStatus, onStart, onPlan, onInvoice, compact = false }: { orders: Order[]; profile: Profile; employees: Profile[]; onAdminStatus?: (o: Order, s: Status) => void; onStart?: (o: Order) => void; onPlan?: (o: Order) => void; onInvoice?: (o: Order) => void; compact?: boolean }) {
  if (!orders.length) return <p className="text-sm text-slate-600">Ingen ordre.</p>;
  const employeeLabel = (id: string | null) => employees.find((x) => x.id === id)?.full_name ?? "Ikke tildelt";
  return <div className="grid gap-2">{orders.map((o) => <article key={o.id} className={`rounded-lg border p-3 ${statusClasses[o.status]}`}><div className="flex justify-between gap-2"><div><p className="text-xs font-semibold uppercase">{o.order_number}</p><h3 className="font-semibold">{o.customer_name}</h3></div><span className="text-xs font-semibold">{statusLabels[o.status]}</span></div>{!compact && <><p className="mt-2 text-sm text-slate-700">{o.address}</p><p className="text-sm text-slate-600">{orderDay(o) ? dateLabel(orderDay(o)) : "Ikke planlagt"} · {timeLabel(o.scheduled_start)}-{timeLabel(o.scheduled_end)} · {o.estimated_hours ?? 0} t estimert</p>{profile.role === "admin" && <p className="mt-1 text-sm text-slate-600">{employeeLabel(o.assigned_employee_id)}</p>}<p className="mt-2 whitespace-pre-line text-sm">{o.description}</p></>}{profile.role === "admin" && onAdminStatus && o.status !== "planning" && o.status !== "invoiced_archived" && <select className="mt-3 w-full rounded-lg border bg-white p-2 text-sm" value={o.status} onChange={(e) => onAdminStatus(o, e.target.value as Status)}>{Object.entries(statusLabels).filter(([k]) => k !== "planning" && k !== "invoiced_archived").map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}{profile.role === "admin" && onPlan && <button onClick={() => onPlan(o)} className="mt-3 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white">Planlegg</button>}{profile.role === "admin" && onInvoice && <button onClick={() => onInvoice(o)} className="mt-3 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white">Marker som fakturert</button>}{profile.role === "employee" && o.status === "scheduled" && onStart && <button onClick={() => onStart(o)} className="mt-3 rounded-lg border border-emerald-700 px-3 py-2 text-sm font-semibold text-emerald-700">Sett pågår</button>}</article>)}</div>;
}
