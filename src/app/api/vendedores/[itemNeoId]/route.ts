import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const correctionSchema = z.object({
  vendedorCorreto: z.string().trim().min(2).max(120),
  motivo: z.string().trim().min(5).max(500),
  alteradoPor: z.string().trim().min(2).max(120),
});

export async function PUT(request: NextRequest, context: { params: Promise<{ itemNeoId: string }> }) {
  const secret = process.env.DASHBOARD_WRITE_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Configure e informe o segredo de edição" }, { status: 401 });
  }
  const { itemNeoId: rawId } = await context.params;
  if (!/^\d+$/.test(rawId)) return NextResponse.json({ error: "Identificador inválido" }, { status: 400 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Corpo JSON inválido" }, { status: 400 }); }
  const parsed = correctionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados da correção inválidos", issues: parsed.error.issues }, { status: 400 });

  const venda = await prisma.venda.findUnique({ where: { itemNeoId: BigInt(rawId) }, select: { nomeUsuarioOriginal: true } });
  if (!venda) return NextResponse.json({ error: "Venda não encontrada" }, { status: 404 });
  const correction = await prisma.$transaction(async (tx) => {
    const created = await tx.correcaoVendedor.create({
      data: { itemNeoId: BigInt(rawId), vendedorOriginal: venda.nomeUsuarioOriginal, ...parsed.data },
    });
    await tx.venda.update({ where: { itemNeoId: BigInt(rawId) }, data: { vendedorCorrigido: parsed.data.vendedorCorreto } });
    return created;
  });
  return NextResponse.json({ correcao: correction });
}
