const ETAPAS_COM_FATURAMENTO = new Set([
  "CONCLUIDO (NEOCRM)",
  "LOGISTICA CONCLUIDA (NEOCRM)",
]);

export function etapaContaNoFaturamento(etapa: string | null | undefined): boolean {
  if (!etapa) return false;

  const nomeNormalizado = etapa.trim().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toUpperCase();

  return ETAPAS_COM_FATURAMENTO.has(nomeNormalizado);
}

export function faturamentoDoItem(valorNeo: number, etapa: string | null | undefined): number {
  return etapaContaNoFaturamento(etapa) ? valorNeo : 0;
}
