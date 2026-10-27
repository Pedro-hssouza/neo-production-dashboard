import { parse, isValid } from "date-fns";

export function parseDinheiro(value: string | number | null | undefined) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Valor monetário inválido");
    return value;
  }
  if (value == null || value.trim() === "") return 0;

  const normalized = value.trim().replace(/\s/g, "");
  const parsed = normalized.includes(",")
    ? normalized.replace(/\./g, "").replace(",", ".")
    : normalized;
  const amount = Number(parsed);
  if (!Number.isFinite(amount)) throw new Error(`Valor monetário inválido: ${value}`);
  return amount;
}

export function parseDataBR(value?: string | null) {
  if (!value) return null;
  const input = value.trim();
  const parsed = /^\d{4}-\d{2}-\d{2}/.test(input)
    ? new Date(input)
    : parse(input, input.includes(":") ? "dd/MM/yyyy HH:mm:ss" : "dd/MM/yyyy", new Date());
  if (!isValid(parsed)) throw new Error(`Data inválida: ${value}`);
  return parsed;
}

export function startOfSaoPauloDay(day: string) {
  return new Date(`${day}T03:00:00.000Z`);
}

export function nextSaoPauloDay(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date + 1, 3));
}

export function saoPauloDate(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((value) => value.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function dateTimeSaoPaulo(date: Date) {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return parts.replace(" ", "T").replace("T", " ");
}

export function businessDaysBetween(from: Date, through: Date) {
  let count = 0;
  const cursor = new Date(from);
  cursor.setUTCHours(12, 0, 0, 0);
  const end = new Date(through);
  end.setUTCHours(12, 0, 0, 0);
  while (cursor <= end) {
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

export const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 2,
});

export const number = new Intl.NumberFormat("pt-BR");
