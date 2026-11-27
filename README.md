# G Confeitaria

Aplicação de gestão com frontend Vue 3/Vite e API Express conectada ao PostgreSQL.

As senhas são armazenadas como hashes scrypt. O backend usa sessões persistidas no PostgreSQL; em produção, frontend e API devem compartilhar a mesma origem HTTPS. A publicação e a migração de dados ainda precisam ser realizadas e verificadas no ambiente escolhido.

Os scripts `db:init` e `user:create` são da versão anterior e esperam `password_hash`; eles ainda não são compatíveis com a tabela atual, que possui uma coluna `password`.

## Preparar publicação na Vercel com Neon

O projeto inclui uma Function para a API e regras para as rotas do frontend. A publicação precisa ser testada na Vercel após o deploy; executar os passos abaixo não copia dados do banco local.

1. Prepare **somente um banco Neon novo e vazio**. No terminal do projeto, execute:

   ```bash
   npm run db:prepare-empty
   ```

   Cole a URL de conexão completa do Neon no campo oculto. Confirme o banco e informe nome, usuário, e-mail e senha do primeiro administrador. A URL e a senha não são salvas pelo script; a senha é gravada no banco como hash scrypt. O comando recusa um esquema `public` não vazio, executa a criação em transação e não migra clientes, produtos ou outros dados locais. Ele cria as opções de tipos de usuário, sexo e orientação já usadas no banco local. Não envie a URL ou a senha para o chat, GitHub ou capturas de tela.

2. Em **Vercel → projeto → Settings → Environment Variables**, configure para **Production**:

   | Nome | Valor |
   | --- | --- |
   | `DATABASE_URL` | URL completa do banco Neon, incluindo a senha; use a conexão com pooling. |
   | `SESSION_SECRET` | Chave aleatória privada com pelo menos 32 caracteres, gerada com `node -p "require('node:crypto').randomBytes(48).toString('base64url')"` no seu computador. |
   | `FRONTEND_ORIGINS` | `https://gconfeitaria.vercel.app` |
   | `TRUST_PROXY` | `true` |
   | `NODEJS_HELPERS` | `0` |

   Mantenha `VITE_API_BASE_URL` vazia ou ausente para usar a mesma origem e não configure segredos em variáveis `VITE_`. A função exige `NODE_ENV=production` e valida TLS, origem, sessões e a migração de senhas; `NODEJS_HELPERS=0` preserva o processamento de JSON pelo Express. Defina essas variáveis como sensíveis quando essa opção estiver disponível.

3. Faça commit e push das alterações e aguarde o deploy de produção no GitHub/Vercel. Alterações nas variáveis exigem novo deploy. Confira `https://gconfeitaria.vercel.app/api/health` e, depois, entre com o administrador criado. Não compartilhe as credenciais.

As sessões e o limite de tentativas de login ficam no PostgreSQL, compartilhados pelas instâncias da Function. Sessões expiradas e registros antigos do limite são removidos durante tentativas de login. Os planos gratuitos têm limites e podem mudar; consulte as condições vigentes da Vercel e do Neon, inclusive para uso comercial, antes de armazenar dados reais.

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

4. Com as tabelas existentes, faça antes um backup privado e verificável do banco. Se ele contiver senhas em texto puro, execute `npm run db:migrate-passwords`: a migração é transacional, preserva as senhas de login e ignora hashes scrypt já existentes. Ela pode ser repetida após inserir novas senhas em texto puro; formatos de hash não suportados impedem a migração. Nunca publique o backup, que pode conter senhas antigas e dados pessoais. O servidor só inicia quando a migração está marcada e todas as senhas estão no formato esperado.

5. Inicie o backend e o frontend:

   ```bash
   npm run dev:full
   ```

   Acesse `http://127.0.0.1:5173`. O endpoint `GET /api/health` verifica a conexão com o banco. O backend fica em `http://127.0.0.1:3001`.

6. Entre com o `username` e a senha original de um usuário ativo e não excluído da tabela `users`. O login diferencia maiúsculas de minúsculas na senha, mas não no usuário. Com a senha correta, uma conta inativa recebe um aviso específico.

No dashboard, abra o menu lateral para acessar **Usuários**. A listagem inclui usuários ativos e inativos, com 15 por página e colunas redimensionáveis. Após um cadastro ou edição bem-sucedidos, a aplicação retorna à listagem com uma mensagem de confirmação exibida por 3 segundos. Nos formulários de cadastro e edição, selecione um tipo não excluído de `user_types`; se o tipo atual de um usuário tiver sido excluído, escolha outro para concluir a edição. O usuário pode alterar a própria senha, mas os demais dados da própria conta ficam apenas para visualização e não podem ser editados ou excluídos. No cadastro e na troca de senha, a confirmação deve ser exatamente igual à senha. Usuários novos são ativos por padrão. Um usuário desativado não consegue entrar, e sua sessão deixa de ser válida.

O menu **Produtos** contém as opções Cadastro, Categorias e Menus. Usuários autenticados podem listar, cadastrar, editar e excluir logicamente esses registros; novos registros são ativos por padrão. Em categorias e menus, o nome é obrigatório (até 100 caracteres em categorias e 150 em menus); a descrição é opcional, limitada a 150 caracteres em menus. O campo de descrição pode ser redimensionado verticalmente. Os formulários avisam sobre alterações não salvas.

A API `/api/menus` oferece GET (lista e item), POST, PUT e DELETE para usuários autenticados. POST aceita `name`, `description` e `is_active` (opcional, padrão `true`); PUT exige `name` e `is_active` e aceita `description`. IDs são strings e DELETE retorna `204`. Os registros usam a tabela `menus` e a coluna de status `is_active`.

A API `/api/categories` oferece as mesmas operações e regras de autenticação, usando a tabela `categories` e retornando `category` ou `categories`. O status usa a coluna `is_active`; o nome aceita até 100 caracteres e a descrição é armazenada como texto. O limite geral do corpo JSON da API é de 10 KB.

A API `/api/products` oferece GET (lista e item), POST, PUT e DELETE para usuários autenticados. POST e PUT exigem `name`, `sale_price`, `cost_price`, `is_active`, `category_id` e `menu_ids` com um ou dois IDs distintos; `code` e `description` são opcionais. Os preços são textos decimais positivos com até duas casas (vírgula ou ponto), limitados a `99999999,99`. Os vínculos são armazenados em `menu_procuct`; a exclusão do produto e dos vínculos é lógica. Categorias e menus excluídos não podem ser selecionados. Produtos antigos sem categoria ou menu permanecem na listagem, mas precisam ter esses campos preenchidos na edição.

No formulário, **Preço (Kg)** e **Preço de custo (Kg)** usam uma máscara de centavos: digitar `1234` exibe `12,34`. Os valores existentes continuam armazenados sem alteração.

O cadastro permite uma foto opcional JPEG/JPG ou PNG de até 3 MiB. A imagem pode ser visualizada pela coluna **Imagem** da listagem, substituída ou removida na edição e é salva em `file_product`, com referência em `products.id_file`; fotos substituídas ou removidas são excluídas logicamente e continuam ocupando espaço no banco. POST e PUT aceitam `photo` como data URL base64 com tipo `image/jpeg` ou `image/png`: no PUT, omitir `photo` preserva a foto e enviar `null` a remove. As respostas de produto incluem `has_photo`, e `GET /api/products/:id/photo` retorna a imagem para usuários autenticados. O limite do corpo JSON de produtos é 4.400.000 bytes; as demais rotas mantêm o limite geral de 10 KB. Uma foto antiga maior que 4.400.000 bytes não pode ser exibida na Vercel: ela não é apagada, mas deve ser substituída por outra de até 3 MiB.

Somente usuários com tipo ativo `ADMIN` podem listar e gerenciar usuários e consultar os tipos. Os demais usuários autenticados não têm acesso à listagem nem a um atalho de conta no menu. O tipo e o status são verificados novamente pela API a cada solicitação.

Na edição de outro usuário, o administrador pode selecionar **Deletar usuário** e confirmar a exclusão. A exclusão é lógica, o usuário deixa de aparecer na listagem e uma mensagem de sucesso é exibida. Não é permitido excluir a própria conta.

Nos formulários de criação e edição, alterações não salvas geram uma confirmação antes de sair. Ao recarregar ou fechar a página, o aviso é fornecido pelo navegador e pode variar conforme o dispositivo.

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

O corpo de POST é JSON com `name`, `username`, `email`, `password`, `confirm_password`, `role` e, opcionalmente, `is_active`. Para editar sem alterar a senha, o PUT aceita os três campos obrigatórios `email`, `role` e `is_active`. `role` deve ser o ID de um tipo não excluído retornado por `GET /api/user-types`. Novas senhas devem ter de 12 a 255 caracteres. As respostas de sucesso têm a forma `{ "user": { ... } }` ou `{ "users": [ ... ] }`; DELETE e PATCH de senha retornam `204` sem corpo. IDs inválidos retornam `400`, registros ausentes `404` e nome de usuário ou e-mail duplicado entre registros não excluídos `409`.

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

## API de clientes

O menu **Clientes** abre a listagem e o cadastro em duas etapas. Há suporte a múltiplos endereços, edição, exclusão lógica com confirmação e aviso de alterações não salvas. Os campos de CPF e telefone brasileiro recebem formatação durante a digitação; telefones existentes em outros formatos são preservados. Ao digitar um CEP completo, o navegador consulta o ViaCEP enviando somente o CEP na URL, sem credenciais da aplicação; cidade, estado, rua, bairro e complemento são preenchidos quando disponíveis e continuam editáveis. Número e ponto de referência devem ser informados manualmente. Em caso de erro, preencha os dados manualmente.

**Migrações pendentes:** revise [`db/migrations/clients-marketing-consent.sql`](db/migrations/clients-marketing-consent.sql) e [`db/migrations/clients-marketing-consent-withdrawal.sql`](db/migrations/clients-marketing-consent-withdrawal.sql), faça um backup privado e obtenha autorização antes de aplicá-las ao banco de destino. A primeira adiciona os campos de consentimento sem atribuir autorização aos clientes existentes; a segunda adiciona os campos para registrar retiradas. Aplique primeiro a migração de consentimento e depois a de retirada. Sem ambas, as rotas de clientes não funcionarão. Após autorização, execute cada script com `psql` conectado ao banco correto, sem colocar senhas no comando:

```powershell
psql -h localhost -U postgres -d gconfeitaria -v ON_ERROR_STOP=1 -f db\migrations\clients-marketing-consent.sql
psql -h localhost -U postgres -d gconfeitaria -v ON_ERROR_STOP=1 -f db\migrations\clients-marketing-consent-withdrawal.sql
```

O consentimento para promoções e novidades por WhatsApp ou e-mail é opcional e não bloqueia o cadastro ou a edição. Em novos cadastros, a ausência de opt-in é registrada como `false`; na edição, omitir `marketing_consent` preserva o estado atual. Enviar `false` registra a retirada com data e usuário; enviar `true` registra a autorização e limpa os dados da retirada anterior. Registros existentes com valor nulo permanecem como autorização desconhecida até uma escolha explícita. A marcação não comprova, por si só, a autorização nem garante conformidade com a LGPD.

Os endpoints de clientes abaixo exigem sessão autenticada e papel `ADMIN`; somente administradores podem consultar, cadastrar, editar ou excluir clientes. A interface também oculta e bloqueia as telas de clientes para outros papéis, mas a autorização efetiva é aplicada pela API. Os dados incluem orientação sexual, quando informada; proteja o acesso antes de usar dados reais. As respostas de clientes não devem ser armazenadas em cache. Clientes e endereços excluídos logicamente não aparecem nas consultas. As opções de sexo e orientação sexual continuam disponíveis a todos os usuários autenticados.

| Método | Rota | Descrição |
| --- | --- | --- |
| POST | `/api/clients` | Cria o cliente e seus endereços; retorna `201` com `{ "client": ... }`. |
| GET | `/api/clients` | Lista clientes com seus endereços em `{ "clients": [...] }`. |
| GET | `/api/clients/:id` | Retorna `{ "client": ... }` ou `404`. |
| PUT | `/api/clients/:id` | Atualiza parcialmente os campos informados; retorna o cadastro atualizado. |
| DELETE | `/api/clients/:id` | Exclui logicamente o cliente e seus endereços; retorna `204`. |
| GET | `/api/sex` | Lista as opções existentes em `{ "options": [{ "id": "1", "name": "..." }] }`. |
| GET | `/api/sexual-orientations` | Lista as opções de orientação sexual no mesmo formato. |

No POST são obrigatórios `name`, `birth_date` (`AAAA-MM-DD`), `sex_id`, `telefone` e uma lista `addresses` não vazia. `marketing_consent` é opcional, deve ser booleano e assume `false` quando omitido. No PUT, o campo também é opcional: se omitido, o estado atual é preservado; `false` registra a retirada e `true` registra a autorização. É possível atualizar somente o consentimento. Os campos opcionais são `social_name`, `sexual_orientation_id`, `cpf` e `email`. Cada endereço exige `cep`, `city`, `state` (sigla de estado brasileiro), `street`, `neighborhood` e `number`; `complement` e `reference_point` são opcionais. IDs são strings. Sexo e orientação, quando informados, devem existir nas tabelas correspondentes.

CEP aceita oito dígitos com ou sem hífen; CPF aceita onze dígitos com ou sem pontuação e é único entre clientes não excluídos. Ambos são salvos somente com dígitos; o CPF é validado apenas quanto ao formato, não aos dígitos verificadores.

No PUT, campos omitidos são preservados e campos opcionais podem ser limpos com `null`. Se `addresses` for omitido, os endereços não mudam. Se for enviado, deve conter a lista completa não vazia: inclua `id` e todos os campos obrigatórios nos endereços existentes; os itens sem `id` serão criados e os endereços existentes omitidos serão excluídos logicamente. Cliente e endereços são atualizados na mesma transação. Dados inválidos retornam `400`, CPF duplicado retorna `409` e ausência de sessão retorna `401`.

Exemplo de POST, com IDs substituídos pelos valores disponíveis:

```json
{
  "name": "Pessoa Teste",
  "birth_date": "1990-01-02",
  "sex_id": "1",
  "telefone": "11999999999",
  "marketing_consent": true,
  "addresses": [
    {
      "cep": "12345-678",
      "city": "Cidade",
      "state": "SP",
      "street": "Rua Exemplo",
      "neighborhood": "Centro",
      "number": "10"
    }
  ]
}
```

## Testes e build

```bash
npm test
npm run build
```

## Publicação

O GitHub Pages hospeda somente arquivos estáticos e não executa a API. Para usar o sistema completo, uma opção é hospedar frontend e API juntos como um **Web Service Free do Render** e usar **Neon Free** para PostgreSQL. O endereço será o fornecido pelo Render, não o do GitHub Pages.

Os planos gratuitos têm limites, podem mudar e não garantem disponibilidade ou gratuidade eterna. No Render, sem forma de pagamento, o serviço pode ser suspenso ao atingir limites; ele também adormece após inatividade. O próprio Render recomenda não usar instâncias Free para aplicações de produção. O PostgreSQL Free do Render expira após 30 dias, portanto não o use para esta migração. Consulte [limites do Render](https://render.com/docs/free) e [preços do Neon](https://neon.com/pricing) antes de criar contas ou selecionar serviços; não adicione cartão nem escolha planos pagos.

Para preparar a implantação:

1. Faça commit e push das alterações revisadas para o repositório. Crie um banco Neon Free e mantenha sua URL privada. Migre para ele a estrutura e os dados atuais a partir de um backup privado **posterior à migração de senhas**, incluindo a tabela `gconfeitaria_migrations`. Restaure primeiro em um banco isolado e confira os usuários, tipos, hashes e a marca da migração; não sobrescreva dados existentes. O backup anterior à migração contém senhas em texto puro e não deve ser compartilhado.
2. Crie um Web Service no Render conectado ao repositório, selecionando explicitamente **Free**, com Node.js 22, comando de build `npm ci && npm run build` e comando de início `npm run start:api`.
3. Configure no Render as variáveis privadas `DATABASE_URL` (URL PostgreSQL Neon), `SESSION_SECRET` (chave aleatória de pelo menos 32 caracteres), `NODE_ENV=production`, `TRUST_PROXY=true` e `FRONTEND_ORIGINS=https://<nome-do-servico>.onrender.com`, sem barra final. Use a URL HTTPS exata atribuída ao serviço. Não defina `VITE_API_BASE_URL` nem `VITE_BASE_PATH` nessa implantação: a API e o frontend usam a mesma origem e o build usa `/`.
4. Após o deploy, confira `GET /api/health`, entre com uma conta ativa, teste os acessos de administrador e usuário comum e confirme que dados e sessão funcionam. Faça backups periódicos privados e teste sua restauração. Não considere o serviço publicado ou os dados migrados antes dessas verificações.

Gere `SESSION_SECRET` com `node -p "require('node:crypto').randomBytes(48).toString('base64url')"` e informe o valor apenas na configuração privada do servidor. Nunca coloque credenciais no repositório, no frontend ou em variáveis `VITE_*`. Em produção o servidor exige TLS para o PostgreSQL, cookies seguros e uma origem HTTPS autorizada.
