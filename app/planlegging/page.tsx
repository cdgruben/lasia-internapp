"use client";

import { createClient, type User } from "@supabase/supabase-js";
import { FormEvent, useEffect, useMemo, useState } from "react";

type Role = "admin" | "employee";
type Status = "planning" | "scheduled" | "in_progress" | "completed_pending_invoice" | "invoiced_archived";
type Profile = { id: string; full_name: string; email: string; role: Role };
type OrderParticipant = { id: string; order_id: string; user_id: string; finished_at: string | null; profiles?: { full_name: string; email: string; role: Role } | null };
type Order = { id: string; order_number: string; customer_name: string; address: string; description: string; assigned_employee_id: string | null; order_date: string | null; estimated_hours: number | null; status: Status; scheduled_start: string | null; scheduled_end: string | null; order_participants?: OrderParticipant[] | null };
type PlanForm = { order_id: string; participant_ids: string[]; date: string; start_time: string; estimated_hours: string };

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
const statusLabels: Record<Status, string> = { planning: "Til planlegging", scheduled: "Planlagt", in_progress: "Pågår", completed_pending_invoice: "Ferdig - til fakturering", invoiced_archived: "Fakturert / arkiv" };
const statusClasses: Record<Status, string> = { planning: "border-slate-200 bg-white", scheduled: "border-emerald-200 bg-emerald-50", in_progress: "border-blue-200 bg-blue-50", completed_pending_invoice: "border-amber-200 bg-amber-50", invoiced_archived: "border-slate-200 bg-slate-50 opacity-80" };
const slots = ["08:00", "10:00", "12:00", "14:00"];

function localIso(date: Date) { const d = new Date(date); d.setHours(12, 0, 0, 0); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function todayIso() { return localIso(new Date()); }
function mondayFor(date: Date) { const d = new Date(date); const day = d.getDay() || 7; d.setDate(d.getDate() - day + 1); d.setHours(12, 0, 0, 0); return d; }
function plusDays(date: Date, days: number) { const d = new Date(date); d.setDate(d.getDate() + days); return d; }
function daysFrom(start: Date, count: number) { return Array.from({ length: count }, (_, i) => localIso(plusDays(start, i))); }
function dateLabel(date: string) { return new Intl.DateTimeFormat("nb-NO", { weekday: "short", day: "2-digit", month: "2-digit" }).format(new Date(`${date}T12:00:00`)); }
function timeLabel(value: string | null) { return value ? new Intl.DateTimeFormat("nb-NO", { hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "Ikke satt"; }
function orderDay(order: Order) { return order.scheduled_start?.slice(0, 10) ?? order.order_date ?? ""; }
function participantIds(order: Order) { const ids = (order.order_participants ?? []).map((x) => x.user_id); if (!ids.length && order.assigned_employee_id) ids.push(order.assigned_employee_id); return Array.from(new Set(ids)); }
function makeSchedule(date: string, startTime: string, hours: string) { const start = new Date(`${date}T${startTime}:00`); const end = new Date(start); end.setMinutes(end.getMinutes() + Math.round((Number(hours) || 1) * 60)); return { startIso: start.toISOString(), endIso: end.toISOString() }; }
function hourFromIso(value: string | null) { return value ? new Date(value).toTimeString().slice(0, 5) : "08:00"; }
function durationFromOrder(order: Order) { return String(order.estimated_hours ?? 2); }
function easterDate(year: number) { const a = year % 19; const b = Math.floor(year / 100); const c = year % 100; const d = Math.floor(b / 4); const e = b % 4; const f = Math.floor((b + 8) / 25); const g = Math.floor((b - f + 1) / 3); const h = (19 * a + b - d - g + 15) % 30; const i = Math.floor(c / 4); const k = c % 4; const l = (32 + 2 * e + 2 * i - h - k) % 7; const m = Math.floor((a + 11 * h + 22 * l) / 451); const month = Math.floor((h + l - 7 * m + 114) / 31); const day = ((h + l - 7 * m + 114) % 31) + 1; return new Date(year, month - 1, day, 12); }
function norwegianHolidays(year: number) { const easter = easterDate(year); const fixed: Record<string, string> = { [`${year}-01-01`]: "1. nyttårsdag", [`${year}-05-01`]: "Arbeidernes dag", [`${year}-05-17`]: "Grunnlovsdag", [`${year}-12-24`]: "Julaften", [`${year}-12-25`]: "1. juledag", [`${year}-12-26`]: "2. juledag", [`${year}-12-31`]: "Nyttårsaften" }; return { ...fixed, [localIso(plusDays(easter, -3))]: "Skjærtorsdag", [localIso(plusDays(easter, -2))]: "Langfredag", [localIso(easter)]: "1. påskedag", [localIso(plusDays(easter, 1))]: "2. påskedag", [localIso(plusDays(easter, 39))]: "Kristi himmelfartsdag", [localIso(plusDays(easter, 49))]: "1. pinsedag", [localIso(plusDays(easter, 50))]: "2. pinsedag" }; }

export default function PlanningPage() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [message, setMessage] = useState("");
  const [weekStart, setWeekStart] = useState(() => mondayFor(new Date()));
  const [showWholeWeek, setShowWholeWeek] = useState(false);
  const [draggedOrderId, setDraggedOrderId] = useState<string | null>(null);
  const [planForm, setPlanForm] = useState<PlanForm | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => { if (user) void loadData(user.id); }, [user]);

  async function loadData(userId: string) {
    const { data: p, error: pErr } = await supabase.from("profiles").select("id,full_name,email,role").eq("id", userId).single();
    if (pErr || !p) { setMessage("Fant ikke profil."); return; }
    setProfile(p as Profile);
    if (p.role !== "admin") return;
    const { data: e } = await supabase.from("profiles").select("id,full_name,email,role").order("full_name");
    setEmployees((e ?? []) as Profile[]);
    const { data: o, error: oErr } = await supabase.from("orders").select("*, order_participants(id,order_id,user_id,finished_at, profiles!order_participants_user_id_fkey(full_name,email,role))").order("scheduled_start", { ascending: true, nullsFirst: true }).order("order_date", { ascending: true, nullsFirst: true });
    if (oErr) setMessage(oErr.message);
    setOrders((o ?? []) as Order[]);
  }

  async function replaceParticipants(orderId: string, ids: string[]) {
    const uniqueIds = Array.from(new Set(ids));
    const { data: existing, error: readError } = await supabase.from("order_participants").select("id,user_id").eq("order_id", orderId);
    if (readError) return readError;
    const current = existing ?? [];
    const removeIds = current.filter((x) => !uniqueIds.includes(x.user_id)).map((x) => x.id);
    if (removeIds.length) {
      const { error } = await supabase.from("order_participants").delete().in("id", removeIds);
      if (error) return error;
    }
    const addIds = uniqueIds.filter((id) => !current.some((x) => x.user_id === id));
    if (!addIds.length) return null;
    const { error } = await supabase.from("order_participants").insert(addIds.map((user_id) => ({ order_id: orderId, user_id })));
    return error;
  }

  function openPlan(order: Order, date?: string, startTime?: string, employeeId?: string) {
    const ids = participantIds(order);
    setPlanForm({
      order_id: order.id,
      participant_ids: employeeId && !ids.includes(employeeId) ? [...ids, employeeId] : ids,
      date: date ?? ((order.order_date ?? orderDay(order)) || todayIso()),
      start_time: startTime ?? hourFromIso(order.scheduled_start),
      estimated_hours: durationFromOrder(order),
    });
  }

  function onDrop(orderId: string, date: string, startTime: string, employeeId: string) {
    const order = orders.find((x) => x.id === orderId);
    if (order) openPlan(order, date, startTime, employeeId);
    setDraggedOrderId(null);
  }

  async function savePlan(e: FormEvent) {
    e.preventDefault();
    if (!profile || !planForm || !planForm.participant_ids.length) return;
    const schedule = makeSchedule(planForm.date, planForm.start_time, planForm.estimated_hours || "1");
    const { error } = await supabase.from("orders").update({ assigned_employee_id: planForm.participant_ids[0], order_date: planForm.date, scheduled_start: schedule.startIso, scheduled_end: schedule.endIso, estimated_hours: Number(planForm.estimated_hours) || null, status: "scheduled" }).eq("id", planForm.order_id);
    if (error) { setMessage(error.message); return; }
    const participantError = await replaceParticipants(planForm.order_id, planForm.participant_ids);
    if (participantError) { setMessage(participantError.message); return; }
    setPlanForm(null);
    await loadData(profile.id);
  }

  const week = daysFrom(weekStart, showWholeWeek ? 7 : 5);
  const holidays = useMemo(() => ({ ...norwegianHolidays(weekStart.getFullYear()), ...norwegianHolidays(weekStart.getFullYear() + 1), ...norwegianHolidays(weekStart.getFullYear() - 1) }), [weekStart]);
  const planningOrders = orders.filter((x) => x.status === "planning");
  const activeOrders = orders.filter((x) => x.status !== "planning" && x.status !== "invoiced_archived" && week.includes(orderDay(x)));

  if (!user) return <main className="mx-auto max-w-6xl p-4"><Panel title="Planlegging"><p>Logg inn i Låsia-appen først, og åpne denne siden på nytt.</p></Panel></main>;
  if (profile && profile.role !== "admin") return <main className="mx-auto max-w-6xl p-4"><Panel title="Planlegging"><p>Kun admin kan planlegge ordre.</p></Panel></main>;

  return <main className="mx-auto max-w-7xl p-4 pb-20"><header className="mb-5"><p className="font-semibold text-emerald-700">Låsia AS</p><h1 className="text-2xl font-bold">Drag-and-drop planlegging</h1><p className="text-sm text-slate-600">Dra ordre fra Til planlegging, eller flytt planlagte ordre til ny dato/tid.</p></header>{message && <p className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700">{message}</p>}<section className="grid gap-4 xl:grid-cols-[360px_1fr]"><Panel title="Til planlegging"><div className="grid gap-2">{planningOrders.length ? planningOrders.map((order) => <OrderCard key={order.id} order={order} draggable onDragStart={setDraggedOrderId} onPlan={openPlan} />) : <p className="text-sm text-slate-600">Ingen ordre til planlegging.</p>}</div></Panel><Panel title="Ukeplan"><CalendarControls weekStart={weekStart} setWeekStart={setWeekStart} showWholeWeek={showWholeWeek} setShowWholeWeek={setShowWholeWeek} /><div className="overflow-x-auto"><div className="min-w-[860px]"><div className="grid gap-2 text-xs font-semibold text-slate-600" style={{ gridTemplateColumns: `160px repeat(${week.length}, minmax(110px, 1fr))` }}><div>Ansatt</div>{week.map((day) => <div key={day}>{dateLabel(day)}{holidays[day] && <p className="font-normal text-red-700">{holidays[day]}</p>}</div>)}</div><div className="mt-2 grid gap-2">{employees.map((employee) => <div key={employee.id} className="grid gap-2" style={{ gridTemplateColumns: `160px repeat(${week.length}, minmax(110px, 1fr))` }}><div className="rounded-lg bg-slate-50 p-2 text-sm font-semibold">{employee.full_name}{employee.role === "admin" ? " (admin)" : ""}</div>{week.map((day) => { const dayOrders = activeOrders.filter((order) => participantIds(order).includes(employee.id) && orderDay(order) === day); return <div key={`${employee.id}-${day}`} className={`min-h-40 rounded-lg border border-slate-100 bg-white p-2 text-xs ${draggedOrderId ? "ring-2 ring-emerald-100" : ""}`}><div className="mb-2 grid grid-cols-2 gap-1">{slots.map((slot) => <div key={slot} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const id = event.dataTransfer.getData("text/order-id") || draggedOrderId; if (id) onDrop(id, day, slot, employee.id); }} className="rounded border border-dashed border-emerald-200 bg-emerald-50 px-2 py-1 text-center text-[11px] font-semibold text-emerald-800">{slot}</div>)}</div>{dayOrders.length ? <div className="grid gap-1">{dayOrders.map((order) => <OrderCard key={order.id} order={order} draggable compact onDragStart={setDraggedOrderId} onPlan={openPlan} />)}</div> : <span className="text-slate-400">Ledig</span>}</div>; })}</div>)}</div></div></div></Panel></section>{planForm && <PlanDialog form={planForm} setForm={setPlanForm} employees={employees} order={orders.find((x) => x.id === planForm.order_id)} onSave={savePlan} onClose={() => setPlanForm(null)} />}</main>;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) { return <section className="rounded-lg border border-emerald-100 bg-white p-4 shadow-sm"><h2 className="mb-3 font-semibold">{title}</h2>{children}</section>; }
function CalendarControls({ weekStart, setWeekStart, showWholeWeek, setShowWholeWeek }: { weekStart: Date; setWeekStart: (date: Date) => void; showWholeWeek: boolean; setShowWholeWeek: (show: boolean) => void }) { return <div className="mb-4 grid gap-3"><div className="flex flex-wrap items-center gap-2"><button onClick={() => setWeekStart(plusDays(weekStart, -7))} className="rounded-lg border px-3 py-2 text-sm font-semibold">Forrige uke</button><button onClick={() => setWeekStart(mondayFor(new Date()))} className="rounded-lg border px-3 py-2 text-sm font-semibold">Denne uken</button><button onClick={() => setWeekStart(plusDays(weekStart, 7))} className="rounded-lg border px-3 py-2 text-sm font-semibold">Neste uke</button><span className="text-sm font-semibold text-slate-700">Uke fra {dateLabel(localIso(weekStart))}</span></div><div className="flex flex-wrap gap-3 text-sm"><label className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2"><input type="radio" checked={!showWholeWeek} onChange={() => setShowWholeWeek(false)} />Vis arbeidsuke</label><label className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2"><input type="radio" checked={showWholeWeek} onChange={() => setShowWholeWeek(true)} />Vis hele uken</label></div></div>; }
function OrderCard({ order, draggable, compact, onDragStart, onPlan }: { order: Order; draggable?: boolean; compact?: boolean; onDragStart: (id: string | null) => void; onPlan: (order: Order) => void }) { return <article draggable={draggable} onDragStart={(event) => { event.dataTransfer.setData("text/order-id", order.id); onDragStart(order.id); }} onDragEnd={() => onDragStart(null)} className={`rounded-lg border p-3 ${statusClasses[order.status]} ${draggable ? "cursor-grab" : ""}`}><div className="flex justify-between gap-2"><div><p className="text-xs font-semibold uppercase">{order.order_number}</p><h3 className="font-semibold">{order.customer_name}</h3></div><span className="text-xs font-semibold">{statusLabels[order.status]}</span></div>{!compact && <><p className="mt-2 text-sm text-slate-700">{order.address}</p><p className="text-sm text-slate-600">{order.description}</p></>}<p className="mt-1 text-xs text-slate-600">{timeLabel(order.scheduled_start)}-{timeLabel(order.scheduled_end)}</p><button onClick={() => onPlan(order)} className="mt-3 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white">Planlegg</button></article>; }
function PlanDialog({ form, setForm, employees, order, onSave, onClose }: { form: PlanForm; setForm: (form: PlanForm) => void; employees: Profile[]; order?: Order; onSave: (event: FormEvent) => void; onClose: () => void }) { return <div className="fixed inset-0 z-40 grid place-items-center bg-slate-950/40 p-4"><form onSubmit={onSave} className="w-full max-w-lg rounded-lg bg-white p-4 shadow-xl"><div className="mb-3 flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase text-emerald-700">Planlegg ordre</p><h2 className="text-lg font-bold">{order ? `${order.order_number} - ${order.customer_name}` : "Ordre"}</h2></div><button type="button" onClick={onClose} className="rounded-lg border px-3 py-2 text-sm font-semibold">Lukk</button></div><div className="grid gap-3"><label className="grid gap-1 text-sm font-medium">Deltakere<select multiple className="min-h-32 rounded-lg border p-3" value={form.participant_ids} onChange={(event) => setForm({ ...form, participant_ids: Array.from(event.currentTarget.selectedOptions).map((x) => x.value) })}>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name}{employee.role === "admin" ? " (admin)" : ""}</option>)}</select><span className="text-xs text-slate-500">Hold Ctrl/Cmd for å velge flere.</span></label><label className="grid gap-1 text-sm font-medium">Dato<input required type="date" className="rounded-lg border p-3" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label><label className="grid gap-1 text-sm font-medium">Starttid<input required type="time" className="rounded-lg border p-3" value={form.start_time} onChange={(event) => setForm({ ...form, start_time: event.target.value })} /></label><label className="grid gap-1 text-sm font-medium">Varighet i timer<input required type="number" min="0.5" step="0.25" className="rounded-lg border p-3" value={form.estimated_hours} onChange={(event) => setForm({ ...form, estimated_hours: event.target.value })} /></label><button className="rounded-lg bg-emerald-700 p-3 font-semibold text-white">Lagre planlegging</button></div></form></div>; }
