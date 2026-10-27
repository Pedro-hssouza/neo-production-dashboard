-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Venda" (
    "id" SERIAL NOT NULL,
    "itemNeoId" BIGINT NOT NULL,
    "numeroPedido" TEXT,
    "estruturaUsuarioId" BIGINT,
    "nomeUsuarioOriginal" TEXT,
    "vendedorCorrigido" TEXT,
    "equipeId" BIGINT,
    "nomeEquipe" TEXT,
    "produtoId" BIGINT,
    "nomeProduto" TEXT,
    "categoriaProduto" TEXT,
    "quantidade" INTEGER NOT NULL DEFAULT 0,
    "valorUnitario" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "nomeEtapa" TEXT,
    "nomeEtapaItem" TEXT,
    "tipoNegociacao" TEXT,
    "nomeCliente" TEXT,
    "estado" TEXT,
    "dataReferencia" TIMESTAMP(3),
    "dataHoraAtualizacao" TIMESTAMP(3),
    "dadosOriginais" JSONB NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Venda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Meta" (
    "id" SERIAL NOT NULL,
    "estruturaUsuarioId" BIGINT,
    "nomeVendedor" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "metaValor" DECIMAL(14,2),
    "metaQuantidade" INTEGER,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Meta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoricoMeta" (
    "id" SERIAL NOT NULL,
    "metaId" INTEGER NOT NULL,
    "nomeVendedor" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "metaValor" DECIMAL(14,2),
    "metaQuantidade" INTEGER,
    "alteradoPor" TEXT NOT NULL,
    "alteradoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HistoricoMeta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sincronizacao" (
    "id" SERIAL NOT NULL,
    "inicioConsultaDateTime" TIMESTAMP(3) NOT NULL,
    "fimConsulta" TIMESTAMP(3) NOT NULL,
    "iniciadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizadaEm" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "recebidos" INTEGER NOT NULL DEFAULT 0,
    "gravados" INTEGER NOT NULL DEFAULT 0,
    "mensagemErro" TEXT,

    CONSTRAINT "Sincronizacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorrecaoVendedor" (
    "id" SERIAL NOT NULL,
    "itemNeoId" BIGINT NOT NULL,
    "vendedorOriginal" TEXT,
    "vendedorCorreto" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "alteradoPor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CorrecaoVendedor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Venda_itemNeoId_key" ON "Venda"("itemNeoId");

-- CreateIndex
CREATE INDEX "Venda_dataReferencia_idx" ON "Venda"("dataReferencia");

-- CreateIndex
CREATE INDEX "Venda_estruturaUsuarioId_idx" ON "Venda"("estruturaUsuarioId");

-- CreateIndex
CREATE INDEX "Venda_nomeEquipe_idx" ON "Venda"("nomeEquipe");

-- CreateIndex
CREATE INDEX "Venda_produtoId_idx" ON "Venda"("produtoId");

-- CreateIndex
CREATE INDEX "Venda_nomeEquipe_dataReferencia_idx" ON "Venda"("nomeEquipe", "dataReferencia");

-- CreateIndex
CREATE INDEX "Venda_nomeEtapa_dataReferencia_idx" ON "Venda"("nomeEtapa", "dataReferencia");

-- CreateIndex
CREATE INDEX "Venda_vendedorCorrigido_dataReferencia_idx" ON "Venda"("vendedorCorrigido", "dataReferencia");

-- CreateIndex
CREATE INDEX "Meta_ano_mes_idx" ON "Meta"("ano", "mes");

-- CreateIndex
CREATE UNIQUE INDEX "Meta_nomeVendedor_ano_mes_key" ON "Meta"("nomeVendedor", "ano", "mes");

-- CreateIndex
CREATE INDEX "HistoricoMeta_metaId_alteradoEm_idx" ON "HistoricoMeta"("metaId", "alteradoEm");

-- CreateIndex
CREATE INDEX "CorrecaoVendedor_itemNeoId_criadoEm_idx" ON "CorrecaoVendedor"("itemNeoId", "criadoEm");

-- AddForeignKey
ALTER TABLE "HistoricoMeta" ADD CONSTRAINT "HistoricoMeta_metaId_fkey" FOREIGN KEY ("metaId") REFERENCES "Meta"("id") ON DELETE CASCADE ON UPDATE CASCADE;
