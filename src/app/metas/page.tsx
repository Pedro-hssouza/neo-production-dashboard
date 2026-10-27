"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { ArrowLeft, Check, LoaderCircle, Plus, Save, Target, Users } from "lucide-react";
import { currency, parseDinheiro } from "@/lib/format";

type MetaRow = { id: number; nomeVendedor: string; ano: number; mes: number; metaValor: string | number | null; metaQuantidade: number | null; atualizadoEm: string; historico: Array<{ alteradoEm: string; alteradoPor: string; metaValor: string | number | null; metaQuantidade: number | null }> };

const current = new Date();
const thisYear = Number(new Intl.DateTimeFormat("en", { timeZone: "America/Sao_Paulo", year: "numeric" }).format(current));
const thisMonth = Number(new Intl.DateTimeFormat("en", { timeZone: "America/Sao_Paulo", month: "numeric" }).format(current));
const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export default function MetasPage() {
  const [rows, setRows] = useState<MetaRow[]>([]);
  const [sellers, setSellers] = useState<string[]>([]);
  const [year, setYear] = useState(thisYear);
  const [month, setMonth] = useState(thisMonth);
  const [seller, setSeller] = useState("");
  const [revenue, setRevenue] = useState("");
  const [quantity, setQuantity] = useState("");
  const [operator, setOperator] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [metaResponse, dashboardResponse] = await Promise.all([
        fetch(`/api/metas?ano=${year}&mes=${month}`, { cache: "no-store" }),
        fetch("/api/dashboard", { cache: "no-store" }),
      ]);
      const metaData = await metaResponse.json();
      const dashboardData = await dashboardResponse.json();
      if (!metaResponse.ok) throw new Error(metaData.error || "Não foi possível carregar as metas");
      setRows(metaData.metas);
      setSellers(dashboardData.filtrosDisponiveis?.vendedores ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao carregar metas");
    } finally { setLoading(false); }
  }, [year, month]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const secret = window.prompt("Informe o DASHBOARD_WRITE_SECRET configurado no servidor:");
    if (!secret) return;
    setSaving(true);
    try {
      const response = await fetch("/api/metas", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
        body: JSON.stringify({ nomeVendedor: seller, ano: year, mes: month, metaValor: revenue ? parseDinheiro(revenue) : null, metaQuantidade: quantity ? Number(quantity) : null, alteradoPor: operator }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível salvar a meta");
      setSeller(""); setRevenue(""); setQuantity("");
      setMessage("Meta salva com sucesso.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao salvar a meta");
    } finally { setSaving(false); }
  }

  return <div className="app-shell">
    <aside className="sidebar"><Link className="brand" href="/"><span className="brand-mark"><Target size={21} /></span><span>neo<span className="brand-light">.insights</span><small>PRODUÇÃO COMERCIAL</small></span></Link><div className="nav-caption">MENU PRINCIPAL</div><nav className="side-nav"><Link className="nav-item" href="/"><ArrowLeft size={18} />Voltar ao painel</Link><span className="nav-item active"><Target size={18} />Metas</span></nav><div className="sidebar-foot"><div className="privacy-card"><Users size={17} /><div><b>Metas por vendedor</b><span>Valores mensais no banco local.</span></div></div></div></aside>
    <main className="main-area"><header className="topbar"><div className="breadcrumb"><Link href="/">Dashboard</Link><span>/</span><b>Metas</b></div><span className="topbar-date"><Target size={16} />Gestão de metas mensais</span></header>
      <div className="page-content"><div className="page-heading"><div><div className="eyebrow">PLANEJAMENTO COMERCIAL</div><h1>Metas mensais</h1><p>Cadastre metas de faturamento e quantidade por vendedor.</p></div></div>
        <div className="meta-toolbar"><label><span>Mês</span><select value={month} onChange={(event) => setMonth(Number(event.target.value))}>{months.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}</select></label><label><span>Ano</span><input type="number" min={2020} max={2100} value={year} onChange={(event) => setYear(Number(event.target.value))} /></label><span className="meta-caption">Metas válidas para {months[month - 1]} de {year}</span></div>
        <section className="meta-layout"><article className="panel meta-form-panel"><div className="panel-heading"><div><span className="panel-icon blue"><Plus size={17} /></span><div><h2>Nova meta</h2><p>Salvar ou atualizar um vendedor neste mês</p></div></div></div>
          <form className="meta-form" onSubmit={save}><label><span>Vendedor</span><input list="seller-list" required minLength={2} maxLength={120} placeholder="Digite ou selecione o nome" value={seller} onChange={(event) => setSeller(event.target.value)} /><datalist id="seller-list">{sellers.map((name) => <option key={name} value={name} />)}</datalist></label><label><span>Meta de faturamento</span><div className="currency-input"><span>R$</span><input inputMode="decimal" placeholder="0,00" value={revenue} onChange={(event) => setRevenue(event.target.value)} /></div></label><label><span>Meta de quantidade</span><input type="number" min="0" step="1" placeholder="Opcional" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label><label><span>Seu nome (registro de alteração)</span><input required minLength={2} maxLength={120} value={operator} onChange={(event) => setOperator(event.target.value)} placeholder="Responsável pela alteração" /></label><button className="button button-primary" disabled={saving || !seller || !operator}>{saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}Salvar meta</button></form>
          <div className="secret-hint">A gravação exige o <code>DASHBOARD_WRITE_SECRET</code> do servidor. Ele é solicitado somente no momento do salvamento.</div>
        </article>
        <article className="panel meta-list-panel"><div className="panel-heading"><div><span className="panel-icon green"><Target size={17} /></span><div><h2>Metas cadastradas</h2><p>{rows.length} vendedor{rows.length === 1 ? "" : "es"} neste mês</p></div></div></div>
          {message && <div className={`meta-message ${message.includes("sucesso") ? "success" : "error"}`}>{message}</div>}
          {loading ? <div className="empty-chart"><LoaderCircle className="spin" />Carregando metas…</div> : rows.length ? <><div className="meta-table-wrap"><table className="meta-table"><thead><tr><th>Vendedor</th><th>Meta em reais</th><th>Quantidade</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><span className="meta-person"><i>{row.nomeVendedor.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</i>{row.nomeVendedor}</span></td><td>{row.metaValor == null ? "—" : currency.format(Number(row.metaValor))}</td><td>{row.metaQuantidade?.toLocaleString("pt-BR") ?? "—"}</td></tr>)}</tbody></table></div><div className="meta-history"><b>Alterações recentes</b>{rows.flatMap((row) => row.historico.map((entry) => ({ ...entry, vendedor: row.nomeVendedor }))).slice(0, 8).map((entry, index) => <div key={`${entry.vendedor}-${entry.alteradoEm}-${index}`}><span><b>{entry.vendedor}</b><small>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(entry.alteradoEm))} · por {entry.alteradoPor}</small></span><span>{entry.metaValor == null ? "—" : currency.format(Number(entry.metaValor))}</span></div>)}</div></> : <div className="empty-meta"><span><Target size={22} /></span><b>Nenhuma meta cadastrada</b><p>Use o formulário ao lado para começar o acompanhamento mensal.</p></div>}
        </article></section>
        <div className="assumption-note"><Check size={15} /><span>Uma meta mensal é identificada pelo nome do vendedor, ano e mês. Para manter a comparação consistente, use o mesmo nome que aparece nos filtros do dashboard.</span></div>
      </div>
    </main>
  </div>;
}
