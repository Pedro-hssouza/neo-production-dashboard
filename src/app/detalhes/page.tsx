"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Activity, ArrowLeft, ChevronLeft, ChevronRight, CircleHelp, LoaderCircle, PackageSearch, Users } from "lucide-react";
import { currency, number } from "@/lib/format";

type DetailDimension = "vendedor" | "etapa" | "equipe" | "produto";
type SaleDetail = {
  itemNeoId: string;
  numeroPedido: string | null;
  vendedor: string;
  vendedorOriginal: string | null;
  equipe: string;
  produto: string;
  etapa: string;
  tipo: string | null;
  estado: string | null;
  quantidade: number;
  valorUnitario: number;
  faturamento: number;
  dataReferencia: string | null;
};
type DetailResponse = { titulo: string; dimensao: DetailDimension; pagina: number; pageSize: number; total: number; paginas: number; vendedores: Array<{ nome: string; quantidade: number; faturamento: number }>; vendasPorProdutoEtapa: Array<{ produto: string; etapa: string; quantidade: number; faturamento: number }>; vendas: SaleDetail[] };

const dimensionLabels: Record<DetailDimension, string> = {
  vendedor: "Vendedor",
  etapa: "Etapa do funil",
  equipe: "Equipe",
  produto: "Produto",
};

function formatDate(value: string | null) {
  if (!value) return "Sem data";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value));
}

function DetailsContent() {
  const search = useSearchParams();
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const baseQuery = useMemo(() => {
    const query = new URLSearchParams(search.toString());
    query.delete("pagina");
    return query;
  }, [search]);
  const query = useMemo(() => {
    const params = new URLSearchParams(baseQuery);
    params.set("pagina", String(page));
    return params.toString();
  }, [baseQuery, page]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/dashboard/detalhes?${query}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível carregar os detalhes");
      setResult(payload as DetailResponse);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao carregar os detalhes");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const backQuery = new URLSearchParams();
  for (const key of ["inicio", "fim", "equipe", "vendedor", "produto", "tipo", "estado", "etapa"]) {
    const value = baseQuery.get(key);
    if (value) backQuery.set(key, value);
  }
  const backHref = backQuery.size ? `/?${backQuery.toString()}` : "/";
  const rawDimension = search.get("dimensao");
  const dimension = rawDimension && rawDimension in dimensionLabels ? rawDimension as DetailDimension : null;
  const title = search.get("valor") || "Detalhes";
  const start = search.get("inicio");
  const end = search.get("fim");

  if (!dimension || !search.get("valor")) {
    return <main className="main-area detail-main"><div className="page-content"><Link className="button button-outline" href="/"><ArrowLeft size={15} />Voltar ao dashboard</Link><div className="detail-state"><CircleHelp size={24} /><h1>Não foi possível identificar o detalhe</h1><p>Volte ao painel e clique em um vendedor, produto, etapa ou equipe.</p></div></div></main>;
  }

  return <div className="app-shell detail-shell">
    <aside className="sidebar"><Link className="brand" href="/"><span className="brand-mark"><Activity size={21} /></span><span>neo<span className="brand-light">.insights</span><small>PRODUÇÃO COMERCIAL</small></span></Link><div className="nav-caption">DETALHAMENTO</div><Link className="nav-item active" href={backHref}><ArrowLeft size={18} />Voltar ao painel</Link><div className="sidebar-foot"><div className="privacy-card"><PackageSearch size={17} /><div><b>Vendas relacionadas</b><span>Registros do banco local.</span></div></div></div></aside>
    <main className="main-area"><header className="topbar"><div className="breadcrumb"><Link href={backHref}>Dashboard</Link><span>/</span><b>Detalhes</b></div><span className="topbar-date"><PackageSearch size={16} />Exibição detalhada</span></header>
      <div className="page-content">
        <div className="detail-back"><Link className="button button-outline" href={backHref}><ArrowLeft size={15} />Voltar aos resultados</Link></div>
        <div className="page-heading detail-heading"><div><div className="eyebrow">{dimensionLabels[dimension].toUpperCase()} · DETALHAMENTO</div><h1>{title}</h1><p>Vendas que formam este resultado, respeitando o período e os filtros do dashboard.</p></div></div>
        <section className="detail-summary"><div><span>Período</span><b>{start || "Início do mês"} – {end || "hoje"}</b></div><div><span>Registros encontrados</span><b>{loading ? "Carregando…" : number.format(result?.total ?? 0)}</b></div><div><span>Página</span><b>{result ? `${result.pagina} de ${Math.max(result.paginas, 1)}` : "—"}</b></div></section>
        {error && <div className="notice notice-error"><CircleHelp size={17} /><div><b>Não foi possível carregar as vendas</b><span>{error}</span></div><button className="text-button" onClick={() => void load()}>Tentar novamente</button></div>}
        <section className="panel details-table-panel">
          <div className="panel-heading"><div><span className="panel-icon blue"><PackageSearch size={17} /></span><div><h2>Vendas relacionadas</h2><p>Até 50 registros por página</p></div></div></div>
          {dimension === "produto" && result && <section className="seller-quantity-panel"><div className="seller-quantity-heading"><div><span className="panel-icon purple"><Users size={17} /></span><div><h2>Quantidade por vendedor</h2><p>Unidades vendidas e faturamento total deste produto no período.</p></div></div></div>{result.vendedores.length ? <div className="seller-quantity-chart">{result.vendedores.map((seller) => { const maxQuantity = result.vendedores[0]?.quantidade || 1; return <div className="seller-quantity-row" key={seller.nome}><b className="seller-quantity-name" title={seller.nome}>{seller.nome}</b><span className="seller-quantity-track"><i style={{ width: `${Math.max(2, seller.quantidade / maxQuantity * 100)}%` }} /></span><strong>{number.format(seller.quantidade)} un.</strong><b className="seller-quantity-revenue">{currency.format(seller.faturamento)}</b></div>; })}</div> : <p className="seller-quantity-empty">Não há vendas por vendedor para este produto neste período.</p>}</section>}
          {dimension === "vendedor" && result && <section className="product-stage-panel"><div className="seller-quantity-heading"><div><span className="panel-icon cyan"><PackageSearch size={17} /></span><div><h2>Vendas por produto e etapa</h2><p>Quantidade e faturamento total de cada combinação neste período.</p></div></div></div>{result.vendasPorProdutoEtapa.length ? <div className="product-stage-chart">{result.vendasPorProdutoEtapa.map((group) => { const maxRevenue = result.vendasPorProdutoEtapa[0]?.faturamento || 1; return <div className="product-stage-row" key={`${group.produto}-${group.etapa}`}><b className="product-stage-name" title={group.produto}>{group.produto}</b><span className="product-stage-label" title={group.etapa}>{group.etapa}</span><span className="product-stage-track"><i style={{ width: `${Math.max(2, group.faturamento / maxRevenue * 100)}%` }} /></span><strong className="product-stage-quantity">{number.format(group.quantidade)} un.</strong><strong className="product-stage-revenue">{currency.format(group.faturamento)}</strong></div>; })}</div> : <p className="seller-quantity-empty">Não há vendas agrupadas por produto e etapa neste período.</p>}</section>}
          {loading ? <div className="detail-state compact"><LoaderCircle className="spin" size={22} /><span>Buscando registros no banco…</span></div> : result?.vendas.length ? <div className="details-table-wrap"><table className="details-table"><thead><tr><th>Data</th><th>Pedido / item</th><th>Vendedor</th><th>Equipe</th><th>Produto</th><th>Etapa</th><th>Qtd.</th><th>Valor NEO</th><th>Faturamento</th></tr></thead><tbody>{result.vendas.map((sale) => <tr key={sale.itemNeoId}><td>{formatDate(sale.dataReferencia)}</td><td><b>{sale.numeroPedido || "—"}</b><small>NEO #{sale.itemNeoId}</small></td><td><b>{sale.vendedor}</b>{sale.vendedorOriginal && sale.vendedorOriginal !== sale.vendedor && <small>Original: {sale.vendedorOriginal}</small>}</td><td>{sale.equipe}</td><td>{sale.produto}</td><td><span className="detail-stage">{sale.etapa}</span></td><td>{number.format(sale.quantidade)}</td><td>{currency.format(sale.valorUnitario)}</td><td className="detail-revenue">{currency.format(sale.faturamento)}</td></tr>)}</tbody></table></div> : <div className="detail-state"><PackageSearch size={24} /><h2>Nenhuma venda encontrada</h2><p>Não há registros para esse item com os filtros e período atuais.</p></div>}
          {result && result.paginas > 1 && <div className="pagination"><span>Exibindo {(result.pagina - 1) * result.pageSize + 1}–{Math.min(result.pagina * result.pageSize, result.total)} de {number.format(result.total)}</span><div><button className="button button-outline" disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))}><ChevronLeft size={15} />Anterior</button><button className="button button-outline" disabled={page >= result.paginas || loading} onClick={() => setPage((current) => current + 1)}>Próxima<ChevronRight size={15} /></button></div></div>}
        </section>
      </div>
    </main>
  </div>;
}

export default function DetailsPage() {
  return <Suspense fallback={<main className="main-area detail-main"><div className="initial-loading"><LoaderCircle className="spin" size={22} />Abrindo detalhes…</div></main>}><DetailsContent /></Suspense>;
}
