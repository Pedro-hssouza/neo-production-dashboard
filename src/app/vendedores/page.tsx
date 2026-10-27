"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { ArrowLeft, LoaderCircle, Search, UserRoundCog } from "lucide-react";
import { currency } from "@/lib/format";

type Sale = { itemNeoId: string; numeroPedido: string | null; nomeUsuarioOriginal: string | null; vendedorCorrigido: string | null; vendedorExibido: string; nomeProduto: string | null; nomeEquipe: string | null; nomeEtapa: string | null; quantidade: number; valorUnitario: number; dataReferencia: string | null };

const now = new Date();
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

export default function VendedoresPage() {
  const [rows, setRows] = useState<Sale[]>([]);
  const [inicio, setInicio] = useState(`${today.slice(0, 7)}-01`);
  const [fim, setFim] = useState(today);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ inicio, fim });
      if (search.trim()) params.set("vendedor", search.trim());
      const response = await fetch(`/api/vendedores?${params}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Falha ao consultar vendas");
      setRows(result.vendas);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao consultar vendas"); }
    finally { setLoading(false); }
  }, [inicio, fim, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function correct(event: FormEvent<HTMLFormElement>, sale: Sale) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const secret = window.prompt("Informe o DASHBOARD_WRITE_SECRET configurado no servidor:");
    if (!secret) return;
    const vendedorCorreto = String(form.get("vendedorCorreto") || "").trim();
    const motivo = String(form.get("motivo") || "").trim();
    const alteradoPor = String(form.get("alteradoPor") || "").trim();
    try {
      const response = await fetch(`/api/vendedores/${sale.itemNeoId}`, {
        method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
        body: JSON.stringify({ vendedorCorreto, motivo, alteradoPor }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Falha ao salvar correção");
      window.alert("Correção salva e registrada no histórico.");
      await load();
    } catch (cause) { window.alert(cause instanceof Error ? cause.message : "Falha ao salvar correção"); }
  }

  return <div className="app-shell"><aside className="sidebar"><Link className="brand" href="/"><span className="brand-mark"><UserRoundCog size={21} /></span><span>neo<span className="brand-light">.insights</span><small>PRODUÇÃO COMERCIAL</small></span></Link><div className="nav-caption">MENU PRINCIPAL</div><nav className="side-nav"><Link className="nav-item" href="/"><ArrowLeft size={18} />Voltar ao painel</Link><span className="nav-item active"><UserRoundCog size={18} />Correções de vendedor</span><Link className="nav-item" href="/metas">Metas</Link></nav></aside>
    <main className="main-area"><header className="topbar"><div className="breadcrumb"><Link href="/">Dashboard</Link><span>/</span><b>Vendedores</b></div><span className="topbar-date"><UserRoundCog size={16} />Correções auditáveis</span></header><div className="page-content"><div className="page-heading"><div><div className="eyebrow">QUALIDADE DOS DADOS</div><h1>Correções de vendedor</h1><p>O nome recebido do NEO é preservado; ajustes ficam registrados com motivo e responsável.</p></div></div>
      <section className="filters-panel"><form className="correction-filter" onSubmit={(event) => { event.preventDefault(); void load(); }}><label className="filter-date"><span>Data inicial</span><input type="date" value={inicio} onChange={(event) => setInicio(event.target.value)} /></label><label className="filter-date"><span>Data final</span><input type="date" value={fim} onChange={(event) => setFim(event.target.value)} /></label><label className="filter-date search-filter"><span>Buscar vendedor</span><input placeholder="Nome original ou corrigido" value={search} onChange={(event) => setSearch(event.target.value)} /></label><button className="button button-primary"><Search size={15} />Buscar</button></form></section>
      {error && <div className="meta-message error">{error}</div>}
      <section className="correction-list">{loading ? <div className="chart-loading"><LoaderCircle size={20} className="spin" />Carregando vendas…</div> : rows.length ? rows.map((sale) => <article className="panel correction-card" key={sale.itemNeoId}><div className="correction-info"><span className="correction-id">NEO #{sale.itemNeoId}</span><b>{sale.vendedorExibido}</b><span>{sale.nomeProduto || "Produto não informado"} · {sale.nomeEquipe || "Sem equipe"}</span><span>{sale.dataReferencia ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(sale.dataReferencia)) : "Sem data"} · Etapa: {sale.nomeEtapa || "—"}</span><strong>Valor NEO: {currency.format(sale.valorUnitario)}</strong>{sale.vendedorCorrigido && <small>Original recebido: {sale.nomeUsuarioOriginal || "não informado"}</small>}</div><form className="correction-form" onSubmit={(event) => void correct(event, sale)}><label><span>Vendedor correto</span><input name="vendedorCorreto" required minLength={2} defaultValue={sale.vendedorExibido} /></label><label><span>Motivo da correção</span><input name="motivo" required minLength={5} placeholder="Explique o ajuste" /></label><label><span>Responsável</span><input name="alteradoPor" required minLength={2} placeholder="Seu nome" /></label><button className="button button-outline">Registrar correção</button></form></article>) : <div className="panel correction-empty">Não há vendas no período. Sincronize a API NEO para carregar registros.</div>}</section>
      <div className="assumption-note"><UserRoundCog size={15} /><span>Cada correção gera um novo registro de auditoria. O painel passa a usar o vendedor corrigido e mantém o nome original para consulta.</span></div>
    </div></main></div>;
}
