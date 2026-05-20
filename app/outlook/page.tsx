"use client";

import { createClient, type User } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

type Role = "admin" | "employee";
type Profile = { id: string; full_name: string; email: string; role: Role; calendar_token: string | null };

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

export default function OutlookPage() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => { if (user) void loadData(user.id); }, [user]);

  async function loadData(userId: string) {
    const { data: p, error } = await supabase.from("profiles").select("id,full_name,email,role,calendar_token").eq("id", userId).single();
    if (error || !p) { setMessage("Fant ikke profil."); return; }
    setProfile(p as Profile);
    if (p.role === "admin") {
      const { data: e } = await supabase.from("profiles").select("id,full_name,email,role,calendar_token").order("full_name");
      setEmployees((e ?? []) as Profile[]);
    }
  }

  function feedUrl(token = profile?.calendar_token) {
    if (!token || typeof window === "undefined") return "";
    return `${window.location.origin}/api/calendar/${token}.ics`;
  }

  async function copyUrl() {
    const url = feedUrl();
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
  }

  async function regenerate(userId: string) {
    if (!profile || profile.role !== "admin") return;
    const { error } = await supabase.rpc("regenerate_calendar_token", { target_user_id: userId });
    if (error) { setMessage(error.message); return; }
    await loadData(profile.id);
  }

  if (!user) return <main className="mx-auto max-w-5xl p-4"><Panel title="Koble til Outlook"><p>Logg inn i Låsia-appen først, og åpne denne siden på nytt.</p></Panel></main>;

  return <main className="mx-auto max-w-5xl p-4 pb-20"><header className="mb-5"><p className="font-semibold text-emerald-700">Låsia AS</p><h1 className="text-2xl font-bold">Koble til Outlook</h1><p className="text-sm text-slate-600">Dette er en skrivebeskyttet kalenderkopi. Låsia er hovedsystemet.</p></header>{message && <p className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700">{message}</p>}<section className="grid gap-4 lg:grid-cols-[1fr_1fr]"><Panel title="Din kalenderfeed"><p className="mb-3 text-sm text-slate-600">Abonner på denne URL-en i Outlook, iPhone Kalender eller Google Kalender. Feeden viser planlagte ordre, ordre som pågår og ordre som er ferdige men ikke fakturert.</p><label className="grid gap-1 text-sm font-medium">ICS URL<input readOnly className="rounded-lg border bg-slate-50 p-3 text-sm" value={feedUrl()} /></label><div className="mt-3 flex flex-wrap gap-2"><button onClick={copyUrl} className="rounded-lg bg-emerald-700 px-4 py-3 text-sm font-semibold text-white">{copied ? "Kopiert" : "Kopier URL"}</button>{profile?.role === "admin" && <button onClick={() => regenerate(profile.id)} className="rounded-lg border px-4 py-3 text-sm font-semibold">Regenerer min token</button>}</div></Panel><Panel title="Brukerveiledning"><div className="grid gap-3 text-sm text-slate-700"><Guide title="Outlook desktop" steps={["Åpne Kalender.", "Velg Legg til kalender / Fra Internett.", "Lim inn ICS-URL-en fra Låsia.", "Lagre som abonnementskalender."]} /><Guide title="Outlook på mobil" steps={["Åpne Outlook Kalender.", "Velg legg til kalender.", "Velg abonner fra web hvis tilgjengelig.", "Lim inn ICS-URL-en."]} /><Guide title="iPhone Kalender" steps={["Åpne Innstillinger.", "Gå til Kalender > Kontoer > Legg til konto > Annet.", "Velg Legg til abonnementskalender.", "Lim inn ICS-URL-en."]} /><Guide title="Android / Google Kalender" steps={["Åpne Google Kalender i nettleser.", "Velg Andre kalendere > Fra nettadresse.", "Lim inn ICS-URL-en.", "Kalenderen blir tilgjengelig på Android etter synk."]} /></div></Panel>{profile?.role === "admin" && <Panel title="Admin: regenerer kalender-token"><div className="grid gap-2">{employees.map((employee) => <div key={employee.id} className="flex flex-col gap-2 rounded-lg border p-3 text-sm sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">{employee.full_name}{employee.role === "admin" ? " (admin)" : ""}</p><p className="text-slate-600">{employee.email}</p></div><button onClick={() => regenerate(employee.id)} className="rounded-lg border px-3 py-2 font-semibold">Regenerer token</button></div>)}</div></Panel>}</section></main>;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) { return <section className="rounded-lg border border-emerald-100 bg-white p-4 shadow-sm"><h2 className="mb-3 font-semibold">{title}</h2>{children}</section>; }
function Guide({ title, steps }: { title: string; steps: string[] }) { return <div><h3 className="font-semibold">{title}</h3><ol className="mt-1 list-decimal pl-5">{steps.map((step) => <li key={step}>{step}</li>)}</ol></div>; }
