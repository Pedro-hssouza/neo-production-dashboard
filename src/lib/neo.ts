import { z } from "zod";
import { parseDataBR, parseDinheiro } from "@/lib/format";

const optionalBigInt = z.union([z.string(), z.number(), z.bigint()]).nullish()
  .transform((value) => value == null || value === "" ? null : BigInt(value));

const neoItemSchema = z.object({
  itemId: z.union([z.string(), z.number(), z.bigint()]).transform(BigInt),
  numeroPedido: z.string().nullish(),
  estruturaUsuarioId: optionalBigInt,
  nomeUsuario: z.string().nullish(),
  equipeId: optionalBigInt,
  nomeEquipe: z.string().nullish(),
  produtoId: optionalBigInt,
  nomeProduto: z.string().nullish(),
  produtoCategoriaNome: z.string().nullish(),
  quantidade: z.coerce.number().int().nonnegative().nullish().transform((value) => value ?? 0),
  valor: z.union([z.string(), z.number()]).nullish(),
  nomeEtapa: z.string().nullish(),
  nomeEtapaItem: z.string().nullish(),
  tipoNegociacao: z.string().nullish(),
  nomeCliente: z.string().nullish(),
  estado: z.string().nullish(),
  dataReferencia: z.string().nullish(),
  dataHoraAtualizacao: z.string().nullish(),
}).passthrough();

export type NeoItem = z.infer<typeof neoItemSchema>;

export async function buscarProducao(inicio: string, fim: string) {
  const url = process.env.NEO_API_URL;
  const estrutura = process.env.NEO_TOKEN_ESTRUTURA;
  const usuario = process.env.NEO_TOKEN_USUARIO;
  const painel = process.env.NEO_PAINEL_ID;
  if (!url || !estrutura || !usuario || !painel) {
    throw new Error("Configure NEO_API_URL e as três credenciais NEO no .env");
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({
      tokenEstrutura: estrutura,
      tokenUsuario: usuario,
      dataHoraInicioCarga: inicio,
      dataHoraFimCarga: fim,
      painelId: painel,
      outputFormat: "json",
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) throw new Error(`API NEO respondeu HTTP ${response.status}`);
  const contentType = response.headers.get("content-type") ?? "";
  const charset = contentType.match(/charset\s*=\s*["']?([^;\s"']+)/i)?.[1] ?? "utf-8";
  let text: string;
  try {
    const bytes = await response.arrayBuffer();
    text = new TextDecoder(charset).decode(bytes);
  } catch {
    throw new Error(`Codificação da resposta NEO não suportada: ${charset}`);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("API NEO não retornou JSON válido");
  }
  if (!Array.isArray(payload)) {
    const apiError = z.object({ success: z.boolean().optional(), erro: z.string().optional() }).passthrough().safeParse(payload);
    if (apiError.success && apiError.data.success === false) {
      throw new Error(apiError.data.erro || "API NEO informou falha na consulta");
    }
  }
  return z.array(neoItemSchema).parse(payload);
}

export function dadosNormalizados(item: NeoItem) {
  const safeRaw = JSON.parse(JSON.stringify(item, (_, value) =>
    typeof value === "bigint" ? value.toString() : value,
  ));
  return {
    itemNeoId: item.itemId,
    numeroPedido: item.numeroPedido ?? null,
    estruturaUsuarioId: item.estruturaUsuarioId,
    nomeUsuarioOriginal: item.nomeUsuario ?? null,
    equipeId: item.equipeId,
    nomeEquipe: item.nomeEquipe ?? null,
    produtoId: item.produtoId,
    nomeProduto: item.nomeProduto ?? null,
    categoriaProduto: item.produtoCategoriaNome ?? null,
    quantidade: item.quantidade,
    // Nome legado: o campo valor do NEO já é o faturamento total do item.
    valorUnitario: parseDinheiro(item.valor),
    nomeEtapa: item.nomeEtapa ?? null,
    nomeEtapaItem: item.nomeEtapaItem ?? null,
    tipoNegociacao: item.tipoNegociacao ?? null,
    nomeCliente: item.nomeCliente ?? null,
    estado: item.estado ?? null,
    dataReferencia: parseDataBR(item.dataReferencia),
    dataHoraAtualizacao: parseDataBR(item.dataHoraAtualizacao),
    dadosOriginais: safeRaw,
  };
}
