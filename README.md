# Meu Ponto

Sistema de **registro e fechamento de ponto**: batidas, cálculo de saldo de horas,
tratamento de feriados e controle de plantões — com backend próprio, banco
PostgreSQL e front-end em React.

> Em produção no Proxmox, orquestrado via Docker/Portainer.

## Como rodar

**Tudo em containers (recomendado):**

```bash
cp .env.example .env
docker compose up -d --build
```

Sobe três serviços: `meuponto-db` (PostgreSQL 16), `meuponto-backend` e
`meuponto-frontend`. As portas saem do `.env`.

**Desenvolvimento local (backend + frontend juntos):**

```bash
npm run install:all
npm run dev
```

O `npm run dev` usa `concurrently` para levantar os dois de uma vez. O backend
ainda precisa de um PostgreSQL acessível na `DATABASE_URL`.

## Variáveis de ambiente

Copie `.env.example` para `.env` e preencha. **Nunca commite o `.env`** — em
produção, defina esses valores direto na Stack do Portainer.

### Raiz — `.env` (consumido pelo `docker-compose.yml`)

| Variável | Descrição |
|---|---|
| `DB_USER` | Usuário do PostgreSQL |
| `DB_PASSWORD` | **Senha do banco** |
| `DB_NAME` | Nome do banco (padrão `meuponto`) |
| `BACKEND_PORT` | Porta exposta pelo backend |
| `FRONTEND_PORT` | Porta exposta pelo front |
| `DEFAULT_PASSWORD` | **Senha inicial** do usuário criado no primeiro boot |

### `backend/.env` (execução fora do compose)

`PORT`, `DATABASE_URL` e `DEFAULT_PASSWORD`.

## API

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/records/punch` | Registra uma batida |
| `POST` | `/records/undo` | Desfaz a última batida |
| `GET` | `/records` | Lista os registros do período |
| `PUT` | `/records/:id` | Edita um registro (marca como `EDITED`) |
| `DELETE` | `/records/:id` | Remove um registro |
| `GET` | `/records/balance` | **Saldo de horas** do período |
| `POST` | `/records/recalculate` | Recalcula os saldos |
| `GET` · `POST` | `/records-events` | Lista e cria eventos de plantão |
| `PUT` · `DELETE` | `/records-events/:id` | Edita e remove um evento |
| `GET` | `/holidays/:year` | Feriados do ano |
| `GET` | `/holidays/:year/details` | Feriados com detalhes |
| `GET` · `PUT` | `/settings` | Lê e grava as configurações de jornada |

A API publica um `swagger.json` em `backend/src/` para consulta do contrato completo.

## Banco de dados

**PostgreSQL 16** em container, com os dados no volume nomeado `meuponto_pgdata`
— fora da pasta do projeto e, portanto, fora do Git.

Modelos (Prisma): `User`, `Settings`, `TimeRecord` (com status `OPEN`/`CLOSED`/`EDITED`)
e `PlantaoEvent`.

O `start` do backend roda `prisma db push`, que cria as tabelas a partir do
`schema.prisma` no primeiro boot — um servidor novo sobe com o schema pronto e o
banco vazio.

> **Atenção para produção:** `db push` sincroniza o schema por comparação, sem
> histórico de migrations, e pode ser destrutivo quando há divergência. O caminho
> seguro é gerar a baseline de migrations e trocar o start para `prisma migrate deploy`.

### Backup e restauração

Os dados **nunca** vão pelo Git — são dumps:

```bash
docker exec meuponto-db pg_dump -U postgres -d meuponto > meuponto-backup.sql
```

```bash
docker exec -i meuponto-db psql -U postgres -d meuponto < meuponto-backup.sql
```

O dump contém **dados reais de funcionários**. O `.gitignore` bloqueia
`backup*.sql`, `*-backup.sql` e `*.dump` — sem afetar as migrations do Prisma,
que também são `.sql` e precisam ser versionadas.

## Stack

**Backend:** Node.js · TypeScript · Express · Prisma 7 · PostgreSQL 16
**Frontend:** React · TypeScript · Vite · Tailwind · shadcn/ui
**Infra:** Docker Compose · Portainer (Proxmox)

## Estrutura

```
backend/
  src/
    app.ts · server.ts     # bootstrap do Express
    routes.ts              # todas as rotas
    controllers/           # handlers por recurso
    services/              # regras de negócio
    recalculate.ts         # recálculo de saldo de horas
    swagger.json           # contrato da API
  prisma/
    schema.prisma          # 4 models
    migrations/            # versionadas (SIM, vão para o Git)
frontend/
  src/
    pages/                 # Dashboard, LockScreen
    components/ · lib/
docker-compose.yml         # db + backend + frontend
```

## Deploy (Portainer)

**Pré-requisito, uma vez por servidor:** a rede compartilhada precisa existir
antes de qualquer stack, senão o deploy falha com
`network proxy declared as external, but could not be found`.

```bash
docker network create proxy
```

(A stack `infra-proxy` cria essa rede junto com o Traefik. Se você já subiu ela,
não precisa do comando acima.)

Depois, no Portainer: **Stacks → Add stack → Repository**, apontando para este
repositório. Preencha as variáveis marcadas como OBRIGATÓRIAS no `.env.example`
em **Environment variables** — elas não têm valor padrão, e sem elas o serviço
que as usa não sobe.

## Segurança

- `DB_PASSWORD` e `DEFAULT_PASSWORD` só existem no `.env` local e na Stack do
  Portainer — nunca no repositório.
- `sshpass.bat` está no `.gitignore` (pode conter credencial de acesso ao servidor).
- Dumps do banco são dados de funcionários: tratar como confidencial.

Regras completas em [CLAUDE.md](CLAUDE.md).

## Próximos passos

- Trocar `db push` por `migrate deploy` antes do próximo deploy de produção
- Primeiro acesso solicitar a criação do admin, eliminando o `DEFAULT_PASSWORD`
- Rotina de backup automatizada do `meuponto_pgdata`
