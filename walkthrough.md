# Walkthrough: Sistema de Controle de Ponto Pessoal

A fundação do nosso PWA de Controle de Ponto Pessoal foi construída com sucesso!

## O que foi implementado

### 1. Infraestrutura
- Criado o arquivo `docker-compose.yml` para subir o banco de dados PostgreSQL.
- Preparado a estrutura monorepo com pastas separadas para `frontend` e `backend`.

### 2. Backend (Node.js + Express + Prisma)
- **Modelagem de Dados**: Criamos o `schema.prisma` com os modelos `User`, `TimeRecord` e `Settings`. O schema já prevê a gestão do PIN local, múltiplos registros de ponto e flags de plantão.
- **Regras de Negócio**: O motor de cálculo de horas foi implementado em `balanceService.ts`, suportando a jornada de 44h (9h de Seg-Qui, 8h Sex) e lógicas especiais para faltas e plantões integrais.
- **API Restful**: Foi criada uma rota base para gerenciar os pontos (`timeRecordController.ts`) que lida com o ciclo completo do expediente (IN, LUNCH_START, LUNCH_END, OUT).
- **Documentação**: Inicializamos o arquivo `swagger.json` que está mapeado na rota `/api-docs` para facilitar integrações futuras.

### 3. Frontend (React + Vite + TailwindCSS PWA)
- **Design System iOS Dark Theme**: O `tailwind.config.js` e `index.css` foram configurados com as cores exatas do iOS Dark Mode (`#1c1c1e`, `#0a84ff`, etc.), fontes limpas e o efeito `glass` (`backdrop-blur`).
- **Tela de Bloqueio (PIN)**: Implementamos a página `LockScreen.tsx` que simula um teclado numérico estiloso. Por enquanto valida com "1234" mockado para salvar no cache local.
- **Dashboard Principal**:
  - Exibe o destaque do saldo de horas no topo.
  - Implementado o componente `BigPunchButton.tsx`: Um botão gigante animado que alterna os estados "Registrar Entrada", "Finalizar Expediente", "Voltar do Almoço" dinamicamente conforme os cliques.
  - Componente de notificações nativas `Toast.tsx` construído para exibir confirmações descendo do topo da tela.
- **Modal de Histórico**: Um bottom-sheet elegante que exibe os registros agrupados por semana e plantões, incluindo os ícones de alerta para dias que possuem descrições de motivo, e opções para deletar e editar com confirmação.
- **PWA Setup**: `vite-plugin-pwa` configurado no Vite para transformar o app instalável offline e como um ícone na tela inicial do celular.

## Como Executar e Testar

> [!IMPORTANT]
> Como você está em um ambiente Windows local, notei que o comando `docker` ou `docker-compose` pode não estar configurado no seu PATH global, o que impossibilitou subir o banco automaticamente.
>
> Para rodar o sistema, siga os passos no seu terminal:

1. **Subir o Banco de Dados:**
   Abra o terminal com Docker instalado na pasta raiz e execute:
   ```bash
   docker-compose up -d
   cd backend
   npx prisma db push
   cd ..
   ```

2. **Instalar Dependências de Ambos (se necessário):**
   Na pasta raiz do projeto, você pode instalar todas as dependências rodando:
   ```bash
   npm run install:all
   ```

3. **Rodar o Backend e o Frontend Juntos:**
   Na pasta raiz do projeto, execute:
   ```bash
   npm run dev
   ```
   > Isso iniciará tanto o backend (`http://localhost:3333` e o swagger em `/api-docs`) quanto o frontend (`http://localhost:80`) simultaneamente em um único terminal usando `concurrently`.
   >
   > Acesse o endereço do frontend exibido no terminal via navegador e **ligue o modo Mobile no DevTools (F12)** para ver a estética iOS mobile-first perfeitamente renderizada.

## Próximos Passos (Integração)
No momento as requisições do frontend estão mockadas internamente com useState para você validar o Design. Assim que aprovar o design inicial e garantir que o banco de dados rodou corretamente, poderemos integrar o `fetch` real com os endpoints criados.
