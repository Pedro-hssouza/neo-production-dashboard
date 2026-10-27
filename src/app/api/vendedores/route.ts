import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { nextSaoPauloDay, saoPauloDate, startOfSaoPauloDay } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const today = saoPauloDate(new Date());
  const querySchema = z.object({
    inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default(`${today.slice(0, 7)}-01`),
    fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default(today),
    vendedor: z.string().max(120).optional(),
  });
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success || parsed.data.inicio > parsed.data.fim) return NextResponse.json({ error: "Período inválido" }, { status: 400 });
  const { inicio, fim, vendedor } = parsed.data;
  const rows = await prisma.venda.findMany({
    where: {
      dataReferencia: { gte: startOfSaoPauloDay(inicio), lt: nextSaoPauloDay(fim) },
      ...(vendedor ? { OR: [{ vendedorCorrigido: { contains: vendedor, mode: "insensitive" } }, { vendedorCorrigido: null, nomeUsuarioOriginal: { contains: vendedor, mode: "insensitive" } }] } : {}),
    },
    orderBy: { dataReferencia: "desc" },
    take: 100,
    select: { itemNeoId: true, numeroPedido: true, nomeUsuarioOriginal: true, vendedorCorrigido: true, nomeProduto: true, nomeEquipe: true, nomeEtapa: true, quantidade: true, valorUnitario: true, dataReferencia: true },
  });
  return NextResponse.json({ vendas: rows.map((row) => ({ ...row, itemNeoId: row.itemNeoId.toString(), valorUnitario: Number(row.valorUnitario), vendedorExibido: row.vendedorCorrigido || row.nomeUsuarioOriginal || "Sem vendedor" })) });
}
