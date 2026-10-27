"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, ArrowDownToLine, ArrowUpRight, Boxes, CalendarDays, ChevronDown, CircleHelp, Download, LayoutDashboard, LoaderCircle, RefreshCw, Search, Settings2, ShieldCheck, ShoppingBag, Target, Users, WalletCards } from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { currency, number } from "@/lib/format";

type Aggregate = { nome: string; faturamento: number; quantidade: number };
type DashboardData = {
  resumo: { faturamento: number; quantidade: number; ticketMedio: number; meta: number; metaQuantidade: number; percentualMeta: number | null; faltaParaMeta: number; ritmoDiarioNecessario: number; projecao: number; diasUteisRestantes: number };
  vendasPorDia: Array<{ data: string; faturamento: number; quantidade: number }>;
  rankingVendedores: Aggregate[];
  produtos: Aggregate[];
  equipes: Aggregate[];
  etapas: Aggregate[];
  filtrosDisponiveis: { equipes: string[]; vendedores: string[]; produtos: string[]; tipos: string[]; estados: string[]; etapas: string[] };
  ultimaSincronizacao: { finalizadaEm: string | null; status: string; mensagemErro: string | null } | null;
  regras: { faturamento: string; etapasIncluidas: string; ticketMedio: string };
};

type Filters = { inicio: string; fim: string; equipe: string; vendedor: string; produto: string; tipo: string; estado: string; etapa: string };

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const initialFilters: Filters = { inicio: `${today.slice(0, 7)}-01`, fim: today, equipe: "", vendedor: "", produto: "", tipo: "", estado: "", etapa: "" };
const colors = ["#4e70e7", "#40a98d", "#ed9b59", "#9c7be4", "#e47d87", "#49a6c4", "#c3a244", "#71829b"];
type DetailDimension = "vendedor" | "etapa" | "equipe" | "produto";
const filterStorageKey = "neo-dashboard-filtros";
const filterKeys: Array<keyof Filters> = ["inicio", "fim", "equipe", "vendedor", "produto", "tipo", "estado", "etapa"];

function normalizeFilters(value: unknown): Filters | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (filterKeys.some((key) => typeof candidate[key] !== "string")) return null;
  return Object.fromEntries(filterKeys.map((key) => [key, candidate[key]])) as Filters;
}

function greetingDate() {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" }).format(new Date());
}

function shortDate(value: string) {
  const [, month, day] = value.split("-");
  return `${day}/${month}`;
}

function Kpi({ title, value, note, icon: Icon, tone = "blue" }: { title: string; value: string; note: string; icon: typeof WalletCards; tone?: string }) {
  return <article className="kpi-card">
    <div className="kpi-top"><span>{title}</span><span className={`kpi-icon ${tone}`}><Icon size={18} strokeWidth={1.8} /></span></div>
    <strong>{value}</strong><span className="kpi-note">{note}</span>
  </article>;
}

function ChartTip({ active, payload, label, mode = "money" }: { active?: boolean; payload?: Array<{ value: number; name: string; color: string }>; label?: string; mode?: "money" | "quantity" }) {
  if (!active || !payload?.length) return null;
  return <div className="chart-tooltip"><b>{label}</b>{payload.map((entry) => <span key={entry.name}><i style={{ background: entry.color }} />{entry.name}: {mode === "money" ? currency.format(entry.value) : number.format(entry.value)}</span>)}</div>;
}

function FilterSelect({ label, value, choices, onChange }: { label: string; value: string; choices: string[]; onChange: (value: string) => void }) {
  return <label className="filter-select"><span>{label}</span><span className="select-wrap"><select value={value} onChange={(event) => onChange(event.target.value)}><option value="">Todos</option>{choices.map((choice) => <option key={choice} value={choice}>{choice}</option>)}</select><ChevronDown size={14} /></span></label>;
}

export default function Home() {
  const [filters, setFilters] = useState(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState(initialFilters);
  const [filtersReady, setFiltersReady] = useState(false);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const query = useMemo(() => new URLSearchParams(Object.entries(appliedFilters).filter(([, value]) => value)).toString(), [appliedFilters]);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/dashboard?${query}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Falha ao carregar os indicadores");
      setData(result as DashboardData);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar os dados");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const hasUrlFilters = filterKeys.some((key) => params.has(key));
      if (hasUrlFilters) {
        const fromUrl = { ...initialFilters };
        for (const key of filterKeys) {
          const value = params.get(key);
          if (value !== null) fromUrl[key] = value;
        }
        setFilters(fromUrl);
        setAppliedFilters(fromUrl);
      } else {
        try {
          const stored = window.localStorage.getItem(filterStorageKey);
          if (stored) {
            const parsed: unknown = JSON.parse(stored);
            if (parsed && typeof parsed === "object") {
              const saved = parsed as { filters?: unknown; appliedFilters?: unknown };
              const savedFilters = normalizeFilters(saved.filters);
              const savedApplied = normalizeFilters(saved.appliedFilters);
              if (savedFilters) setFilters(savedFilters);
              if (savedApplied) setAppliedFilters(savedApplied);
            }
          }
        } catch {
          window.localStorage.removeItem(filterStorageKey);
        }
      }
      setFiltersReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!filtersReady) return;
    window.localStorage.setItem(filterStorageKey, JSON.stringify({ filters, appliedFilters }));
  }, [filters, appliedFilters, filtersReady]);

  useEffect(() => {
    if (!filtersReady) return;
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load, filtersReady]);

  const summary = data?.resumo;
  const progress = Math.min(summary?.percentualMeta ?? 0, 100);

  function detailHref(dimensao: DetailDimension, valor: string) {
    const params = new URLSearchParams(Object.entries(appliedFilters).filter(([, value]) => value));
    params.set("dimensao", dimensao);
    params.set("valor", valor);
    return `/detalhes?${params.toString()}`;
  }

  function downloadCSV() {
    if (!data) return;
    const rows = [["Data", "Faturamento", "Quantidade"], ...data.vendasPorDia.map((item) => [item.data, item.faturamento.toFixed(2), String(item.quantidade)])];
    const csv = `\uFEFF${rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(";")).join("\r\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `vendas-${appliedFilters.inicio}-${appliedFilters.fim}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <Link className="brand" href="/"><span className="brand-mark"><Activity size={21} /></span><span>neo<span className="brand-light">.insights</span><small>PRODUÇÃO COMERCIAL</small></span></Link>
      <div className="nav-caption">MENU PRINCIPAL</div>
      <nav className="side-nav">
        <Link className="nav-item active" href="/"><LayoutDashboard size={18} />Visão geral</Link>
        <Link className="nav-item" href="/vendedores"><Users size={18} />Vendedores</Link>
        <Link className="nav-item" href="/metas"><Target size={18} />Metas</Link>
        <a className="nav-item" href="#sync-status"><RefreshCw size={18} />Sincronizações</a>
      </nav>
      <div className="sidebar-foot">
        <div className="privacy-card"><ShieldCheck size={17} /><div><b>Dados protegidos</b><span>Credenciais processadas no servidor.</span></div></div>
        <div className="sidebar-user"><div className="user-avatar">NE</div><div><b>Equipe comercial</b><span>Dashboard interno</span></div><Settings2 size={16} /></div>
      </div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div className="breadcrumb">Dashboard <span>/</span> <b>Visão geral</b></div><div className="topbar-actions"><button className="icon-button" aria-label="Ajuda"><CircleHelp size={18} /></button><span className="topbar-divider" /><span className="topbar-date"><CalendarDays size={16} />{greetingDate()}</span><div className="user-avatar small">NE</div></div></header>
      <div className="page-content">
        <div className="page-heading"><div><div className="eyebrow">ACOMPANHAMENTO DE RESULTADOS</div><h1>Visão geral</h1><p>Uma leitura clara da produção e das metas da equipe.</p></div><button className="button button-outline" onClick={() => void load()} disabled={loading}><RefreshCw size={16} className={loading ? "spin" : ""} />Atualizar dados</button></div>

        <section className="filters-panel"><div className="filter-heading"><div><span className="filter-icon"><Search size={16} /></span><b>Filtros</b><span className="muted">Refine os indicadores do período</span></div><button className="text-button" onClick={() => { setFilters(initialFilters); setAppliedFilters(initialFilters); }}>Limpar filtros</button></div>
          <form className="filter-grid" onSubmit={(event) => { event.preventDefault(); setAppliedFilters(filters); }}>
            <label className="filter-date"><span>Data inicial</span><input type="date" value={filters.inicio} onChange={(event) => setFilters({ ...filters, inicio: event.target.value })} required /></label>
            <label className="filter-date"><span>Data final</span><input type="date" value={filters.fim} onChange={(event) => setFilters({ ...filters, fim: event.target.value })} required /></label>
            <FilterSelect label="Equipe" value={filters.equipe} choices={data?.filtrosDisponiveis.equipes ?? []} onChange={(equipe) => setFilters({ ...filters, equipe })} />
            <FilterSelect label="Vendedor" value={filters.vendedor} choices={data?.filtrosDisponiveis.vendedores ?? []} onChange={(vendedor) => setFilters({ ...filters, vendedor })} />
            <FilterSelect label="Produto" value={filters.produto} choices={data?.filtrosDisponiveis.produtos ?? []} onChange={(produto) => setFilters({ ...filters, produto })} />
            <FilterSelect label="Tipo" value={filters.tipo} choices={data?.filtrosDisponiveis.tipos ?? []} onChange={(tipo) => setFilters({ ...filters, tipo })} />
            <FilterSelect label="Estado" value={filters.estado} choices={data?.filtrosDisponiveis.estados ?? []} onChange={(estado) => setFilters({ ...filters, estado })} />
            <FilterSelect label="Etapa" value={filters.etapa} choices={data?.filtrosDisponiveis.etapas ?? []} onChange={(etapa) => setFilters({ ...filters, etapa })} />
            <button className="button button-primary filter-submit" type="submit"><Search size={15} />Aplicar filtros</button>
          </form>
        </section>

        {error && <div className="notice notice-error"><CircleHelp size={17} /><div><b>Não foi possível atualizar os dados</b><span>{error}. Confira o banco de dados e as variáveis de ambiente do servidor.</span></div><button className="text-button" onClick={() => void load()}>Tentar novamente</button></div>}

        {data && <>
          <div className="section-label"><span>RESUMO DO PERÍODO</span><span className="live-dot" />Dados do banco local</div>
          <section className="kpi-grid">
            <Kpi title="Faturamento" value={currency.format(summary!.faturamento)} note={`${number.format(summary!.quantidade)} itens vendidos`} icon={WalletCards} />
            <Kpi title="Quantidade" value={number.format(summary!.quantidade)} note="Unidades no período selecionado" icon={ShoppingBag} tone="green" />
            <Kpi title="Ticket médio" value={currency.format(summary!.ticketMedio)} note="Por pedido distinto" icon={ArrowUpRight} tone="purple" />
            <Kpi title="Atingimento da meta" value={summary!.percentualMeta == null ? "Sem meta" : `${summary!.percentualMeta.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`} note={summary!.meta ? `${currency.format(summary!.faltaParaMeta)} restantes` : "Cadastre metas para acompanhar"} icon={Target} tone="orange" />
          </section>

          <section className="insight-grid">
            <article className="panel chart-panel sales-chart"><div className="panel-heading"><div><span className="panel-icon blue"><Activity size={17} /></span><div><h2>Vendas por dia</h2><p>Faturamento diário no período</p></div></div><span className="chart-unit">EM REAIS</span></div>
              <div className="chart-area">{loading ? <div className="chart-loading"><LoaderCircle className="spin" />Atualizando...</div> : data.vendasPorDia.length === 0 ? <div className="empty-chart">Ainda não há vendas neste período.</div> : <ResponsiveContainer width="100%" height="100%"><AreaChart data={data.vendasPorDia} margin={{ top: 10, right: 5, left: 8, bottom: 0 }}><defs><linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5676e8" stopOpacity={0.2} /><stop offset="95%" stopColor="#5676e8" stopOpacity={0.01} /></linearGradient></defs><CartesianGrid vertical={false} stroke="#edf0f5" strokeDasharray="4 5" /><XAxis dataKey="data" tickFormatter={shortDate} axisLine={false} tickLine={false} tick={{ fill: "#98a0b0", fontSize: 11 }} minTickGap={24} /><YAxis axisLine={false} tickLine={false} tick={{ fill: "#98a0b0", fontSize: 11 }} tickFormatter={(v) => v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)} width={42} /><Tooltip content={<ChartTip />} /><Area type="monotone" dataKey="faturamento" name="Faturamento" stroke="#5878e7" strokeWidth={2.5} fill="url(#salesFill)" activeDot={{ r: 5, strokeWidth: 0 }} /></AreaChart></ResponsiveContainer>}</div>
              <div className="chart-footer"><span><i className="legend-dot blue-dot" />Faturamento</span><span><CalendarDays size={14} />{shortDate(appliedFilters.inicio)} â€“ {shortDate(appliedFilters.fim)}</span></div>
            </article>
            <article className="panel goal-panel"><div className="panel-heading"><div><span className="panel-icon green"><Target size={17} /></span><div><h2>Meta x realizado</h2><p>Progresso consolidado no período</p></div></div><span className="more-mark">•••</span></div>
              <div className="goal-total"><strong>{currency.format(summary!.faturamento)}</strong><span>realizado</span></div>
              <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
              <div className="progress-label"><span>{summary!.percentualMeta == null ? "Meta não cadastrada" : `${summary!.percentualMeta.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% da meta`}</span><span>{currency.format(summary!.meta)}</span></div>
              <div className="goal-details"><div><span>Falta para meta</span><b>{currency.format(summary!.faltaParaMeta)}</b></div><div><span>Ritmo diário necessário</span><b>{currency.format(summary!.ritmoDiarioNecessario)}<small> / dia útil</small></b></div><div><span>Projeção do período</span><b>{currency.format(summary!.projecao)}</b></div></div>
              <Link className="goal-link" href="/metas">Gerenciar metas <ArrowUpRight size={15} /></Link>
            </article>
          </section>

          <section className="lower-grid">
            <article className="panel ranking-panel" id="ranking"><div className="panel-heading"><div><span className="panel-icon purple"><Users size={17} /></span><div><h2>Ranking de vendedores</h2><p>Maiores faturamentos do período</p></div></div><span className="chart-unit">TOP 10</span></div>
              {data.rankingVendedores.length ? <div className="ranking-list">{data.rankingVendedores.map((seller, index) => <Link className="ranking-row detail-link-row" href={detailHref("vendedor", seller.nome)} key={seller.nome}><span className={`rank-number ${index < 3 ? "rank-top" : ""}`}>{String(index + 1).padStart(2, "0")}</span><div className="rank-person"><span className={`rank-avatar avatar-${index % 5}`}>{seller.nome.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span><span><b>{seller.nome}</b><small>{number.format(seller.quantidade)} itens</small></span></div><div className="rank-value"><b>{currency.format(seller.faturamento)}</b><span><i style={{ width: `${data.rankingVendedores[0].faturamento ? seller.faturamento / data.rankingVendedores[0].faturamento * 100 : 0}%` }} /></span></div></Link>)}</div> : <div className="empty-chart">Sem vendas para classificar neste período.</div>}
            </article>
            <article className="panel products-panel"><div className="panel-heading"><div><span className="panel-icon orange"><Boxes size={17} /></span><div><h2>Produtos em destaque</h2><p>Itens com maior faturamento</p></div></div></div>
              {data.produtos.length ? <div className="clickable-bars">{data.produtos.map((product, index) => { const maxValue = data.produtos[0]?.faturamento || 1; return <Link className="clickable-bar-row" href={detailHref("produto", product.nome)} key={product.nome}><span className="clickable-bar-name" title={product.nome}>{product.nome}</span><span className="clickable-bar-track"><i style={{ width: `${Math.max(3, product.faturamento / maxValue * 100)}%`, background: colors[index % colors.length] }} /></span><b>{currency.format(product.faturamento)}</b></Link>; })}</div> : <div className="empty-chart">Sem produtos no período.</div>}
            </article>
          </section>

          <section className="lower-grid secondary-grid">
            <article className="panel distribution-panel"><div className="panel-heading"><div><span className="panel-icon cyan"><Users size={17} /></span><div><h2>Vendas por equipe</h2><p>Distribuição de faturamento</p></div></div></div><div className="distribution-list">{data.equipes.slice(0, 5).map((team, index) => <Link className="distribution-row detail-link-row" href={detailHref("equipe", team.nome)} key={team.nome}><span className="distribution-name"><i style={{ background: colors[index] }} />{team.nome}</span><b>{currency.format(team.faturamento)}</b><span className="distribution-track"><i style={{ width: `${data.equipes[0]?.faturamento ? team.faturamento / data.equipes[0].faturamento * 100 : 0}%`, background: colors[index] }} /></span></Link>)}{!data.equipes.length && <div className="empty-chart">Sem equipes neste período.</div>}</div></article>
            <article className="panel stages-panel"><div className="panel-heading"><div><span className="panel-icon rose"><Activity size={17} /></span><div><h2>Etapas do funil</h2><p>Valores por etapa registrada no NEO</p></div></div></div><div className="stage-list">{data.etapas.slice(0, 5).map((stage, index) => <Link className="stage-row detail-link-row" href={detailHref("etapa", stage.nome)} key={stage.nome}><span className="stage-index">0{index + 1}</span><b>{stage.nome}</b><span>{currency.format(stage.faturamento)}</span></Link>)}{!data.etapas.length && <div className="empty-chart">Sem etapas neste período.</div>}</div></article>
          </section>

          <footer className="dashboard-footer" id="sync-status"><span><span className={`sync-indicator ${data.ultimaSincronizacao?.status === "sucesso" ? "ok" : ""}`} />{data.ultimaSincronizacao ? data.ultimaSincronizacao.status === "sucesso" ? `Última sincronização ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(data.ultimaSincronizacao.finalizadaEm || ""))}` : "A última sincronização registrou erro" : "Nenhuma sincronização registrada"}</span><span className="sync-schedule">Atualização agendada pela API a cada 30 min</span></footer>
          {data.ultimaSincronizacao?.mensagemErro && data.ultimaSincronizacao.status !== "sucesso" && <div className="sync-error">Detalhe da última falha: {data.ultimaSincronizacao.mensagemErro}</div>}
          <div className="assumption-note"><ShieldCheck size={15} /><span>Faturamento: soma dos valores recebidos do NEO apenas nas etapas CONCLUÍDO (NEOCRM) e Logistica concluída (NEOCRM). A quantidade considera todas as etapas.</span><button onClick={downloadCSV} title="Baixar vendas por dia em CSV" className="icon-button"><Download size={16} /></button></div>
        </>}

        {!data && !loading && <div className="empty-state"><span><WalletCards size={25} /></span><h2>Conecte o banco para ver o painel</h2><p>Configure as variáveis de ambiente e aplique a migração do Prisma. Seus tokens ficam somente no servidor.</p><Link className="button button-primary" href="/metas">Configurar metas <ArrowDownToLine size={15} /></Link></div>}
        {loading && !data && <div className="initial-loading"><LoaderCircle className="spin" size={22} />Conectando aos dados do dashboardâ€¦</div>}
      </div>
    </main>
  </div>;
}
