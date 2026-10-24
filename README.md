# FinanFamília — V1

Aplicação web responsiva para controle financeiro familiar, com interface premium branca e verde, autenticação Supabase, banco de dados compartilhado por família, movimentações, contas a pagar, metas e gráficos.

## O que está pronto nesta V1

- Tela de login, cadastro e recuperação de senha via Supabase Auth.
- Criação da primeira família por meio de uma função SQL do servidor.
- Dashboard com saldo registrado, receitas e despesas do mês.
- Cadastro e exclusão de receitas/despesas.
- Gráfico dos últimos seis meses e resumo por categoria.
- Cadastro de contas a pagar, marcação como paga e exclusão.
- Metas financeiras com progresso e atualização do valor guardado.
- Busca e filtro de movimentações.
- Ocultar/mostrar valores.
- Layout responsivo para celular e computador.
- Políticas RLS no Supabase para limitar dados à família associada ao perfil.

## Requisitos

- Conta no Supabase.
- Navegador atualizado.
- Para executar localmente, use VS Code com a extensão Live Server, ou um servidor estático local. Evite abrir o HTML diretamente como `file://`.

## Configuração do Supabase

1. Crie um projeto em https://supabase.com/.
2. Abra **SQL Editor → New query**.
3. Copie todo o conteúdo de `supabase.sql`, cole no editor e clique em **Run**.
4. No painel do projeto, abra **Project Settings → API** (ou a página de conexão equivalente na versão atual do painel).
5. Copie a **Project URL** e a chave pública **anon/publishable**. Nunca use `service_role` ou uma chave secreta no navegador.
6. Abra `app.js` e substitua:
   - `COLE_AQUI_A_URL_DO_PROJETO` por sua Project URL;
   - `COLE_AQUI_A_CHAVE_PUBLICA_ANON` pela chave pública anon/publishable.
7. No Supabase, abra **Authentication → URL Configuration** e cadastre o endereço local usado para testar (por exemplo, o endereço exibido pelo Live Server) como Site URL/Redirect URL, conforme necessário.
8. Se a confirmação de e-mail estiver ativada, confirme o e-mail antes de entrar. Para o fluxo mais simples de teste, você pode desativar temporariamente a confirmação de e-mail em Authentication settings; reative-a antes de disponibilizar o site publicamente.
9. Abra `index.html` com Live Server. Crie uma conta com seu nome, e-mail, senha e nome da família.
10. Entre e cadastre movimentações, contas e metas.

## Executar no VS Code

1. Extraia o ZIP para uma pasta.
2. Abra a pasta no VS Code.
3. Instale a extensão **Live Server**.
4. Clique com o botão direito em `index.html` e escolha **Open with Live Server**.
5. O site abre em um endereço local, normalmente parecido com `http://127.0.0.1:5500`.

## Segurança — importante

- A chave pública anon/publishable é feita para uso no navegador; a segurança depende das políticas RLS. Nunca coloque a chave `service_role`/secreta no `app.js`.
- Execute o SQL completo antes de testar o cadastro.
- Não publique com dados financeiros reais antes de revisar as políticas e testar com duas contas de usuário distintas.
- Nesta V1, o cadastro cria uma nova família e o primeiro usuário é seu membro inicial. O convite de outros familiares e as permissões por papel ainda não estão implementados; não compartilhe credenciais. A próxima etapa pode implementar convites seguros.
- O saldo mostrado é o total de receitas menos despesas **registradas neste sistema**, não um saldo bancário sincronizado.
- A recuperação de senha usa o e-mail cadastrado e exige configurar os URLs de redirecionamento no Supabase.
- Este projeto não conecta a bancos reais e não oferece aconselhamento financeiro.

## Estrutura

- `index.html` — telas e formulários.
- `styles.css` — identidade visual e responsividade.
- `app.js` — lógica da interface, autenticação e chamadas Supabase.
- `supabase.sql` — tabelas, função de criação de família, índices e políticas RLS.
