# REGRAS DE SEGURANÇA E GIT

1. NUNCA adicione (`git add`) ou faça commit de arquivos `.env`, chaves de API, tokens de acesso ou dados reais de clientes.
2. Todo segredo ou chave deve ser chamado via `process.env` e documentado no arquivo `.env.example` **sem os valores**.
3. Antes de realizar qualquer commit, valide se nenhum dado sensível ou hardcoded está sendo incluído nos arquivos modificados.
4. Nunca use `git add -f` / `--force` para incluir algo que o `.gitignore` está barrando. Se um arquivo está ignorado, é intencional.
5. Se um segredo já estiver versionado, **pare e avise** antes de qualquer push. Trate a chave como vazada: ela precisa ser rotacionada.

## Dados sensíveis específicos deste projeto

- `.env` (raiz) alimenta o `docker-compose` com `DB_PASSWORD` e `DEFAULT_PASSWORD`. Em produção, esses valores vão direto na Stack do Portainer — nunca em arquivo versionado.
- `backend/.env` tem `DATABASE_URL` e `DEFAULT_PASSWORD`.
- `sshpass.bat` pode conter credencial de acesso ao servidor — está no `.gitignore`.
