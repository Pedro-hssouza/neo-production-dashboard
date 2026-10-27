import "dotenv/config";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { parse, isValid } from "date-fns";

const execFileAsync = promisify(execFile);
const MAX_WINDOW_MS = 90 * 60 * 1000;
const BATCH_SIZE = 400;

const optionalBigInt = z.union([z.string(), z.number().int(), z.bigint()]).nullish()
  .transform((value) => value == null || value === "" ? null : BigInt(value));
const neoItemSchema = z.object({
  itemId: z.union([z.string(), z.number().int(), z.bigint()]).transform(BigInt),
  numeroPedido: z.string().nullish(),
  estruturaUsuarioId: optionalBigInt,
  nomeUsuario: z.string().nullish(),
  equipeId: optionalBigInt,
  nomeEquipe: z.string().nullish(),
  produtoId: optionalBigInt,
  nomeProduto: z.string().nullish(),
  produtoCategoriaNome: z.string().nullish(),
  quantidade: z.coerce.number().int().nonnegative().nullish().transform((value) => value ?? 0),
  valor: z.union([z.string(), z.number()]).nullish(),
  nomeEtapa: z.string().nullish(),
  nomeEtapaItem: z.string().nullish(),
  tipoNegociacao: z.string().nullish(),
  nomeCliente: z.string().nullish(),
  estado: z.string().nullish(),
  dataReferencia: z.string().nullish(),
  dataHoraAtualizacao: z.string().nullish(),
}).passthrough();

function saoPauloParts(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function asNeoDate(date) {
  const p = saoPauloParts(date);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

function previousMonthStart(now) {
  const p = saoPauloParts(now);
  return new Date(Date.UTC(Number(p.year), Number(p.month) - 2, 1, 3));
}

function parseMoney(value) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Valor monetário inválido");
    return value;
  }
  if (value == null || value.trim() === "") return 0;
  const input = value.trim().replace(/\s/g, "");
  const normalized = input.includes(",") ? input.replace(/\./g, "").replace(",", ".") : input;
  const result = Number(normalized);
  if (!Number.isFinite(result)) throw new Error("Valor monetário inválido recebido da NEO");
  return result;
}

function parseNeoDate(value) {
  if (!value) return null;
  const input = value.trim();
  const result = /^\d{4}-\d{2}-\d{2}/.test(input)
    ? new Date(input)
    : parse(input, input.includes(":") ? "dd/MM/yyyy HH:mm:ss" : "dd/MM/yyyy", new Date());
  if (!isValid(result)) throw new Error("Data inválida recebida da NEO");
  return result;
}

function normalize(item) {
  const raw = JSON.parse(JSON.stringify(item, (_, value) => typeof value === "bigint" ? value.toString() : value));
  return {
    itemNeoId: item.itemId,
    numeroPedido: item.numeroPedido ?? null,
    estruturaUsuarioId: item.estruturaUsuarioId,
    nomeUsuarioOriginal: item.nomeUsuario ?? null,
    equipeId: item.equipeId,
    nomeEquipe: item.nomeEquipe ?? null,
    produtoId: item.produtoId,
    nomeProduto: item.nomeProduto ?? null,
    categoriaProduto: item.produtoCategoriaNome ?? null,
    quantidade: item.quantidade,
    valorUnitario: parseMoney(item.valor),
    nomeEtapa: item.nomeEtapa ?? null,
    nomeEtapaItem: item.nomeEtapaItem ?? null,
    tipoNegociacao: item.tipoNegociacao ?? null,
    nomeCliente: item.nomeCliente ?? null,
    estado: item.estado ?? null,
    dataReferencia: parseNeoDate(item.dataReferencia),
    dataHoraAtualizacao: parseNeoDate(item.dataHoraAtualizacao),
    dadosOriginais: raw,
    atualizadoEm: new Date(),
  };
}

function makeChunks(start, end) {
  const chunks = [];
  for (let cursor = start; cursor < end;) {
    const next = new Date(Math.min(cursor.getTime() + MAX_WINDOW_MS, end.getTime()));
    if (next.getTime() - cursor.getTime() > MAX_WINDOW_MS) throw new Error("A janela ultrapassou 90 minutos");
    chunks.push({ inicio: new Date(cursor), fim: next });
    cursor = next;
  }
  return chunks;
}

async function fetchChunk(chunk, index, total) {
  const body = JSON.stringify({
    tokenEstrutura: process.env.NEO_TOKEN_ESTRUTURA,
    tokenUsuario: process.env.NEO_TOKEN_USUARIO,
    dataHoraInicioCarga: asNeoDate(chunk.inicio),
    dataHoraFimCarga: asNeoDate(chunk.fim),
    painelId: process.env.NEO_PAINEL_ID,
    outputFormat: "json",
  });

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(process.env.NEO_API_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body,
        cache: "no-store",
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) {
        if ((response.status === 429 || response.status >= 500) && attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
          continue;
        }
        throw new Error(`API NEO respondeu HTTP ${response.status} no bloco ${index + 1}`);
      }
      const contentType = response.headers.get("content-type") ?? "";
      const charset = contentType.match(/charset\s*=\s*["']?([^;\s"']+)/i)?.[1] ?? "utf-8";
      const text = new TextDecoder(charset).decode(await response.arrayBuffer());
      let payload;
      try { payload = JSON.parse(text); }
      catch { throw new Error(`A resposta NEO do bloco ${index + 1} não era JSON válido`); }
      if (!Array.isArray(payload)) throw new Error(`A API NEO não retornou uma lista no bloco ${index + 1}`);
      const items = z.array(neoItemSchema).parse(payload);
      console.log(`Bloco ${index + 1}/${total}: ${asNeoDate(chunk.inicio)} → ${asNeoDate(chunk.fim)} (${items.length} itens)`);
      return items;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("API NEO respondeu HTTP")) throw error;
      if (error instanceof Error && error.message.startsWith("A resposta NEO")) throw error;
      if (error instanceof Error && error.message.startsWith("A API NEO")) throw error;
      if (attempt === 3) throw new Error(`Falha de rede ou validação no bloco ${index + 1}; o banco ainda não foi alterado`);
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
    }
  }
  throw new Error(`Bloco ${index + 1} falhou; o banco ainda não foi alterado`);
}

async function findPgDump() {
  if (process.env.PG_DUMP_PATH) return process.env.PG_DUMP_PATH;
  const candidates = process.platform === "win32"
    ? ["C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe", "C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe", "pg_dump.exe"]
    : ["pg_dump"];
  for (const candidate of candidates) {
    try {
      if (candidate.includes("\\")) { await stat(candidate); return candidate; }
      await execFileAsync(candidate, ["--version"]);
      return candidate;
    } catch { /* tenta o próximo local */ }
  }
  throw new Error("pg_dump não encontrado; instale as ferramentas do PostgreSQL ou defina PG_DUMP_PATH");
}

async function backupDatabase(databaseUrl) {
  const parsed = new URL(databaseUrl);
  const folder = join(tmpdir(), "neo-dashboard-backups");
  await mkdir(folder, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const destination = join(folder, `neo_dashboard-before-reload-${stamp}.dump`);
  const pgDump = await findPgDump();
  const args = [
    `--host=${parsed.hostname}`,
    `--port=${parsed.port || "5432"}`,
    `--username=${decodeURIComponent(parsed.username)}`,
    `--dbname=${decodeURIComponent(parsed.pathname.slice(1))}`,
    "--format=custom", "--no-owner", "--no-privileges", `--file=${destination}`,
  ];
  const env = { ...process.env, PGPASSWORD: decodeURIComponent(parsed.password) };
  const sslMode = parsed.searchParams.get("sslmode");
  if (sslMode) env.PGSSLMODE = sslMode;
  try { await execFileAsync(pgDump, args, { env, windowsHide: true }); }
  catch { throw new Error("Não foi possível criar o backup PostgreSQL; nenhum dado foi alterado"); }
  const size = (await stat(destination)).size;
  if (size < 100) throw new Error("O backup PostgreSQL parece incompleto; nenhum dado foi alterado");
  console.log(`Backup criado em: ${destination} (${size} bytes)`);
  return destination;
}

async function main() {
  if (!process.argv.includes("--confirm-reset")) {
    throw new Error("Ação não executada. Para confirmar o reset completo, use --confirm-reset.");
  }
  const required = ["DATABASE_URL", "NEO_API_URL", "NEO_TOKEN_ESTRUTURA", "NEO_TOKEN_USUARIO", "NEO_PAINEL_ID"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) throw new Error(`Variáveis ausentes no .env: ${missing.join(", ")}`);

  const databaseUrl = new URL(process.env.DATABASE_URL);
  const database = decodeURIComponent(databaseUrl.pathname.slice(1));
  if (database !== "neo_dashboard") throw new Error(`Reset recusado: o banco configurado se chama "${database}", esperado "neo_dashboard"`);
  console.log(`Banco alvo: ${databaseUrl.hostname}/${database}`);

  const now = new Date();
  const start = previousMonthStart(now);
  const chunks = makeChunks(start, now);
  console.log(`Período NEO: ${asNeoDate(start)} até ${asNeoDate(now)}; ${chunks.length} consultas de no máximo 90 minutos.`);
  console.log("Buscando e validando todos os blocos antes de substituir qualquer tabela...");

  const itemsById = new Map();
  const syncRows = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const items = await fetchChunk(chunks[index], index, chunks.length);
    syncRows.push({
      inicioConsultaDateTime: chunks[index].inicio,
      fimConsulta: chunks[index].fim,
      status: "sucesso_historico",
      recebidos: items.length,
      gravados: items.length,
      iniciadaEm: now,
      finalizadaEm: new Date(),
    });
    for (const item of items) itemsById.set(item.itemId.toString(), normalize(item));
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  const normalizedItems = [...itemsById.values()];
  console.log(`API validada: ${normalizedItems.length} itens únicos prontos para gravar.`);
  console.log("Criando backup do banco antes do reset...");
  await backupDatabase(process.env.DATABASE_URL);

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 4, connectionTimeoutMillis: 10_000 });
  const prisma = new PrismaClient({ adapter });
  try {
    const clearedAndLoaded = await prisma.$transaction(async (tx) => {
      await tx.historicoMeta.deleteMany();
      await tx.meta.deleteMany();
      await tx.correcaoVendedor.deleteMany();
      await tx.sincronizacao.deleteMany();
      await tx.venda.deleteMany();

      let inserted = 0;
      for (let startIndex = 0; startIndex < normalizedItems.length; startIndex += BATCH_SIZE) {
        const batch = normalizedItems.slice(startIndex, startIndex + BATCH_SIZE);
        const result = await tx.venda.createMany({ data: batch });
        inserted += result.count;
      }
      for (let startIndex = 0; startIndex < syncRows.length; startIndex += BATCH_SIZE) {
        await tx.sincronizacao.createMany({ data: syncRows.slice(startIndex, startIndex + BATCH_SIZE) });
      }
      return inserted;
    }, { maxWait: 15_000, timeout: 180_000 });
    console.log(`Reset concluído. ${clearedAndLoaded} vendas gravadas; ${syncRows.length} blocos registrados.`);
    console.log("As tabelas de metas e correções também foram zeradas (estavam vazias antes da operação).");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Recarga interrompida; banco não alterado antes da transação final.");
  process.exitCode = 1;
});
