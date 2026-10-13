# Papo - chat, call e tela em HD

## Evento de três anos

Veja [Nosso Pequeno Infinito](docs/evento-tres-anos.md) para as datas, o painel de administração, as 30 cartas, o jardim, as surpresas e a persistência do evento.

## 1) Servidor (Render, Web Service, Node)
Build: `npm install --omit=dev` | Start: `npm start`. Teste em `https://SEU-APP.onrender.com/health`.

Variáveis de ambiente:
- `DATABASE_URL` - conexão privada do PostgreSQL que persiste contas, perfis, mensagens e sessões. É obrigatória quando `RENDER=true` ou `NODE_ENV=production`. Sem ela, o servidor recusa iniciar em produção com `PERSISTENCE_REQUIRED`, para não aceitar contas em um disco efêmero. Em desenvolvimento/testes, `DATA_FILE` ou `data.json` continuam disponíveis.
- `LEGACY_DATA_FILE` - caminho absoluto de uma cópia privada do backup JSON antigo, quando for preciso importar. Não coloque este arquivo nem a conexão do banco no GitHub. O importador privado abaixo permite recuperar os dados também em um banco que já contém registros.
- `INVITE_CODE` - código que os amigos precisam digitar para criar conta (evita estranhos).
- `GITHUB_REPO` - `seu-usuario/seu-repositorio` se você publicar uma cópia do app em outro repositório. Neste projeto, a consulta ao GitHub Releases já usa `cortesdojean3-collab/meu-app-discords` por padrão.
- `TURN_URLS` - lista separada por vírgulas de endereços `turn:`/`turns:` de um servidor TURN administrado por você (opcional).
- `TURN_SECRET` - segredo compartilhado com o serviço coturn em modo `--use-auth-secret`; mantenha-o apenas nas variáveis privadas do servidor.

**No Render, configure também:** Settings > Health Check Path = `/health`. Mantenha **uma instância** do serviço. O disco do serviço web é efêmero por padrão e perde os arquivos gravados pelo app em um novo deploy. [Documentação oficial de deploys](https://render.com/docs/deploys).

O serviço Free pode suspender após 15 minutos sem tráfego e não oferece Shell/SSH ou disco persistente. Além disso, um PostgreSQL Free do Render expira após 30 dias: ele não resolve armazenamento de contas por tempo indeterminado. Escolha um banco com retenção duradoura e mantenha backups; contratação/alteração de plano deve ser decidida pelo proprietário. [Limites oficiais do Free](https://render.com/docs/free).

**Sessões:** cookie `HttpOnly`, `SameSite=Lax` e `Secure` em HTTPS. “Manter conectado” salva um cookie persistente por 30 dias; sem marcar, o cookie é de sessão do navegador e o limite do servidor é 12 horas. A renovação espera a gravação antes de renovar o cookie. O token aleatório tem 256 bits e somente seu SHA-256 fica no banco. Em PostgreSQL, cada consulta de sessão valida o registro no banco; logout apaga diretamente o token e “Sair dos outros dispositivos” revoga por usuário, inclusive sessões que outro processo criou durante um deploy. A versão da HUD e o identificador do build não alteram contas nem invalidam os cookies.

**Antes de atualizar um serviço que ainda usa arquivo:** confira `/health`. Se `banco=arquivo` e `persistente=false`, não faça um novo deploy, reinício ou mudança de configuração antes de preservar `DATA_FILE`/`data.json` fora daquele servidor. Não existe endpoint público de exportação de contas. Em um serviço que já dispõe de Shell/SSH, copie o arquivo privado para um backup fora da instância e valide o JSON e a quantidade de usuários. Um serviço Free não permite esse acesso: interrompa a migração até obter uma cópia existente ou uma forma de extração acordada com o provedor. Não trate uma atualização de plano ou um redeploy como uma maneira segura de extrair o arquivo. Se a única cópia já desapareceu, o código não consegue recuperá-la.

**Configurar o PostgreSQL no Render:** crie/selecione um banco com retenção duradoura na mesma região do serviço. No banco, abra **Connect** e copie a **Internal Database URL**. No serviço web, abra **Environment** e configure a variável privada `DATABASE_URL`. Faça isso somente após preservar o arquivo antigo: salvar as variáveis pode iniciar um deploy. Para uma importação realizada de outro computador, use a URL externa do banco e suas regras de acesso; nunca publique essa URL. [Conexões oficiais do Render Postgres](https://render.com/docs/postgresql-creating-connecting).

**Importar o backup sem sobrescrever contas:** em um computador privado com Node e as dependências do projeto, configure `DATABASE_URL` em ambiente privado e `LEGACY_DATA_FILE` com o caminho da cópia. Execute:

```sh
node migrations/import-legacy.js
```

O comando mostra apenas contagens; não imprime senhas, hashes, cookies ou a conexão. Todas as tabelas e importações são feitas em uma transação. Se um login já existir com outro UID, a importação falha e faz rollback, em vez de substituir a identidade. UIDs, salts/hashes, perfis, mensagens e sessões antigas são preservados. A origem nunca é apagada. A migração SQL usa `CREATE TABLE IF NOT EXISTS` e não limpa tabelas no deploy; a importação normal tem um marcador de versão e não roda novamente após uma exclusão de conta. O CLI permite uma importação adicional deliberada, inclusive em banco não vazio. Remova `LEGACY_DATA_FILE` do ambiente depois de concluir e guarde o backup em local protegido.

Depois, confirme `/health` com `banco=postgres`, `persistente=true` e a quantidade esperada de usuários, teste login com uma conta antiga, reinicie o serviço e teste novamente. Preserve o domínio do site e o diretório de dados do desktop para manter os cookies. A migração do armazenamento não confirma por si só que o Render foi configurado nem que as contas antigas estavam presentes no arquivo de origem.

**Senhas:** novos cadastros usam scrypt com salt aleatório de 16 bytes e parâmetros versionados `N=65536`, `r=8`, `p=2`. Essa combinação é uma das alternativas recomendadas pela [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) e funciona no `crypto` nativo do Node sem módulo externo. Hashes scrypt antigos são aceitos e recebem a proteção nova no próximo login válido; ninguém precisa trocar de senha por causa da atualização. Senhas em texto puro não são armazenadas nem enviadas ao frontend.

As gravações aguardam commit antes da confirmação ao cliente. O cache agora grava somente alterações em relação à última gravação confirmada: um processo antigo não apaga contas, mensagens ou sessões desconhecidas que o novo processo criou durante a troca de versão. Renovar uma sessão ou atualizar um hash em cache não pode recriar um registro já revogado/excluído no banco. O cache de presença/WebSocket ainda exige uma instância; múltiplas instâncias permanentes precisam de pub/sub compartilhado.

**Verificação local:** `npm install` instala também `@electric-sql/pglite` como dependência de desenvolvimento. Depois, `npm test` testa cadastro, hash legado, login, cookies, expiração, revogação, logout e reinício em arquivos temporários. A parte de PostgreSQL de `storage.test.js` usa PostgreSQL real em WebAssembly; se o módulo estiver em outra pasta, configure `PAPO_TEST_PGLITE_MODULE` com seu caminho. Sem dependências de desenvolvimento, esse teste é marcado como ignorado. Ela verifica SQL/transações, migração, conflitos, caches de deploy e revogação; não substitui o teste com a conexão/TLS e o deploy reais do Render.

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

Na primeira abertura da sessão, a Kombi branca e roxa atravessa uma estrada iluminada numa tela de loading dedicada. Login ou conversa aparecem depois da travessia e da verificação real da sessão. O som original sintetizado está incluído em `public/papo-motor.wav`; a reprodução automática pode ser bloqueada pelo navegador, caso em que o botão permite habilitá-la. “Pular abertura”, as preferências em **Configurações > Aparência** e a opção de reduzir movimento controlam a abertura.

O relatório de qualidade, controles de transmissão, personalização, easter eggs, testes e preparação da migração está em [docs/quality-update.md](docs/quality-update.md).

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

