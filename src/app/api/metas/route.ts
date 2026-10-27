import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const metaSchema = z.object({
  nomeVendedor: z.string().trim().min(2).max(120),
  ano: z.number().int().min(2020).max(2100),
  mes: z.number().int().min(1).max(12),
  metaValor: z.number().finite().nonnegative().nullable().optional(),
  metaQuantidade: z.number().int().nonnegative().nullable().optional(),
  alteradoPor: z.string().trim().min(2).max(120),
});

function adminAuthorized(request: NextRequest) {
  const secret = process.env.DASHBOARD_WRITE_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

export async function GET(request: NextRequest) {
  const ano = Number(request.nextUrl.searchParams.get("ano"));
  const mes = Number(request.nextUrl.searchParams.get("mes"));
  if (!Number.isInteger(ano) || !Number.isInteger(mes) || mes < 1 || mes > 12) {
    return NextResponse.json({ error: "Informe ano e mês válidos" }, { status: 400 });
  }
  const metas = await prisma.meta.findMany({
    where: { ano, mes },
    orderBy: { nomeVendedor: "asc" },
    include: { historico: { orderBy: { alteradoEm: "desc" }, take: 5 } },
  });
  return NextResponse.json({ metas });
}

export async function POST(request: NextRequest) {
  if (!adminAuthorized(request)) return NextResponse.json({ error: "Configure e informe o segredo de edição" }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Corpo JSON inválido" }, { status: 400 }); }
  const parsed = metaSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados de meta inválidos", issues: parsed.error.issues }, { status: 400 });
  const { nomeVendedor, ano, mes, alteradoPor, ...values } = parsed.data;
  const meta = await prisma.$transaction(async (tx) => {
    const saved = await tx.meta.upsert({
      where: { nomeVendedor_ano_mes: { nomeVendedor, ano, mes } },
      create: { nomeVendedor, ano, mes, ...values },
      update: values,
    });
    await tx.historicoMeta.create({
      data: { metaId: saved.id, nomeVendedor, ano, mes, metaValor: saved.metaValor, metaQuantidade: saved.metaQuantidade, alteradoPor },
    });
    return saved;
  });
  return NextResponse.json({ meta }, { status: 200 });
}
