# Papo - chat, call e tela em HD

## 1) Servidor (Render, Web Service, Node)
Build: `npm install --omit=dev` | Start: `npm start`. Teste em `https://SEU-APP.onrender.com/health`.

Variáveis de ambiente:
- `DATABASE_URL` - banco PostgreSQL usado para persistir contas, perfis, mensagens e sessões. Sem isso, o servidor usa `DATA_FILE` ou `data.json`; o disco efêmero do Render pode apagar esses dados em um redeploy. Em produção, configure um PostgreSQL gerenciado antes de depender de contas e histórico.
- `INVITE_CODE` - código que os amigos precisam digitar para criar conta (evita estranhos).
- `GITHUB_REPO` - `seu-usuario/seu-repositorio` se você publicar uma cópia do app em outro repositório. Neste projeto, a consulta ao GitHub Releases já usa `cortesdojean3-collab/meu-app-discords` por padrão.
- `TURN_URLS` - lista separada por vírgulas de endereços `turn:`/`turns:` de um servidor TURN administrado por você (opcional).
- `TURN_SECRET` - segredo compartilhado com o serviço coturn em modo `--use-auth-secret`; mantenha-o apenas nas variáveis privadas do servidor.

**No Render, configure também:** Settings > Health Check Path = `/health` (o Render usa esta rota para verificar se a instância está saudável durante o deploy).
Plano Free: o serviço suspende após 15 minutos sem tráfego de entrada, incluindo mensagens WebSocket, e leva cerca de um minuto para voltar quando recebe uma nova requisição. Esse tempo fora do ar é uma limitação da hospedagem. Um health check não corrige isso; o plano pago não suspende por inatividade.

**Sessões:** o login agora usa cookie `HttpOnly` + `Secure` + `SameSite=Lax` validado no servidor ("Manter conectado" = 30 dias; sem marcar = 12 h). Na primeira atualização, quem já tinha conta precisa entrar de novo uma vez (as contas e mensagens são mantidas).

**Persistência e migração:** confira `https://SEU-APP.onrender.com/health`. Em produção, `persistente` deve ser `true` e `banco` deve ser `postgres`. Se estiver `false`, contas, sessões e mensagens estão no arquivo local e podem sumir quando o Render substituir o disco. Configure um PostgreSQL gerenciado no Render e vincule a variável privada `DATABASE_URL` do serviço web à URL interna do banco. Faça backup/exportação antes de trocar a configuração. Na primeira inicialização com um banco vazio, o servidor migra em uma transação os dados encontrados na tabela legada `kv` ou no arquivo `DATA_FILE`/`data.json`; os dados de origem não são removidos. A migração SQL versionada está em `migrations/001_persistent_data.sql`. Se já houver dados no PostgreSQL novo, o importador não os sobrescreve. A página de download também está disponível em `/downloads`; só habilita instaladores com arquivo existente em um GitHub Release publicado.

As gravações de conta, sessão, perfil e mensagem aguardam o commit no PostgreSQL antes de confirmar ao cliente. O servidor mantém um cache em memória para o WebSocket, portanto execute uma instância do serviço; escalar horizontalmente exige também um mecanismo compartilhado de presença/pub-sub, ainda não implementado. Sem `DATABASE_URL`, o modo de arquivo serve para desenvolvimento e testes locais, não como persistência garantida em deploy.

## 2) Gerar os instaladores (sem instalar nada)
1. Suba esta pasta inteira (com `.github`) para um repositório **público** no GitHub.
2. Edite `config.json` e coloque o endereço do seu Render em `serverUrl`.
3. No GitHub: aba **Actions** > "Gerar executaveis" > **Run workflow**. O workflow compila em Windows, macOS e Linux, anexa apenas os artefatos gerados e publica checksums SHA-256.
4. Uma execução manual publica um release de build com versão e número da execução. Para uma versão numerada, publique uma tag `v*` (por exemplo `v1.1.0`).
5. A página `/downloads` consulta os metadados do GitHub Releases e exibe sistema, tamanho, data, versão e notas. Plataformas sem um artefato válido permanecem indisponíveis. O Render não armazena cópias dos instaladores.

**PWA e aplicativos nativos:** o botão de PWA abre o site instalável no navegador e não baixa um APK. Windows, macOS e Linux só aparecem como downloads quando seus instaladores estão no release; não há APK Android nem publicação na App Store/Play Store configurados neste projeto.

## 3) Chamadas e compartilhamento de tela

O navegador captura a tela e o app negocia voz/vídeo ponto a ponto por WebRTC. O servidor encaminha apenas mensagens de signaling entre pessoas na mesma sala. Sem TURN configurado, a chamada depende do STUN público e pode falhar em redes com NAT/firewall restritivo; o Papo não hospeda um relay de mídia.

Para usar coturn, configure o mesmo segredo em `TURN_SECRET` no serviço web e no coturn com `--use-auth-secret` (mais `--realm` e as portas de relay liberadas). `TURN_URLS` recebe apenas os endereços. O endpoint `/ice` só entrega credenciais a uma sessão autenticada, com expiração de uma hora; a chave permanente nunca vai ao navegador. Se essas variáveis não existirem, o app usa STUN e não finge que TURN está ativo.

No teste manual, entre com duas contas em dispositivos ou perfis diferentes, abra a mesma sala de voz e compartilhe a tela de um lado. Confirme que o outro lado vê o vídeo, que “Parar tela” encerra o fluxo e que sair da sala libera câmera/microfone. Repita cancelando o seletor e, idealmente, em redes diferentes. O teste automatizado do servidor não substitui esse teste de mídia real.

No desktop Electron, o seletor solicita ao Electron todas as fontes `screen` e `window`, atualiza a lista periodicamente, exibe miniaturas e confirma novamente a fonte antes de autorizar o vídeo. Sistemas Linux com PipeWire e janelas minimizadas/protegidas podem limitar o que aparece. O Windows deve ser testado com o instalador real: tente compartilhar um monitor, uma janela com conteúdo em movimento, cancelar, fechar a janela escolhida e iniciar/parar novamente; com duas contas, confirme também que a outra pessoa recebe o vídeo. Este ambiente não fornece uma sessão gráfica Electron nem um segundo participante para validar esses cenários.

Na primeira abertura da sessão, a Kombi atravessa a tela com pontos de luz, pessoas e balões de conversa antes do login. O som original sintetizado está incluído em `public/papo-motor.wav`; a reprodução automática pode ser bloqueada pelo navegador, caso em que o botão permite habilitá-la. “Pular animação”, as preferências em **Configurações > Aparência** e a opção de reduzir movimento controlam a abertura.

## 4) Atualizações

O site consulta `/api/version` a cada cinco minutos e avisa quando o build servido muda; a pessoa escolhe quando recarregar. Não é uma instalação silenciosa de software nativo.

O desktop usa `electron-updater`: consulta GitHub Releases, baixa a atualização em segundo plano, valida o SHA-512 publicado no manifesto e oferece instalar/reiniciar. O workflow agora gera e publica os manifestos de atualização junto com os instaladores. O token de CI não é incorporado ao app. Uma instalação desktop antiga precisa ser reinstalada uma vez com o novo instalador para receber o mecanismo.

**Assinatura pendente:** este repositório ainda não tem certificados de assinatura. O atualizador informa erros e não declara uma atualização como instalada; o electron-updater exige que a aplicação macOS seja assinada. Para habilitar assinatura/notarização no CI, configure os segredos `APPLE_CERTIFICATE_P12` e `APPLE_CERTIFICATE_PASSWORD`; a notarização também usa `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` e `APPLE_TEAM_ID`. A assinatura Windows não está configurada. Os checksums e SHA-512 dos manifestos detectam corrupção, mas não substituem a assinatura do editor. Sem os certificados, o build macOS pode ser distribuído para teste manual, mas não oferece atualização automática confiável.

O workflow `Gerar executaveis` publica um release de build ao ser iniciado manualmente, com número de versão crescente, ou quando uma tag SemVer `v*` é enviada. Para publicar uma versão numerada, use uma tag como `v1.1.0`. Revise e execute o workflow só depois de aprovar/mesclar as alterações.

## 5) Limites atuais

O backend atual possui canais públicos e chamadas em salas, mas ainda não tem modelo de amizade, pedidos de amizade ou conversas privadas. Não há senha por e-mail, envio de arquivos ou bloqueio persistido. Essas funções precisam de alterações no modelo de dados, autorização, APIs e interface antes de aparecerem como controles funcionais.

## Avisos
- Windows (SmartScreen) e macOS (clique direito > Abrir) mostram aviso porque o app não é assinado.
- Não funciona em GitHub Pages, Netlify ou Vercel (precisam de servidor Node com WebSocket).
- Sem acesso ao app de desktop? O botão **Instalar app** do site instala pelo Chrome/Edge.

