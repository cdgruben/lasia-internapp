import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

type FeedOrder = {
  id: string;
  order_number: string;
  customer_name: string;
  address: string;
  description: string;
  status: "scheduled" | "in_progress" | "completed_pending_invoice";
  scheduled_start: string;
  scheduled_end: string;
  updated_at: string;
};

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

const statusLabels: Record<FeedOrder["status"], string> = {
  scheduled: "Planlagt",
  in_progress: "Pågår",
  completed_pending_invoice: "Ferdig - til fakturering",
};

function escapeIcs(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function formatIcsDate(value: string) {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function foldLine(line: string) {
  if (line.length <= 74) return line;
  const chunks: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    chunks.push(rest.slice(0, 74));
    rest = ` ${rest.slice(74)}`;
  }
  chunks.push(rest);
  return chunks.join("\r\n");
}

function icsLine(name: string, value: string) {
  return foldLine(`${name}:${value}`);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  if (!token || token.length < 24) {
    return new Response("Ugyldig kalender-token", { status: 404 });
  }

  const { data, error } = await supabase.rpc("get_calendar_feed_orders", { feed_token: token });

  if (error) {
    return new Response("Kunne ikke hente kalenderfeed", { status: 500 });
  }

  const origin = new URL(request.url).origin;
  const now = formatIcsDate(new Date().toISOString());
  const events = ((data ?? []) as FeedOrder[]).flatMap((order) => {
    const detailUrl = `${origin}/?order=${order.id}`;
    const description = [
      order.description,
      `Adresse: ${order.address}`,
      `Status: ${statusLabels[order.status]}`,
      `Ordredetaljer: ${detailUrl}`,
    ].join("\n");

    return [
      "BEGIN:VEVENT",
      icsLine("UID", `${order.id}@lasia-internapp`),
      icsLine("DTSTAMP", now),
      icsLine("DTSTART", formatIcsDate(order.scheduled_start)),
      icsLine("DTEND", formatIcsDate(order.scheduled_end)),
      icsLine("LAST-MODIFIED", formatIcsDate(order.updated_at ?? order.scheduled_start)),
      icsLine("SUMMARY", escapeIcs(`${order.order_number} - ${order.customer_name}`)),
      icsLine("LOCATION", escapeIcs(order.address)),
      icsLine("DESCRIPTION", escapeIcs(description)),
      icsLine("URL", escapeIcs(detailUrl)),
      "END:VEVENT",
    ];
  });

  const calendar = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Lasia AS//Internapp//NO",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Lasia AS ordre",
    "X-WR-TIMEZONE:Europe/Oslo",
    ...events,
    "END:VCALENDAR",
    "",
  ].join("\r\n");

  return new Response(calendar, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": "inline; filename=lasia-kalender.ics",
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
