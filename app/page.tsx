"use client";

import { createClient, type User } from "@supabase/supabase-js";
import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";

type Role = "admin" | "employee";
type Status = "planning" | "scheduled" | "in_progress" | "completed_pending_invoice" | "invoiced_archived";
type WorkType = "ordinaer" | "reise" | "overtid" | "materiellhenting" | "dokumentasjon";
type EntryMethod = "time_range" | "manual";

type Profile = { id: string; full_name: string; email: string; role: Role; phone: string | null };
type ParticipantProfile = { full_name: string; email: string; role: Role };
type OrderParticipant = { id: string; order_id: string; user_id: string; finished_at: string | null; created_at: string; profiles?: ParticipantProfile | null };
type Order = { id: string; order_number: string; customer_name: string; address: string; contact_person: string | null; phone: string | null; description: string; assigned_employee_id: string | null; order_date: string | null; estimated_hours: number | null; status: Status; internal_comment: string | null; tripletex_id: string | null; scheduled_start: string | null; scheduled_end: string | null; completed_at: string | null; completed_by: string | null; invoiced_at: string | null; invoiced_by: string | null; order_participants?: OrderParticipant[] | null };
type TimeEntry = { id: string; order_id: string; employee_id: string; entry_date: string; entry_method: EntryMethod; start_time: string | null; end_time: string | null; hours: number; comment: string | null; work_type: WorkType; approved: boolean; orders?: { order_number: string; customer_name: string; tripletex_id: string | null; status: Status } | null; profiles?: { full_name: string; email: string } | null };
type PlanForm = { participant_ids: string[]; date: string; start_time: string; estimated_hours: string };

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

const statusLabels: Record<Status, string> = { planning: "Til planlegging", scheduled: "Planlagt", in_progress: "Pågår", completed_pending_invoice: "Ferdig - til fakturering", invoiced_archived: "Fakturert / arkiv" };
const workTypeLabels: Record<WorkType, string> = { ordinaer: "Ordinær", reise: "Reise", overtid: "Overtid", materiellhenting: "Materiellhenting", dokumentasjon: "Dokumentasjon" };
const methodLabels: Record<EntryMethod, string> = { time_range: "Fra-til klokkeslett", manual: "Manuelt antall timer" };
const statusClasses: Record<Status, string> = { planning: "border-slate-200 bg-white", scheduled: "border-emerald-200 bg-emerald-50", in_progress: "border-blue-200 bg-blue-50", completed_pending_invoice: "border-amber-200 bg-amber-50", invoiced_archived: "border-slate-200 bg-slate-50 opacity-80" };

function localIso(date: Date) { const d = new Date(date); d.setHours(12, 0, 0, 0); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function todayIso() { return localIso(new Date()); }
function mondayFor(date: Date) { const d = new Date(date); const day = d.getDay() || 7; d.setDate(d.getDate() - day + 1); d.setHours(12, 0, 0, 0); return d; }
function daysFrom(start: Date, count: number) { return Array.from({ length: count }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return localIso(d); }); }
function dateLabel(date: string) { return new Intl.DateTimeFormat("nb-NO", { weekday: "short", day: "2-digit", month: "2-digit" }).format(new Date(`${date}T12:00:00`)); }
function longDateLabel(date: string) { return new Intl.DateTimeFormat("nb-NO", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(new Date(`${date}T12:00:00`)); }
function timeLabel(value: string | null) { return value ? new Intl.DateTimeFormat("nb-NO", { hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "Ikke satt"; }
function orderDay(order: Order) { return order.scheduled_start?.slice(0, 10) ?? order.order_date ?? ""; }
function calculateHours(start: string, end: string) { if (!start || !end) return 0; const [sh, sm] = start.split(":").map(Number); const [eh, em] = end.split(":").map(Number); return Math.round((((eh * 60 + em) - (sh * 60 + sm)) / 60) * 100) / 100; }
function formatHours(value: number) { return Number.isFinite(value) ? value.toFixed(2).replace(".00", "") : "0"; }
function makeSchedule(date: string, startTime: string, hours: string) { const start = new Date(`${date}T${startTime}:00`); const end = new Date(start); end.setMinutes(end.getMinutes() + Math.round((Number(hours) || 1) * 60)); return { startIso: start.toISOString(), endIso: end.toISOString() }; }
function emptyOrder() { return { order_number: "", customer_name: "", address: "", contact_person: "", phone: "", description: "", participant_ids: [] as string[], order_date: "", start_time: "08:00", estimated_hours: "", internal_comment: "" }; }
function emptyTime(orderId = "") { return { order_id: orderId, entry_date: todayIso(), entry_method: "time_range" as EntryMethod, start_time: "08:00", end_time: "16:00", hours: "7.5", comment: "", work_type: "ordinaer" as WorkType, mark_complete: false }; }
function defaultPlanForm(): PlanForm { return { participant_ids: [], date: todayIso(), start_time: "08:00", estimated_hours: "2" }; }
function plusDays(date: Date, days: number) { const d = new Date(date); d.setDate(d.getDate() + days); return d; }
function easterDate(year: number) { const a = year % 19; const b = Math.floor(year / 100); const c = year % 100; const d = Math.floor(b / 4); const e = b % 4; const f = Math.floor((b + 8) / 25); const g = Math.floor((b - f + 1) / 3); const h = (19 * a + b - d - g + 15) % 30; const i = Math.floor(c / 4); const k = c % 4; const l = (32 + 2 * e + 2 * i - h - k) % 7; const m = Math.floor((a + 11 * h + 22 * l) / 451); const month = Math.floor((h + l - 7 * m + 114) / 31); const day = ((h + l - 7 * m + 114) % 31) + 1; return new Date(year, month - 1, day, 12); }
function norwegianHolidays(year: number) { const easter = easterDate(year); const fixed: Record<string, string> = { [`${year}-01-01`]: "1. nyttårsdag", [`${year}-05-01`]: "Arbeidernes dag", [`${year}-05-17`]: "Grunnlovsdag", [`${year}-12-24`]: "Julaften", [`${year}-12-25`]: "1. juledag", [`${year}-12-26`]: "2. juledag", [`${year}-12-31`]: "Nyttårsaften" }; return { ...fixed, [localIso(plusDays(easter, -3))]: "Skjærtorsdag", [localIso(plusDays(easter, -2))]: "Langfredag", [localIso(easter)]: "1. påskedag", [localIso(plusDays(easter, 1))]: "2. påskedag", [localIso(plusDays(easter, 39))]: "Kristi himmelfartsdag", [localIso(plusDays(easter, 49))]: "1. pinsedag", [localIso(plusDays(easter, 50))]: "2. pinsedag" }; }
function participantIds(order: Order) { const ids = (order.order_participants ?? []).map((x) => x.user_id); if (!ids.length && order.assigned_employee_id) ids.push(order.assigned_employee_id); return Array.from(new Set(ids)); }
function isParticipant(order: Order, userId: string) { return participantIds(order).includes(userId); }
function selectedValues(options: HTMLCollectionOf<HTMLOptionElement>) { return Array.from(options).filter((x) => x.selected).map((x) => x.value); }

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
  const [weekStart, setWeekStart] = useState(() => mondayFor(new Date()));
  const [showWholeWeek, setShowWholeWeek] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [detailParticipantIds, setDetailParticipantIds] = useState<string[]>([]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) void loadData(user.id);
    else { setProfile(null); setOrders([]); setEntries([]); setEmployees([]); }
  }, [user]);

  useEffect(() => {
    const order = orders.find((x) => x.id === selectedOrderId);
    if (order) setDetailParticipantIds(participantIds(order));
  }, [selectedOrderId, orders]);

  async function loadData(userId: string) {
    setMessage("");
    const { data: p, error: pErr } = await supabase.from("profiles").select("*").eq("id", userId).single();
    if (pErr || !p) { setMessage("Fant ikke profil. Sjekk at brukeren finnes i profiles."); return; }

    setProfile(p as Profile);
    const isAdmin = p.role === "admin";
    const { data: o, error: oErr } = await supabase.from("orders").select("*, order_participants(id,order_id,user_id,finished_at,created_at, profiles!order_participants_user_id_fkey(full_name,email,role))").order("scheduled_start", { ascending: true, nullsFirst: true }).order("order_date", { ascending: true, nullsFirst: true });
    if (oErr) setMessage(oErr.message);
    setOrders((o ?? []) as Order[]);

    const timeQuery = supabase.from("time_entries").select("*, orders(order_number,customer_name,tripletex_id,status), profiles!time_entries_employee_id_fkey(full_name,email)").order("entry_date", { ascending: false });
    const { data: t, error: tErr } = isAdmin ? await timeQuery : await timeQuery.eq("employee_id", userId);
    if (tErr) setMessage(tErr.message);
    setEntries((t ?? []) as TimeEntry[]);

    const { data: e } = isAdmin ? await supabase.from("profiles").select("*").order("full_name") : await supabase.from("profiles").select("*").eq("id", userId);
    setEmployees((e ?? []) as Profile[]);
  }

  async function login(e: FormEvent) { e.preventDefault(); setMessage(""); const { error } = await supabase.auth.signInWithPassword({ email, password }); if (error) setMessage("Kunne ikke logge inn. Sjekk e-post og passord."); }
  async function logout() { await supabase.auth.signOut(); }

  async function replaceParticipants(orderId: string, ids: string[]) {
    const uniqueIds = Array.from(new Set(ids));
    const { error: deleteError } = await supabase.from("order_participants").delete().eq("order_id", orderId);
    if (deleteError) return deleteError;
    if (!uniqueIds.length) return null;
    const { error } = await supabase.from("order_participants").insert(uniqueIds.map((user_id) => ({ order_id: orderId, user_id })));
    return error;
  }

  async function createOrder(e: FormEvent) {
    e.preventDefault(); if (!profile || profile.role !== "admin") return;
    const participants = orderForm.participant_ids;
    const hasSchedule = Boolean(participants.length && orderForm.order_date);
    const schedule = hasSchedule ? makeSchedule(orderForm.order_date, orderForm.start_time, orderForm.estimated_hours || "1") : null;
    const { data, error } = await supabase.from("orders").insert({ order_number: orderForm.order_number, customer_name: orderForm.customer_name, address: orderForm.address, contact_person: orderForm.contact_person || null, phone: orderForm.phone || null, description: orderForm.description, assigned_employee_id: hasSchedule ? participants[0] : null, order_date: hasSchedule ? orderForm.order_date : null, scheduled_start: schedule?.startIso ?? null, scheduled_end: schedule?.endIso ?? null, estimated_hours: Number(orderForm.estimated_hours) || null, internal_comment: orderForm.internal_comment || null, status: hasSchedule ? "scheduled" : "planning" }).select("id").single();
    if (error || !data) { setMessage(error?.message ?? "Kunne ikke opprette ordre."); return; }
    const participantError = await replaceParticipants(data.id, participants);
    if (participantError) { setMessage(participantError.message); return; }
    setOrderForm(emptyOrder()); await loadData(profile.id); setTab(hasSchedule ? "ordre" : "planning");
  }

  async function planOrder(e: FormEvent) {
    e.preventDefault(); if (!profile || profile.role !== "admin" || !planningOrderId) return;
    if (!planForm.participant_ids.length || !planForm.date || !planForm.start_time) { setMessage("Velg minst én deltaker, dato og starttid."); return; }
    const schedule = makeSchedule(planForm.date, planForm.start_time, planForm.estimated_hours || "1");
    const { error } = await supabase.from("orders").update({ assigned_employee_id: planForm.participant_ids[0], order_date: planForm.date, scheduled_start: schedule.startIso, scheduled_end: schedule.endIso, estimated_hours: Number(planForm.estimated_hours) || null, status: "scheduled" }).eq("id", planningOrderId);
    if (error) { setMessage(error.message); return; }
    const participantError = await replaceParticipants(planningOrderId, planForm.participant_ids);
    if (participantError) { setMessage(participantError.message); return; }
    setPlanningOrderId(null); setPlanForm(defaultPlanForm()); await loadData(profile.id);
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
      const { error: finishError } = await supabase.from("order_participants").update({ finished_at: new Date().toISOString() }).eq("order_id", timeForm.order_id).eq("user_id", profile.id);
      if (finishError) { setMessage(finishError.message); return; }
    }
    setTimeForm(emptyTime()); await loadData(profile.id); setTab("timer");
  }

  async function updateStatus(order: Order, status: Status) { if (!profile || profile.role !== "admin") return; const { error } = await supabase.from("orders").update({ status }).eq("id", order.id); if (error) setMessage(error.message); else await loadData(profile.id); }
  async function markInProgress(order: Order) { if (!profile) return; const { error } = await supabase.from("orders").update({ status: "in_progress" }).eq("id", order.id); if (error) setMessage(error.message); else await loadData(profile.id); }
  async function markInvoiced(order: Order) { if (!profile || profile.role !== "admin") return; const { error } = await supabase.from("orders").update({ status: "invoiced_archived", invoiced_at: new Date().toISOString(), invoiced_by: profile.id }).eq("id", order.id); if (error) setMessage(error.message); else await loadData(profile.id); }
  async function approveEntry(id: string) { if (!profile) return; const { error } = await supabase.from("time_entries").update({ approved: true }).eq("id", id); if (error) setMessage(error.message); else await loadData(profile.id); }

  async function saveDetailParticipants() {
    if (!profile || profile.role !== "admin" || !selectedOrderId) return;
    const participantError = await replaceParticipants(selectedOrderId, detailParticipantIds);
    if (participantError) { setMessage(participantError.message); return; }
    const first = detailParticipantIds[0] ?? null;
    const { error } = await supabase.from("orders").update({ assigned_employee_id: first }).eq("id", selectedOrderId);
    if (error) setMessage(error.message);
    else await loadData(profile.id);
  }

  async function setParticipantFinished(participant: OrderParticipant, finished: boolean) {
    if (!profile) return;
    const { error } = await supabase.from("order_participants").update({ finished_at: finished ? new Date().toISOString() : null }).eq("id", participant.id);
    if (error) setMessage(error.message);
    else await loadData(profile.id);
  }

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
  const employeeOrders = profile ? activeOrders.filter((o) => isParticipant(o, profile.id)) : [];
  const todayOrders = (profile?.role === "admin" ? activeOrders : employeeOrders).filter((o) => orderDay(o) === todayIso());
  const calendarDays = daysFrom(weekStart, showWholeWeek ? 7 : 5);
  const weekOrders = (profile?.role === "admin" ? activeOrders : employeeOrders).filter((o) => calendarDays.includes(orderDay(o)) && o.status !== "planning");
  const scheduledWeekOrders = activeOrders.filter((o) => calendarDays.includes(orderDay(o)) && participantIds(o).length);
  const unapproved = entries.filter((x) => !x.approved);
  const visibleOrders = useMemo(() => activeOrders.filter((o) => o.status !== "planning"), [activeOrders]);
  const selectedPlanningOrder = planningOrders.find((o) => o.id === planningOrderId) ?? null;
  const selectedOrder = orders.find((o) => o.id === selectedOrderId) ?? null;
  const archiveMatches = archiveOrders.filter((o) => `${o.order_number} ${o.customer_name} ${o.address}`.toLowerCase().includes(archiveSearch.toLowerCase()));
  const tabs = profile?.role === "admin" ? ["oversikt", "ordre", "planning", "kalender", "invoice", "archive", "timer"] : ["oversikt", "ordre", "kalender", "timer"];
  const calculatedHours = calculateHours(timeForm.start_time, timeForm.end_time);
  const holidayMap = useMemo(() => ({ ...norwegianHolidays(weekStart.getFullYear()), ...norwegianHolidays(weekStart.getFullYear() + 1), ...norwegianHolidays(weekStart.getFullYear() - 1) }), [weekStart]);

  if (!user || !profile) return <main className="grid min-h-screen place-items-center p-4"><form onSubmit={login} className="w-full max-w-md rounded-lg border border-emerald-100 bg-white p-5 shadow-sm"><p className="font-semibold text-emerald-700">Låsia AS internapp</p><h1 className="mt-1 text-2xl font-bold">Logg inn</h1><input className="mt-5 w-full rounded-lg border p-3" placeholder="E-post" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /><input className="mt-3 w-full rounded-lg border p-3" placeholder="Passord" type="password" value={password} onChange={(e) => setPassword(e.target.value)} /><button className="mt-4 w-full rounded-lg bg-emerald-700 p-3 font-semibold text-white">Logg inn</button>{message && <p className="mt-3 rounded bg-red-50 p-3 text-sm text-red-700">{message}</p>}</form></main>;

  return <main className="mx-auto max-w-6xl p-4 pb-24"><header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-emerald-700">Låsia AS</p><h1 className="text-2xl font-bold">Hei, {profile.full_name}</h1><p className="text-sm text-slate-600">{profile.role === "admin" ? "Admin" : "Ansatt"}</p></div><button onClick={logout} className="rounded-lg border px-4 py-3 font-semibold">Logg ut</button></header>{message && <p className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700">{message}</p>}<nav className="mb-5 grid gap-2 sm:grid-cols-3 lg:grid-cols-7">{tabs.map((id) => <Tab key={id} id={id} tab={tab} setTab={setTab}>{tabLabel(id)}</Tab>)}</nav>{selectedOrder && <OrderDetail order={selectedOrder} profile={profile} employees={employees} entries={entries.filter((x) => x.order_id === selectedOrder.id)} participantIds={detailParticipantIds} setParticipantIds={setDetailParticipantIds} onSaveParticipants={saveDetailParticipants} onFinish={setParticipantFinished} onClose={() => setSelectedOrderId(null)} />}{tab === "oversikt" && <section className="grid gap-4 md:grid-cols-2"><Panel title="Dagens jobber"><OrderList orders={todayOrders} profile={profile} employees={employees} onAdminStatus={updateStatus} onStart={markInProgress} onOpen={setSelectedOrderId} /></Panel><Panel title="Ukens jobber"><OrderList orders={weekOrders} profile={profile} employees={employees} onAdminStatus={updateStatus} onStart={markInProgress} onOpen={setSelectedOrderId} /></Panel>{profile.role === "admin" && <Panel title="Til planlegging"><p className="text-3xl font-bold">{planningOrders.length}</p></Panel>}<Panel title="Ikke-godkjente timer"><p className="text-3xl font-bold">{unapproved.length}</p></Panel>{profile.role === "admin" && <Panel title="Til fakturering"><p className="text-3xl font-bold">{invoiceOrders.length}</p></Panel>}</section>}{tab === "ordre" && <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">{profile.role === "admin" && <Panel title="Ny ordre"><form onSubmit={createOrder} className="grid gap-3"><Input label="Ordrenummer" value={orderForm.order_number} onChange={(v) => setOrderForm({ ...orderForm, order_number: v })} /><Input label="Kundenavn" value={orderForm.customer_name} onChange={(v) => setOrderForm({ ...orderForm, customer_name: v })} /><Input label="Adresse" value={orderForm.address} onChange={(v) => setOrderForm({ ...orderForm, address: v })} /><Input label="Kontaktperson" value={orderForm.contact_person} onChange={(v) => setOrderForm({ ...orderForm, contact_person: v })} required={false} /><Input label="Telefonnummer" value={orderForm.phone} onChange={(v) => setOrderForm({ ...orderForm, phone: v })} required={false} /><MultiSelect label="Deltakere" value={orderForm.participant_ids} options={employees} onChange={(ids) => setOrderForm({ ...orderForm, participant_ids: ids })} /><Input label="Dato" type="date" value={orderForm.order_date} onChange={(v) => setOrderForm({ ...orderForm, order_date: v })} required={false} /><Input label="Starttid" type="time" value={orderForm.start_time} onChange={(v) => setOrderForm({ ...orderForm, start_time: v })} required={false} /><Input label="Estimert tid" type="number" value={orderForm.estimated_hours} onChange={(v) => setOrderForm({ ...orderForm, estimated_hours: v })} required={false} /><TextArea label="Beskrivelse" value={orderForm.description} onChange={(v) => setOrderForm({ ...orderForm, description: v })} /><TextArea label="Intern kommentar" value={orderForm.internal_comment} onChange={(v) => setOrderForm({ ...orderForm, internal_comment: v })} required={false} /><p className="text-sm text-slate-600">Uten dato og deltakere blir ordren lagt i Til planlegging.</p><button className="rounded-lg bg-emerald-700 p-3 font-semibold text-white">Opprett ordre</button></form></Panel>}<Panel title="Aktive ordre"><OrderList orders={profile.role === "admin" ? visibleOrders : employeeOrders} profile={profile} employees={employees} onAdminStatus={updateStatus} onStart={markInProgress} onOpen={setSelectedOrderId} /></Panel></section>}{tab === "planning" && profile.role === "admin" && <section className="grid gap-4 xl:grid-cols-[360px_1fr]"><div className="grid gap-4"><Panel title="Til planlegging"><OrderList orders={planningOrders} profile={profile} employees={employees} onOpen={setSelectedOrderId} onPlan={(o) => { setPlanningOrderId(o.id); setPlanForm({ participant_ids: participantIds(o), date: o.order_date ?? todayIso(), start_time: o.scheduled_start ? new Date(o.scheduled_start).toTimeString().slice(0, 5) : "08:00", estimated_hours: String(o.estimated_hours ?? 2) }); }} /></Panel><Panel title={selectedPlanningOrder ? `Planlegg ${selectedPlanningOrder.order_number}` : "Planlegg ordre"}>{selectedPlanningOrder ? <form onSubmit={planOrder} className="grid gap-3"><MultiSelect label="Deltakere" value={planForm.participant_ids} options={employees} onChange={(ids) => setPlanForm({ ...planForm, participant_ids: ids })} /><Input label="Dato" type="date" value={planForm.date} onChange={(v) => setPlanForm({ ...planForm, date: v })} /><Input label="Starttid" type="time" value={planForm.start_time} onChange={(v) => setPlanForm({ ...planForm, start_time: v })} /><Input label="Estimert varighet" type="number" value={planForm.estimated_hours} onChange={(v) => setPlanForm({ ...planForm, estimated_hours: v })} /><button className="rounded-lg bg-emerald-700 p-3 font-semibold text-white">Planlegg</button></form> : <p className="text-sm text-slate-600">Velg en ordre til venstre.</p>}</Panel></div><Panel title="Ukeplan per deltaker"><CalendarControls weekStart={weekStart} setWeekStart={setWeekStart} showWholeWeek={showWholeWeek} setShowWholeWeek={setShowWholeWeek} /><EmployeeWeek orders={scheduledWeekOrders} employees={employees} week={calendarDays} holidays={holidayMap} onOpen={setSelectedOrderId} /></Panel></section>}{tab === "kalender" && <section className="grid gap-4"><Panel title={profile.role === "admin" ? "Min kalender" : "Kalender"}><CalendarControls weekStart={weekStart} setWeekStart={setWeekStart} showWholeWeek={showWholeWeek} setShowWholeWeek={setShowWholeWeek} /><div className="grid gap-3 md:grid-cols-5" style={{ gridTemplateColumns: `repeat(${calendarDays.length}, minmax(0, 1fr))` }}>{calendarDays.map((day) => <Panel key={day} title={dateLabel(day)}><HolidayLabel name={holidayMap[day]} /><OrderList orders={employeeOrders.filter((o) => o.status !== "planning" && orderDay(o) === day)} profile={profile} employees={employees} onStart={markInProgress} onOpen={setSelectedOrderId} compact /></Panel>)}</div></Panel></section>}{tab === "invoice" && profile.role === "admin" && <Panel title="Til fakturering"><OrderList orders={invoiceOrders} profile={profile} employees={employees} onInvoice={markInvoiced} onOpen={setSelectedOrderId} /></Panel>}{tab === "archive" && profile.role === "admin" && <Panel title="Arkiv"><input className="mb-3 w-full rounded-lg border p-3" placeholder="Søk på ordrenummer, kunde eller adresse" value={archiveSearch} onChange={(e) => setArchiveSearch(e.target.value)} /><OrderList orders={archiveMatches} profile={profile} employees={employees} onOpen={setSelectedOrderId} /></Panel>}{tab === "timer" && <section className="grid gap-4 lg:grid-cols-[1fr_1fr]"><Panel title="Ny timeføring"><form onSubmit={saveTime} className="grid gap-3"><label className="grid gap-1 text-sm font-medium">Ordre<select className="rounded-lg border p-3" value={timeForm.order_id} onChange={(e) => setTimeForm({ ...timeForm, order_id: e.target.value })} required><option value="">Velg ordre</option>{activeOrders.filter((o) => o.status !== "planning" && o.status !== "completed_pending_invoice" && (profile.role === "admin" || isParticipant(o, profile.id))).map((o) => <option key={o.id} value={o.id}>{o.order_number} - {o.customer_name}</option>)}</select></label><Input label="Dato" type="date" value={timeForm.entry_date} onChange={(v) => setTimeForm({ ...timeForm, entry_date: v })} /><div className="grid gap-2 rounded-lg bg-slate-50 p-3"><p className="text-sm font-semibold">Metode</p><label className="flex items-center gap-2 text-sm"><input type="radio" checked={timeForm.entry_method === "time_range"} onChange={() => setTimeForm({ ...timeForm, entry_method: "time_range" })} />Fra-til klokkeslett</label><label className="flex items-center gap-2 text-sm"><input type="radio" checked={timeForm.entry_method === "manual"} onChange={() => setTimeForm({ ...timeForm, entry_method: "manual" })} />Manuelt antall timer</label></div>{timeForm.entry_method === "time_range" ? <><Input label="Starttid" type="time" value={timeForm.start_time} onChange={(v) => setTimeForm({ ...timeForm, start_time: v })} /><Input label="Sluttid" type="time" value={timeForm.end_time} onChange={(v) => setTimeForm({ ...timeForm, end_time: v })} /><div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-sm"><span className="font-semibold">Beregnet tid:</span> {formatHours(calculatedHours)} timer</div></> : <Input label="Antall timer" type="number" value={timeForm.hours} onChange={(v) => setTimeForm({ ...timeForm, hours: v })} />}<label className="grid gap-1 text-sm font-medium">Type arbeid<select className="rounded-lg border p-3" value={timeForm.work_type} onChange={(e) => setTimeForm({ ...timeForm, work_type: e.target.value as WorkType })}>{Object.entries(workTypeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label><TextArea label="Kommentar" value={timeForm.comment} onChange={(v) => setTimeForm({ ...timeForm, comment: v })} required={false} /><label className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm font-medium"><input type="checkbox" checked={timeForm.mark_complete} onChange={(e) => setTimeForm({ ...timeForm, mark_complete: e.target.checked })} />Min del er ferdig</label><button className="rounded-lg bg-emerald-700 p-3 font-semibold text-white">Lagre timer</button></form></Panel><Panel title="Timer"><div className="mb-3 flex justify-end">{profile.role === "admin" && <button onClick={exportCsv} className="rounded-lg border border-emerald-700 px-4 py-2 font-semibold text-emerald-700">Eksporter CSV</button>}</div><div className="grid gap-2">{entries.map((x) => <div key={x.id} className="rounded-lg border bg-white p-3 text-sm"><div className="flex justify-between gap-2"><strong>{x.entry_date} · {x.orders?.order_number}</strong><span>{x.hours} t</span></div><p className="text-slate-600">{x.profiles?.full_name ? `${x.profiles.full_name} · ` : ""}{workTypeLabels[x.work_type]} · {methodLabels[x.entry_method ?? "time_range"]} · {x.approved ? "Godkjent" : "Ikke godkjent"}</p>{x.entry_method === "time_range" && <p className="text-slate-600">{x.start_time}-{x.end_time}</p>}{profile.role === "admin" && !x.approved && <button onClick={() => approveEntry(x.id)} className="mt-2 rounded bg-emerald-700 px-3 py-2 text-white">Godkjenn</button>}</div>)}</div></Panel></section>}</main>;
}

function tabLabel(id: string) { return ({ oversikt: "Dashboard", ordre: "Ordre", planning: "Planlegging", kalender: "Kalender", invoice: "Til fakturering", archive: "Arkiv", timer: "Timer" } as Record<string, string>)[id] ?? id; }
function Tab({ id, tab, setTab, children }: { id: string; tab: string; setTab: (id: string) => void; children: ReactNode }) { return <button onClick={() => setTab(id)} className={`rounded-lg px-3 py-3 text-sm font-semibold ${tab === id ? "bg-emerald-700 text-white" : "bg-white text-slate-700"}`}>{children}</button>; }
function Panel({ title, children }: { title: string; children: ReactNode }) { return <section className="rounded-lg border border-emerald-100 bg-white p-4 shadow-sm"><h2 className="mb-3 font-semibold">{title}</h2>{children}</section>; }
function Input({ label, value, onChange, type = "text", required = true }: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean }) { return <label className="grid gap-1 text-sm font-medium">{label}<input required={required} className="rounded-lg border p-3" type={type} value={value} onChange={(e) => onChange(e.target.value)} /></label>; }
function TextArea({ label, value, onChange, required = true }: { label: string; value: string; onChange: (v: string) => void; required?: boolean }) { return <label className="grid gap-1 text-sm font-medium">{label}<textarea required={required} className="rounded-lg border p-3" rows={3} value={value} onChange={(e) => onChange(e.target.value)} /></label>; }
function MultiSelect({ label, value, options, onChange }: { label: string; value: string[]; options: Profile[]; onChange: (ids: string[]) => void }) { return <label className="grid gap-1 text-sm font-medium">{label}<select multiple className="min-h-32 rounded-lg border p-3" value={value} onChange={(e) => onChange(selectedValues(e.currentTarget.selectedOptions))}>{options.map((x) => <option key={x.id} value={x.id}>{x.full_name}{x.role === "admin" ? " (admin)" : ""}</option>)}</select><span className="text-xs text-slate-500">Hold Ctrl/Cmd for å velge flere.</span></label>; }
function HolidayLabel({ name }: { name?: string }) { return name ? <p className="mb-2 rounded-lg border border-red-100 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">{name}</p> : null; }
function CalendarControls({ weekStart, setWeekStart, showWholeWeek, setShowWholeWeek }: { weekStart: Date; setWeekStart: (date: Date) => void; showWholeWeek: boolean; setShowWholeWeek: (show: boolean) => void }) { return <div className="mb-4 grid gap-3"><div className="flex flex-wrap items-center gap-2"><button onClick={() => setWeekStart(plusDays(weekStart, -7))} className="rounded-lg border px-3 py-2 text-sm font-semibold">Forrige uke</button><button onClick={() => setWeekStart(mondayFor(new Date()))} className="rounded-lg border px-3 py-2 text-sm font-semibold">Denne uken</button><button onClick={() => setWeekStart(plusDays(weekStart, 7))} className="rounded-lg border px-3 py-2 text-sm font-semibold">Neste uke</button><span className="text-sm font-semibold text-slate-700">Uke fra {dateLabel(localIso(weekStart))}</span></div><div className="flex flex-wrap gap-3 text-sm"><label className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2"><input type="radio" checked={!showWholeWeek} onChange={() => setShowWholeWeek(false)} />Vis arbeidsuke</label><label className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2"><input type="radio" checked={showWholeWeek} onChange={() => setShowWholeWeek(true)} />Vis hele uken</label></div></div>; }

function EmployeeWeek({ orders, employees, week, holidays, onOpen }: { orders: Order[]; employees: Profile[]; week: string[]; holidays: Record<string, string>; onOpen: (id: string) => void }) {
  if (!employees.length) return <p className="text-sm text-slate-600">Ingen ansatte er opprettet ennå.</p>;
  const columns = `160px repeat(${week.length}, minmax(96px, 1fr))`;
  return <div className="overflow-x-auto"><div className="min-w-[760px]"><div className="grid gap-2 text-xs font-semibold text-slate-600" style={{ gridTemplateColumns: columns }}><div>Deltaker</div>{week.map((day) => <div key={day}>{dateLabel(day)}{holidays[day] && <p className="font-normal text-red-700">{holidays[day]}</p>}</div>)}</div><div className="mt-2 grid gap-2">{employees.map((employee) => <div key={employee.id} className="grid gap-2" style={{ gridTemplateColumns: columns }}><div className="rounded-lg bg-slate-50 p-2 text-sm font-semibold">{employee.full_name}</div>{week.map((day) => { const dayOrders = orders.filter((o) => isParticipant(o, employee.id) && orderDay(o) === day); return <div key={`${employee.id}-${day}`} className="min-h-20 rounded-lg border border-slate-100 bg-white p-2 text-xs">{dayOrders.length ? <div className="grid gap-1">{dayOrders.map((order) => <button key={order.id} onClick={() => onOpen(order.id)} className={`rounded border p-2 text-left ${statusClasses[order.status]}`}><p className="font-semibold">{order.order_number}</p><p>{order.customer_name}</p><p className="text-slate-600">{timeLabel(order.scheduled_start)}-{timeLabel(order.scheduled_end)}</p></button>)}</div> : <span className="text-slate-400">Ledig</span>}</div>; })}</div>)}</div></div></div>;
}

function OrderList({ orders, profile, employees, onAdminStatus, onStart, onPlan, onInvoice, onOpen, compact = false }: { orders: Order[]; profile: Profile; employees: Profile[]; onAdminStatus?: (o: Order, s: Status) => void; onStart?: (o: Order) => void; onPlan?: (o: Order) => void; onInvoice?: (o: Order) => void; onOpen?: (id: string) => void; compact?: boolean }) {
  if (!orders.length) return <p className="text-sm text-slate-600">Ingen ordre.</p>;
  const participantLabel = (order: Order) => participantIds(order).map((id) => employees.find((x) => x.id === id)?.full_name ?? order.order_participants?.find((x) => x.user_id === id)?.profiles?.full_name ?? "Deltaker").join(", ") || "Ikke tildelt";
  return <div className="grid gap-2">{orders.map((o) => <article key={o.id} className={`rounded-lg border p-3 ${statusClasses[o.status]}`}><button type="button" onClick={() => onOpen?.(o.id)} className="block w-full text-left"><div className="flex justify-between gap-2"><div><p className="text-xs font-semibold uppercase">{o.order_number}</p><h3 className="font-semibold">{o.customer_name}</h3></div><span className="text-xs font-semibold">{statusLabels[o.status]}</span></div>{!compact && <><p className="mt-2 text-sm text-slate-700">{o.address}</p><p className="text-sm text-slate-600">{orderDay(o) ? dateLabel(orderDay(o)) : "Ikke planlagt"} · {timeLabel(o.scheduled_start)}-{timeLabel(o.scheduled_end)} · {o.estimated_hours ?? 0} t estimert</p><p className="mt-1 text-sm text-slate-600">{participantLabel(o)}</p><p className="mt-2 whitespace-pre-line text-sm">{o.description}</p></>}</button>{profile.role === "admin" && onAdminStatus && o.status !== "planning" && o.status !== "invoiced_archived" && <select className="mt-3 w-full rounded-lg border bg-white p-2 text-sm" value={o.status} onChange={(e) => onAdminStatus(o, e.target.value as Status)}>{Object.entries(statusLabels).filter(([k]) => k !== "planning" && k !== "invoiced_archived").map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}{profile.role === "admin" && onPlan && <button onClick={() => onPlan(o)} className="mt-3 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white">Planlegg</button>}{profile.role === "admin" && onInvoice && <button onClick={() => onInvoice(o)} className="mt-3 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white">Marker som fakturert</button>}{isParticipant(o, profile.id) && o.status === "scheduled" && onStart && <button onClick={() => onStart(o)} className="mt-3 rounded-lg border border-emerald-700 px-3 py-2 text-sm font-semibold text-emerald-700">Sett pågår</button>}</article>)}</div>;
}

function OrderDetail({ order, profile, employees, entries, participantIds: participantState, setParticipantIds, onSaveParticipants, onFinish, onClose }: { order: Order; profile: Profile; employees: Profile[]; entries: TimeEntry[]; participantIds: string[]; setParticipantIds: (ids: string[]) => void; onSaveParticipants: () => void; onFinish: (participant: OrderParticipant, finished: boolean) => void; onClose: () => void }) {
  const participants = order.order_participants ?? [];
  const participantName = (p: OrderParticipant) => employees.find((x) => x.id === p.user_id)?.full_name ?? p.profiles?.full_name ?? "Deltaker";
  const canChangeOwnFinish = (p: OrderParticipant) => profile.role === "admin" || p.user_id === profile.id;
  return <Panel title={`Ordre ${order.order_number}`}><div className="mb-4 flex justify-end"><button onClick={onClose} className="rounded-lg border px-3 py-2 text-sm font-semibold">Lukk</button></div><div className="grid gap-4 lg:grid-cols-2"><div className="grid gap-2 text-sm"><Info label="Kunde" value={order.customer_name} /><Info label="Adresse" value={order.address} /><Info label="Kontaktperson" value={order.contact_person ?? "Ikke registrert"} /><Info label="Telefon" value={order.phone ?? "Ikke registrert"} /><Info label="Status" value={statusLabels[order.status]} /><Info label="Planlagt" value={`${orderDay(order) ? longDateLabel(orderDay(order)) : "Ikke planlagt"} · ${timeLabel(order.scheduled_start)}-${timeLabel(order.scheduled_end)}`} /><Info label="Estimert tid" value={`${order.estimated_hours ?? 0} t`} /><Info label="Fakturert/arkiv" value={order.status === "invoiced_archived" ? `Ja${order.invoiced_at ? `, ${longDateLabel(order.invoiced_at.slice(0, 10))}` : ""}` : "Nei"} /><div><p className="font-semibold">Beskrivelse</p><p className="whitespace-pre-line text-slate-700">{order.description}</p></div><div><p className="font-semibold">Intern kommentar</p><p className="whitespace-pre-line text-slate-700">{order.internal_comment || "Ingen intern kommentar."}</p></div></div><div className="grid gap-4"><div><h3 className="mb-2 font-semibold">Tildelte deltakere</h3>{profile.role === "admin" && <div className="mb-3"><MultiSelect label="Endre deltakere" value={participantState} options={employees} onChange={setParticipantIds} /><button onClick={onSaveParticipants} className="mt-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white">Lagre deltakere</button></div>}<div className="grid gap-2">{participants.length ? participants.map((p) => <div key={p.id} className="rounded-lg border p-3 text-sm"><div className="flex items-center justify-between gap-2"><div><p className="font-semibold">{participantName(p)}</p><p className="text-slate-600">{p.finished_at ? `Ferdig ${longDateLabel(p.finished_at.slice(0, 10))}` : "Ikke ferdig"}</p></div>{canChangeOwnFinish(p) && <label className="flex items-center gap-2"><input type="checkbox" checked={Boolean(p.finished_at)} onChange={(e) => onFinish(p, e.target.checked)} />Ferdig</label>}</div></div>) : <p className="text-sm text-slate-600">Ingen deltakere.</p>}</div></div><div><h3 className="mb-2 font-semibold">Timeføringer</h3><div className="grid gap-2">{entries.length ? entries.map((x) => <div key={x.id} className="rounded-lg border p-3 text-sm"><p className="font-semibold">{x.entry_date} · {x.hours} t · {workTypeLabels[x.work_type]}</p><p className="text-slate-600">{x.profiles?.full_name ?? "Ansatt"} · {methodLabels[x.entry_method ?? "time_range"]} · {x.approved ? "Godkjent" : "Ikke godkjent"}</p>{x.start_time && x.end_time && <p className="text-slate-600">{x.start_time}-{x.end_time}</p>}{x.comment && <p className="mt-1 whitespace-pre-line">{x.comment}</p>}</div>) : <p className="text-sm text-slate-600">Ingen timeføringer.</p>}</div></div></div></div></Panel>;
}
function Info({ label, value }: { label: string; value: string }) { return <p><span className="font-semibold">{label}:</span> {value}</p>; }
