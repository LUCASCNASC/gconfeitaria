# G Confeitaria

Aplicação de gestão com frontend Vue 3/Vite e API Express conectada ao PostgreSQL.

**Somente para testes locais:** as senhas são gravadas em texto puro e o login compara a senha com esse texto. A API de usuários e a autenticação só respondem a requisições locais e são desativadas quando `NODE_ENV=production`. Não use senhas reais ou dados sensíveis.

Os scripts `db:init` e `user:create` são da versão anterior e esperam `password_hash`; eles ainda não são compatíveis com a tabela atual, que possui uma coluna `password`.

## Executar localmente

Requisitos: Node.js 22, npm e PostgreSQL em execução.

1. Copie `.env.example` para `.env` se ainda não existir. Gere uma chave com `node -p "require('node:crypto').randomBytes(48).toString('base64url')"` e coloque o resultado em `SESSION_SECRET`. Nunca envie esses valores ao Git.
2. Instale as dependências:

   ```bash
   npm ci
   ```

3. Configure e valide a senha local do usuário PostgreSQL sem digitá-la no código ou no chat:

   ```bash
   npm run db:password
   ```

   O comando solicita a senha sem exibi-la e só a grava no `.env` depois de testar a conexão.

4. Com a tabela `users` existente no banco, inicie o backend e o frontend:

   ```bash
   npm run dev:full
   ```

   Acesse `http://127.0.0.1:5173`. O endpoint `GET /api/health` verifica a conexão com o banco. O backend fica em `http://127.0.0.1:3001`.

5. Entre com o `username` e a senha em texto puro de um usuário ativo e não excluído da tabela `users`. O login diferencia maiúsculas de minúsculas na senha, mas não no usuário. Com a senha correta, uma conta inativa recebe um aviso específico. Use apenas credenciais de teste.

No dashboard, abra o menu lateral para acessar **Cadastrar usuário**. A listagem inclui usuários ativos e inativos, com 15 por página e colunas redimensionáveis. Após um cadastro ou edição bem-sucedidos, a aplicação retorna à listagem com uma mensagem de confirmação exibida por 3 segundos. Nos formulários de cadastro e edição, selecione um tipo não excluído de `user_types`; se o tipo atual de um usuário tiver sido excluído, escolha outro para concluir a edição. O usuário pode alterar a própria senha, mas os demais dados da própria conta ficam apenas para visualização e não podem ser editados ou excluídos. No cadastro e na troca de senha, a confirmação deve ser exatamente igual à senha. Usuários novos são ativos por padrão. Um usuário desativado não consegue entrar, e sua sessão deixa de ser válida.

Somente usuários com tipo ativo `ADMIN` podem listar e gerenciar usuários e consultar os tipos. Os demais usuários autenticados acessam **Minha conta** no menu para consultar seus dados e trocar a própria senha. O tipo e o status são verificados novamente pela API a cada solicitação.

## API local de usuários

Base: `http://127.0.0.1:3001`. Os endpoints não retornam a senha. IDs são strings para preservar inteiros grandes do PostgreSQL. Nas respostas de usuários, `role` é o nome do tipo e `role_id` é o ID armazenado em `users.user_type`; nos corpos de criação e edição, `role` recebe o ID do tipo.

Todos os endpoints de usuários e tipos exigem sessão autenticada. Apenas `ADMIN` pode listar, criar, editar ou excluir usuários e consultar tipos; outros usuários só podem consultar o próprio cadastro e alterar a própria senha. PUT, PATCH de status e DELETE não permitem alterar ou excluir a própria conta; PATCH de senha permite somente alterar a própria senha. Sem sessão, retornam `401`; acessos não permitidos retornam `403`.

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/api/user-types` | Lista os tipos não excluídos, com `id` e `name`. |
| POST | `/api/users` | Cria um usuário; `role` é obrigatório e `is_active` é opcional (padrão `true`). |
| GET | `/api/users` | Lista usuários não excluídos, inclusive inativos. |
| GET | `/api/users/:id` | Retorna um usuário não excluído. |
| PUT | `/api/users/:id` | Atualiza `email`, `role` e `is_active`; também aceita o cadastro completo anterior. A senha não é necessária na edição parcial. |
| PATCH | `/api/users/:id/status` | Atualiza somente `is_active`, com corpo `{ "is_active": true }` ou `{ "is_active": false }`. |
| PATCH | `/api/users/:id/password` | Altera somente a senha da própria conta ativa; exige `password` e `confirm_password` iguais e retorna `204`. |
| DELETE | `/api/users/:id` | Exclusão lógica: preenche `deleted_at` e desativa o usuário. |

O corpo de POST é JSON com `name`, `username`, `email`, `password`, `confirm_password`, `role` e, opcionalmente, `is_active`. Para editar sem alterar a senha, o PUT aceita os três campos obrigatórios `email`, `role` e `is_active`. `role` deve ser o ID de um tipo não excluído retornado por `GET /api/user-types`. Não envie valores reais: as senhas ficam em texto puro nesta etapa. As respostas de sucesso têm a forma `{ "user": { ... } }` ou `{ "users": [ ... ] }`; DELETE e PATCH de senha retornam `204` sem corpo. IDs inválidos retornam `400`, registros ausentes `404` e nome de usuário ou e-mail duplicado entre registros não excluídos `409`.

Exemplo de corpo para POST ou PUT:

```json
{
  "name": "Pessoa Teste",
  "username": "pessoa_teste",
  "email": "pessoa@example.test",
  "password": "senha-apenas-para-teste",
  "confirm_password": "senha-apenas-para-teste",
  "role": "2",
  "is_active": true
}
```

Substitua `"2"` pelo ID de um tipo disponível no seu banco.

O CRUD exige a estrutura da tabela já existente, incluindo os índices únicos de `username` e `email` para usuários não excluídos. O `db/schema.sql` antigo não corresponde a essa estrutura; não o utilize para recriar a tabela atual.

## Testes e build

```bash
npm test
npm run build
```

## Publicação

Para publicar o frontend em `https://lucascnasc.github.io/gconfeitaria/`, acesse **Settings → Pages → Build and deployment → Source** no repositório e selecione **GitHub Actions**. Faça commit e push para `main` e acompanhe o workflow **Publicar no GitHub Pages** na aba **Actions**. O workflow gera o site com a base `/gconfeitaria/`; não publique diretamente os arquivos da branch sem executar o build.

O GitHub Pages hospeda somente o frontend estático: ele não executa esta API nem consegue acessar um PostgreSQL instalado no computador. A API atual usa senhas em texto puro e bloqueia autenticação e CRUD fora do ambiente local, inclusive em produção. Por isso, publicar o frontend não disponibiliza o login. Antes do uso publicado, é necessário implementar autenticação segura e hospedar a API e o banco em serviços acessíveis pela internet; configure as credenciais e `SESSION_SECRET` no ambiente do servidor, nunca no Vue ou em variáveis `VITE_*`.

Configure a variável pública `VITE_API_BASE_URL` no GitHub Actions com a URL da API. No backend, configure `FRONTEND_ORIGINS` com a origem do site e use HTTPS. Cookies entre domínios diferentes podem ser bloqueados pelo navegador; para produção, prefira frontend e API em domínios do mesmo site (por exemplo, subdomínios de um domínio próprio). Use também um usuário PostgreSQL próprio para a aplicação, com permissões mínimas, em vez do superusuário `postgres`.
