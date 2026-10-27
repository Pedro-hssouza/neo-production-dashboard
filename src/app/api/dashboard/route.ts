import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { businessDaysBetween, nextSaoPauloDay, saoPauloDate, startOfSaoPauloDay } from "@/lib/format";
import { etapaContaNoFaturamento, faturamentoDoItem } from "@/lib/faturamento";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const filtersSchema = z.object({
  inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  equipe: z.string().max(120).optional(),
  vendedor: z.string().max(120).optional(),
  produto: z.string().max(160).optional(),
  tipo: z.string().max(120).optional(),
  estado: z.string().max(80).optional(),
  etapa: z.string().max(120).optional(),
});

function defaultPeriod() {
  const today = saoPauloDate(new Date());
  return { inicio: `${today.slice(0, 7)}-01`, fim: today };
}

export async function GET(request: NextRequest) {
  const parsed = filtersSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Filtros inválidos" }, { status: 400 });

  const defaults = defaultPeriod();
  const { inicio = defaults.inicio, fim = defaults.fim, equipe, vendedor, produto, tipo, estado, etapa } = parsed.data;
  if (inicio > fim) return NextResponse.json({ error: "A data inicial deve vir antes da data final" }, { status: 400 });
  const start = startOfSaoPauloDay(inicio);
  const endExclusive = nextSaoPauloDay(fim);
  const baseWhere = { dataReferencia: { gte: start, lt: endExclusive } };
  const where = {
    ...baseWhere,
    ...(equipe ? { nomeEquipe: equipe } : {}),
    ...(produto ? { nomeProduto: produto } : {}),
    ...(tipo ? { tipoNegociacao: tipo } : {}),
    ...(estado ? { estado } : {}),
    ...(etapa ? { nomeEtapa: etapa } : {}),
    ...(vendedor ? { OR: [{ vendedorCorrigido: vendedor }, { vendedorCorrigido: null, nomeUsuarioOriginal: vendedor }] } : {}),
  };

  try {
    const [sales, periodSales, latestSync] = await Promise.all([
      prisma.venda.findMany({ where, orderBy: { dataReferencia: "asc" }, take: 50_000 }),
      prisma.venda.findMany({ where: baseWhere, select: { nomeEquipe: true, vendedorCorrigido: true, nomeUsuarioOriginal: true, nomeProduto: true, tipoNegociacao: true, estado: true, nomeEtapa: true } }),
      prisma.sincronizacao.findFirst({ orderBy: { iniciadaEm: "desc" }, select: { iniciadaEm: true, finalizadaEm: true, status: true, recebidos: true, gravados: true, mensagemErro: true } }),
    ]);

    const sellerName = (sale: (typeof sales)[number]) => sale.vendedorCorrigido || sale.nomeUsuarioOriginal || "Sem vendedor";
    // O valor do NEO já é o total do item; só entra no faturamento nas etapas concluídas.
    const revenue = (sale: (typeof sales)[number]) => faturamentoDoItem(Number(sale.valorUnitario), sale.nomeEtapa);
    const faturamento = sales.reduce((sum, sale) => sum + revenue(sale), 0);
    const quantidade = sales.reduce((sum, sale) => sum + sale.quantidade, 0);
    const uniqueOrders = new Set(sales.filter((sale) => etapaContaNoFaturamento(sale.nomeEtapa)).map((sale) => sale.numeroPedido || sale.itemNeoId.toString()));
    const sellerNames = [...new Set(sales.map(sellerName))];
    const firstMonth = inicio.slice(0, 7);
    const lastMonth = fim.slice(0, 7);
    const monthKeys: { ano: number; mes: number }[] = [];
    for (let cursor = firstMonth; cursor <= lastMonth;) {
      const [year, month] = cursor.split("-").map(Number);
      monthKeys.push({ ano: year, mes: month });
      const next = new Date(Date.UTC(year, month, 1));
      cursor = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
    }
    const metas = await prisma.meta.findMany({
      where: { OR: monthKeys, ...(vendedor ? { nomeVendedor: vendedor } : { nomeVendedor: { in: sellerNames } }) },
    });
    const meta = metas.reduce((sum, row) => sum + Number(row.metaValor ?? 0), 0);
    const metaQuantidade = metas.reduce((sum, row) => sum + (row.metaQuantidade ?? 0), 0);

    const daily = new Map<string, { faturamento: number; quantidade: number }>();
    const sellers = new Map<string, { faturamento: number; quantidade: number }>();
    const products = new Map<string, { faturamento: number; quantidade: number }>();
    const teams = new Map<string, { faturamento: number; quantidade: number }>();
    const stages = new Map<string, { faturamento: number; quantidade: number }>();
    for (const sale of sales) {
      const value = revenue(sale);
      const day = sale.dataReferencia ? saoPauloDate(sale.dataReferencia) : "Sem data";
      const item = daily.get(day) ?? { faturamento: 0, quantidade: 0 };
      item.faturamento += value;
      item.quantidade += sale.quantidade;
      daily.set(day, item);
      for (const [map, key] of [
        [sellers, sellerName(sale)],
        [products, sale.nomeProduto || sale.categoriaProduto || "Sem produto"],
        [teams, sale.nomeEquipe || "Sem equipe"],
        [stages, sale.nomeEtapa || "Sem etapa"],
      ] as const) {
        const aggregate = map.get(key) ?? { faturamento: 0, quantidade: 0 };
        aggregate.faturamento += value;
        aggregate.quantidade += sale.quantidade;
        map.set(key, aggregate);
      }
    }

    const options = (selector: (sale: (typeof periodSales)[number]) => string | null) =>
      [...new Set(periodSales.map(selector).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    const today = saoPauloDate(new Date());
    const elapsedThrough = today < fim ? today : fim;
    const elapsedDays = elapsedThrough < inicio ? 0 : businessDaysBetween(startOfSaoPauloDay(inicio), startOfSaoPauloDay(elapsedThrough));
    const remainingFrom = today > inicio ? today : inicio;
    const remainingDays = today > fim ? 0 : businessDaysBetween(startOfSaoPauloDay(remainingFrom), startOfSaoPauloDay(fim));

    return NextResponse.json({
      resumo: {
        faturamento,
        quantidade,
        ticketMedio: uniqueOrders.size ? faturamento / uniqueOrders.size : 0,
        meta,
        metaQuantidade,
        percentualMeta: meta > 0 ? faturamento / meta * 100 : null,
        faltaParaMeta: Math.max(meta - faturamento, 0),
        ritmoDiarioNecessario: remainingDays ? Math.max(meta - faturamento, 0) / remainingDays : 0,
        projecao: elapsedDays ? faturamento / elapsedDays * businessDaysBetween(startOfSaoPauloDay(inicio), startOfSaoPauloDay(fim)) : 0,
        diasUteisRestantes: remainingDays,
      },
      vendasPorDia: [...daily.entries()].map(([data, values]) => ({ data, ...values })).sort((a, b) => a.data.localeCompare(b.data)),
      rankingVendedores: [...sellers.entries()].map(([nome, values]) => ({ nome, ...values })).sort((a, b) => b.faturamento - a.faturamento).slice(0, 10),
      produtos: [...products.entries()].map(([nome, values]) => ({ nome, ...values })).sort((a, b) => b.faturamento - a.faturamento).slice(0, 8),
      equipes: [...teams.entries()].map(([nome, values]) => ({ nome, ...values })).sort((a, b) => b.faturamento - a.faturamento),
      etapas: [...stages.entries()].map(([nome, values]) => ({ nome, ...values })).sort((a, b) => b.faturamento - a.faturamento),
      filtrosDisponiveis: {
        equipes: options((sale) => sale.nomeEquipe),
        vendedores: options((sale) => sale.vendedorCorrigido || sale.nomeUsuarioOriginal),
        produtos: options((sale) => sale.nomeProduto),
        tipos: options((sale) => sale.tipoNegociacao),
        estados: options((sale) => sale.estado),
        etapas: options((sale) => sale.nomeEtapa),
      },
      ultimaSincronizacao: latestSync,
      regras: { faturamento: "soma dos valores recebidos do NEO nas etapas concluídas", etapasIncluidas: "CONCLUÍDO (NEOCRM) e Logistica concluída (NEOCRM)", ticketMedio: "faturamento ÷ pedidos distintos nas etapas incluídas" },
    });
  } catch (error) {
    console.error("Falha ao consultar o dashboard", error);
    return NextResponse.json({ error: "Não foi possível consultar o dashboard. Verifique a conexão com o banco." }, { status: 503 });
  }
}
