import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { nextSaoPauloDay, saoPauloDate, startOfSaoPauloDay } from "@/lib/format";
import { faturamentoDoItem } from "@/lib/faturamento";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  dimensao: z.enum(["vendedor", "etapa", "equipe", "produto"]),
  valor: z.string().trim().min(1).max(160),
  inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  equipe: z.string().max(120).optional(),
  vendedor: z.string().max(120).optional(),
  produto: z.string().max(160).optional(),
  tipo: z.string().max(120).optional(),
  estado: z.string().max(80).optional(),
  etapa: z.string().max(120).optional(),
  pagina: z.coerce.number().int().min(1).max(10_000).default(1),
});

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Parâmetros de detalhe inválidos" }, { status: 400 });

  const today = saoPauloDate(new Date());
  const { dimensao, valor, inicio = `${today.slice(0, 7)}-01`, fim = today, equipe, vendedor, produto, tipo, estado, etapa, pagina } = parsed.data;
  if (inicio > fim) return NextResponse.json({ error: "A data inicial deve vir antes da data final" }, { status: 400 });

  const conditions: object[] = [
    { dataReferencia: { gte: startOfSaoPauloDay(inicio), lt: nextSaoPauloDay(fim) } },
    ...(equipe ? [{ nomeEquipe: equipe }] : []),
    ...(produto ? [{ nomeProduto: produto }] : []),
    ...(tipo ? [{ tipoNegociacao: tipo }] : []),
    ...(estado ? [{ estado }] : []),
    ...(etapa ? [{ nomeEtapa: etapa }] : []),
    ...(vendedor ? [{ OR: [{ vendedorCorrigido: vendedor }, { vendedorCorrigido: null, nomeUsuarioOriginal: vendedor }] }] : []),
  ];

  if (dimensao === "vendedor") {
    conditions.push(valor === "Sem vendedor"
      ? { vendedorCorrigido: null, nomeUsuarioOriginal: null }
      : { OR: [{ vendedorCorrigido: valor }, { vendedorCorrigido: null, nomeUsuarioOriginal: valor }] });
  } else if (dimensao === "etapa") {
    conditions.push(valor === "Sem etapa" ? { OR: [{ nomeEtapa: null }, { nomeEtapa: "" }] } : { nomeEtapa: valor });
  } else if (dimensao === "equipe") {
    conditions.push(valor === "Sem equipe" ? { OR: [{ nomeEquipe: null }, { nomeEquipe: "" }] } : { nomeEquipe: valor });
  } else if (dimensao === "produto") {
    if (valor === "Sem produto") {
      conditions.push({ OR: [{ nomeProduto: null, categoriaProduto: null }, { nomeProduto: "", categoriaProduto: null }] });
    } else {
      conditions.push({ OR: [
        { nomeProduto: valor },
        { nomeProduto: null, categoriaProduto: valor },
        { nomeProduto: "", categoriaProduto: valor },
      ] });
    }
  }

  const where = { AND: conditions };
  const pageSize = 50;
  try {
    const [total, rows, sellerGroups, productStageGroups] = await Promise.all([
      prisma.venda.count({ where }),
      prisma.venda.findMany({
        where,
        orderBy: [{ dataReferencia: "desc" }, { itemNeoId: "desc" }],
        skip: (pagina - 1) * pageSize,
        take: pageSize,
        select: {
          itemNeoId: true,
          numeroPedido: true,
          nomeUsuarioOriginal: true,
          vendedorCorrigido: true,
          nomeEquipe: true,
          nomeProduto: true,
          categoriaProduto: true,
          nomeEtapa: true,
          tipoNegociacao: true,
          estado: true,
          quantidade: true,
          valorUnitario: true,
          dataReferencia: true,
        },
      }),
      prisma.venda.groupBy({
        by: ["vendedorCorrigido", "nomeUsuarioOriginal", "nomeEtapa"],
        where,
        _sum: { quantidade: true, valorUnitario: true },
      }),
      dimensao === "vendedor"
        ? prisma.venda.groupBy({
          by: ["nomeProduto", "categoriaProduto", "nomeEtapa"],
          where,
          _sum: { quantidade: true, valorUnitario: true },
        })
        : Promise.resolve([]),
    ]);

    const salesBySeller = new Map<string, { quantidade: number; faturamento: number }>();
    for (const group of sellerGroups) {
      const nome = group.vendedorCorrigido || group.nomeUsuarioOriginal || "Sem vendedor";
      const quantidade = group._sum.quantidade ?? 0;
      const current = salesBySeller.get(nome) ?? { quantidade: 0, faturamento: 0 };
      current.quantidade += quantidade;
      current.faturamento += faturamentoDoItem(Number(group._sum.valorUnitario ?? 0), group.nomeEtapa);
      salesBySeller.set(nome, current);
    }
    const vendedores = [...salesBySeller.entries()]
      .map(([nome, totals]) => ({ nome, ...totals }))
      .sort((a, b) => b.quantidade - a.quantidade);

    const salesByProductAndStage = new Map<string, { produto: string; etapa: string; quantidade: number; faturamento: number }>();
    for (const group of productStageGroups) {
      const produto = group.nomeProduto || group.categoriaProduto || "Sem produto";
      const etapa = group.nomeEtapa || "Sem etapa";
      const key = JSON.stringify([produto, etapa]);
      const quantidade = group._sum.quantidade ?? 0;
      const current = salesByProductAndStage.get(key) ?? { produto, etapa, quantidade: 0, faturamento: 0 };
      current.quantidade += quantidade;
      current.faturamento += faturamentoDoItem(Number(group._sum.valorUnitario ?? 0), group.nomeEtapa);
      salesByProductAndStage.set(key, current);
    }
    const vendasPorProdutoEtapa = [...salesByProductAndStage.values()]
      .sort((a, b) => b.faturamento - a.faturamento);

    return NextResponse.json({
      titulo: valor,
      dimensao,
      pagina,
      pageSize,
      total,
      paginas: Math.ceil(total / pageSize),
      vendedores,
      vendasPorProdutoEtapa,
      vendas: rows.map((row) => ({
        itemNeoId: row.itemNeoId.toString(),
        numeroPedido: row.numeroPedido,
        vendedor: row.vendedorCorrigido || row.nomeUsuarioOriginal || "Sem vendedor",
        vendedorOriginal: row.nomeUsuarioOriginal,
        equipe: row.nomeEquipe || "Sem equipe",
        produto: row.nomeProduto || row.categoriaProduto || "Sem produto",
        etapa: row.nomeEtapa || "Sem etapa",
        tipo: row.tipoNegociacao,
        estado: row.estado,
        quantidade: row.quantidade,
        valorUnitario: Number(row.valorUnitario),
        faturamento: faturamentoDoItem(Number(row.valorUnitario), row.nomeEtapa),
        dataReferencia: row.dataReferencia,
      })),
    });
  } catch (error) {
    console.error("Falha ao consultar detalhes do dashboard", error);
    return NextResponse.json({ error: "Não foi possível carregar as vendas deste detalhe" }, { status: 503 });
  }
}
