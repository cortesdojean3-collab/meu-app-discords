# Nosso Pequeno Infinito — 3 Anos de Nós

## Datas confirmadas

- Início: **10/10/2026, 00:00**, em `America/Sao_Paulo`.
- Término: **10/11/2026, 00:00**, no mesmo fuso. Esse instante já está fora do evento.
- Primeiro encontro: **10/10/2023**.
- Conta administradora: **LuquinhasLD**.

## Entrar e editar

Entre no Papo e abra **Nosso Pequeno Infinito** no menu. A conta administradora também encontra **Configurar comemoração**. O painel permite alterar título, subtítulo, texto principal, mensagens das cinco flores, as 30 cartas, mensagens secretas, carta final, datas, fuso, cores, decorações e recursos individuais.

Clique em **Salvar configurações**. A gravação passa pela sessão autenticada e pelo PostgreSQL; outros usuários não podem editar, mesmo chamando a API diretamente. Duas abas não sobrescrevem silenciosamente uma à outra: uma revisão desatualizada recebe conflito e deve recarregar a configuração.

Os nomes opcionais ficam privados até marcar **Quero publicar esses nomes no evento**. A data do encontro tem sua própria opção de publicação. Desabilitar um recurso remove sua interação. Preferências pessoais de movimento reduzido e easter eggs continuam sendo respeitadas.

## Calendário e cartas

O servidor decide se o evento está futuro, ativo ou encerrado. No primeiro dia libera a carta 1, no segundo a carta 2, e assim por diante. As cartas anteriores podem ser reabertas. A resposta comum da API não contém o texto de cartas futuras; alterar o relógio do aparelho não as libera.

Há 30 cartas. Um intervalo com 31 dias mantém a última data para o encerramento, sem inventar uma carta 31. O painel exige 30 ou 31 dias de calendário. O contador usa a hora recebida do servidor e tempo monotônico para acompanhar o intervalo entre atualizações.

## Jardim e surpresas

- Clique nas cinco flores do jardim para fazê-las florescer e ler as mensagens.
- Encontre o coração escondido para receber a entrega de flores da Kombi.
- Clique três vezes no coração do evento para abrir a surpresa de pétalas.
- Escolha as três estrelas especiais para formar a constelação de corações.
- Procure a flor diferente para abrir a carta especial.

As descobertas são vinculadas à conta e persistidas. Os efeitos temporários são leves, têm prazo de remoção e não interceptam cliques na interface. A abertura continua usando o motor original; o evento não acrescenta música automática.

## Último dia e término

No último dia, o botão **E se essa história fosse só o começo?** abre voluntariamente o encerramento. Ele não abre sozinho nem termina chamadas.

Ao chegar ao término, o tema e os efeitos são removidos automaticamente. Por padrão, a experiência deixa de ficar disponível. Somente ao marcar **Permitir reabrir as lembranças após o término** o administrador autoriza o acesso posterior às lembranças, sem o tema ativo.

## Persistência e configuração do servidor

A migração `migrations/002_event.sql` cria tabelas próprias para configuração e descobertas, sem modificar ou apagar contas, sessões, perfis ou mensagens existentes. A agenda é armazenada no PostgreSQL e não recomeça em um deploy. Em desenvolvimento, o evento usa um arquivo separado junto ao `DATA_FILE`; esse arquivo não deve ser versionado.

Variáveis privadas de inicialização no Render:

```text
PAPO_EVENT_ADMIN_USER=LuquinhasLD
PAPO_EVENT_START=2026-10-10T00:00:00-03:00
PAPO_EVENT_END=2026-11-10T00:00:00-03:00
PAPO_EVENT_MEETING_DATE=2023-10-10
PAPO_EVENT_TIME_ZONE=America/Sao_Paulo
```

O nome de administração é resolvido para o UID de uma conta que já existe e essa vinculação é persistida. Não há cadastro público de administrador nem privilégio para a primeira conta criada. Para vincular diretamente uma identidade existente, use `PAPO_EVENT_ADMIN_UIDS` com UIDs separados por vírgula. Não publique credenciais do banco.

As variáveis de datas inicializam somente uma configuração ainda não configurada. Depois disso, o painel e a revisão persistida são a fonte de verdade; novos deploys não restauram os textos antigos nem alteram datas já editadas.

O PostgreSQL Free temporário escolhido para este projeto expira em **11/11/2026, 23:15, horário de Brasília**. É necessário migrar os dados ou escolher um plano duradouro antes dessa data para conservar contas e lembranças.

## Verificação

Os testes cobrem os estados do evento, limites de calendário/fuso, cartas futuras, persistência e revisão, privilégios de administração, nomes privados, migração, abertura comemorativa e regressões existentes do Papo. A revisão visual inclui desktop e celular, jardim, cartas, painel e preferências de acessibilidade. Chamadas reais entre dispositivos e desempenho em cada aparelho continuam dependendo de uma sessão prática com usuários.
