import { NextRequest, NextResponse } from "next/server";
import { dateTimeSaoPaulo } from "@/lib/format";
import { buscarProducao, dadosNormalizados } from "@/lib/neo";
import { prisma } from "@/lib/prisma";

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const secret = process.env.SYNC_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const fim = new Date();
  const inicio = new Date(fim.getTime() - 90 * 60 * 1000);
  const fimString = dateTimeSaoPaulo(fim);
  try {
    const result = await prisma.$transaction(async (tx) => {
      const [lock] = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(2984102701) AS locked`;
      if (!lock?.locked) return null;

      const items = await buscarProducao(dateTimeSaoPaulo(inicio), fimString);
      for (const item of items) {
        const data = dadosNormalizados(item);
        await tx.venda.upsert({ where: { itemNeoId: item.itemId }, create: data, update: data });
      }
      const sync = await tx.sincronizacao.create({
        data: { inicioConsultaDateTime: inicio, fimConsulta: fim, status: "sucesso", recebidos: items.length, gravados: items.length, finalizadaEm: new Date() },
        select: { id: true, status: true, recebidos: true, gravados: true },
      });
      return sync;
    }, { maxWait: 10_000, timeout: 115_000 });

    if (!result) return NextResponse.json({ error: "Já existe uma sincronização em andamento" }, { status: 409 });
    return NextResponse.json({ sincronizacao: result });
  } catch (error) {
    console.error("Falha na sincronização NEO", error);
    await prisma.sincronizacao.create({
      data: {
        inicioConsultaDateTime: inicio,
        fimConsulta: fim,
        status: "erro",
        mensagemErro: error instanceof Error ? error.message.replace(/(?:postgres(?:ql)?:\/\/)[^\s]+/gi, "[conexão omitida]").slice(0, 500) : "Falha desconhecida na sincronização",
        finalizadaEm: new Date(),
      },
    }).catch(() => undefined);
    return NextResponse.json({ error: "Sincronização falhou; consulte o registro de sincronizações" }, { status: 502 });
  }
}
