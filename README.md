# NEO Dashboard

Painel de produção comercial desenvolvido com **Next.js, TypeScript, PostgreSQL e Prisma**. O projeto integra itens de uma API NEO, consolida indicadores de vendas e permite acompanhar metas e corrigir a atribuição de vendedores com histórico de alterações.

## Funcionalidades

- Dashboard com faturamento, quantidade, ticket médio, metas, projeção e filtros por período, equipe, vendedor, produto e etapa.
- Gráficos por dia, rankings e visualização detalhada de cada item, com exportação diária em CSV.
- Sincronização incremental da API NEO por ID do item, com validação por Zod, controle de concorrência no PostgreSQL e registro das execuções.
- Cadastro de metas e correção de vendedores com histórico de auditoria.

## Tecnologias e fluxo

`API NEO → validação e normalização → PostgreSQL/Prisma → rotas Next.js → dashboard React`

| Camada | Tecnologias |
| --- | --- |
| Interface | Next.js 16, React 19, Recharts, Lucide |
| API | Next.js Route Handlers, Zod |
| Dados | PostgreSQL, Prisma ORM |
| Linguagem | TypeScript |

O [esquema do banco](prisma/schema.prisma) contém vendas, metas, histórico de metas, correções de vendedor e sincronizações. As rotas principais estão em [`src/app/api`](src/app/api).

## Regra de faturamento

O campo `valor` da API NEO já representa o valor total do item. Ele é armazenado no campo legado `valorUnitario`, mas **não é multiplicado pela quantidade**. Apenas itens nas etapas **CONCLUÍDO (NEOCRM)** e **Logistica concluída (NEOCRM)** entram no faturamento. As outras etapas continuam disponíveis para consulta e contagem de quantidade. O ticket médio divide o faturamento pelos pedidos distintos nas etapas incluídas.

## Executar localmente

Requer Node.js 20 ou superior, npm, PostgreSQL e credenciais válidas da API NEO para sincronizar dados reais.

1. Copie [`.env.example`](.env.example) para `.env` e configure o banco, o endpoint NEO e as credenciais. O arquivo `.env` fica fora do Git.
2. Instale as dependências e aplique a migração existente:

   ```bash
   npm ci
   npm run db:generate
   npm run db:deploy
   npm run dev
   ```

3. Abra `http://localhost:3000`. Sem credenciais NEO, a aplicação inicia com o banco vazio. Para sincronizar, envie `POST /api/sync/neo` com `Authorization: Bearer <SYNC_SECRET>`.

As telas de metas e vendedores solicitam `DASHBOARD_WRITE_SECRET` ao gravar. A integração e o banco não estão incluídos neste repositório.

## Validar

```bash
npm run lint
npx tsc --noEmit
npm run build
```

## Limites de uso

Este repositório apresenta a implementação. As rotas de leitura não têm autenticação individual, e as gravações usam segredos de serviço. Para operar com dados reais em um ambiente público, é necessário adicionar controle de acesso por usuário e revisar a proteção dos dados pessoais. O projeto não publica credenciais nem dados de clientes.

Uma rotina opcional para sincronização pelo Agendador de Tarefas do Windows está em [`scripts`](scripts). A recarga do mês anterior substitui dados do banco e exige backup e confirmação explícita antes da execução.
