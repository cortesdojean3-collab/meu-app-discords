# Papo — relatório da atualização de qualidade

## Diagnóstico e situação da publicação

Em 12/10/2026, o `/health` do serviço `meu-app-discords.onrender.com` informou `banco: arquivo`, `persistente: false` e 2 contas. A integração do Render confirmou serviço Free, uma instância, deploy automático da `main` e nenhum PostgreSQL nesse workspace. A causa identificada é o uso de `data.json` no filesystem efêmero. Não foi feita uma migração no serviço publicado e não há evidência de recuperação de contas que já desapareceram.

O código desta atualização pode ser publicado na `main` com `[skip render]` no commit. Isso usa o mecanismo oficial de [pular um deploy automático](https://render.com/docs/deploys#skipping-an-auto-deploy) e permite entregar o código antes de resolver backup e banco. Uma publicação no GitHub não significa que essa versão já entrou no site. Um deploy manual continua dependendo da migração descrita abaixo.

## Persistência e autenticação

- Produção/Render sem `DATABASE_URL` agora falha antes de abrir o serviço; não registra novas contas em arquivo efêmero.
- PostgreSQL guarda contas, perfis, mensagens e sessões fora do filesystem do aplicativo. A versão da interface e o build não alteram essas identidades.
- As gravações são transacionais e incrementais em relação ao último estado confirmado. Um processo antigo durante a troca de versão não apaga registros desconhecidos criados pelo novo processo.
- Migração aditiva preserva o arquivo original e a tabela legada `kv`. Conflitos de login/UID fazem rollback. O importador privado aceita uma cópia adicional deliberada em banco já preenchido.
- Sessões HTTP e novos WebSockets consultam o banco. Logout/revogação usam exclusão explícita por token ou usuário, incluindo sessões criadas fora do cache atual.
- Cada ação de um WebSocket revalida a sessão; conexões ociosas também são verificadas a cada 25 segundos. Uma sessão revogada por outra instância deixa de autorizar ações.
- Cookie `HttpOnly`, `SameSite=Lax` e `Secure` em HTTPS; token aleatório de 256 bits e apenas seu SHA-256 armazenado. “Manter conectado” usa 30 dias, com renovação confirmada no armazenamento.
- Senhas usam scrypt versionado, salt de 16 bytes, `N=65536`, `r=8`, `p=2`. Hashes antigos seguem válidos e são reforçados no login. Nenhuma senha em texto puro é salva.

### Configuração externa necessária

1. Preserve uma cópia privada do `DATA_FILE`/`data.json` **antes** de reiniciar, fazer deploy ou salvar novas variáveis no Render. O serviço Free atual não dispõe de Shell/SSH. Se não houver cópia, solicite ao provedor uma forma de extração; não existe endpoint público de exportação nesta aplicação.
2. Escolha um PostgreSQL com retenção duradoura. O PostgreSQL Free do Render expira após 30 dias, portanto não resolve sozinho a exigência de retenção permanente. Não foi contratado nenhum plano pago.
3. Se usar Render Postgres, coloque o banco no mesmo workspace e na região **Oregon**, igual ao serviço atual. Guarde a conexão apenas em variáveis privadas.
4. Em ambiente privado, com Node e dependências instalados, configure `DATABASE_URL` e `LEGACY_DATA_FILE` apontando para a cópia; execute `node migrations/import-legacy.js`. O comando imprime somente contagens e preserva a origem.
5. Valide as contas importadas e o login antigo. No serviço web, configure `DATABASE_URL` com a **Internal Database URL** em **Environment**. Salvar a configuração pode disparar deploy, portanto essa etapa só vem depois do backup/importação. Remova `LEGACY_DATA_FILE` depois da migração.
6. Configure **Settings → Health Check Path** como `/health`. Depois do deploy, confirme `banco: postgres`, `persistente: true`, quantidade esperada de contas, login com a mesma senha e sessão após reinício.

Referências: [filesystem e limites do Free](https://render.com/docs/free), [conexões PostgreSQL](https://render.com/docs/postgresql-creating-connecting), [Shell/SSH](https://render.com/docs/ssh).

## Transmissão e volume

A sobreposição vinha de `.tbar`, `.vb` e do botão de contexto posicionados separadamente por coordenadas absolutas. Agora as ações compartilham `.tile-ui` e uma barra única: tela cheia primeiro, volume, mute, destaque, participantes e mais opções. Miniaturas usam rolagem horizontal quando necessário.

Controles desaparecem após 2,6 segundos de inatividade, reaparecem com movimento/toque e ficam visíveis durante foco, hover sobre a própria barra ou painel aberto. Escape fecha o painel e devolve o foco. Fullscreen trata permissão negada e alterna entrada/saída. Volume de voz e transmissão são independentes, entre 0% e 200%, com mute e restauração; menus e barra atualizam o mesmo estado.

## HUD e funcionalidades

- Canais com seleção, espaçamento e hierarquia refinados; perfil em duas linhas com nome truncado e botões separados.
- Em telas menores, os canais ficam em uma gaveta com abrir/fechar, Escape e foco apropriado, preservando espaço da conversa.
- Configurações, menus de contexto, participantes, formulário de mensagem e barra da chamada receberam espaçamento e acabamento consistentes.
- Abrir configurações somente enumera dispositivos; permissão de microfone/câmera é solicitada ao usar os respectivos recursos.
- Silenciar notificações por canal mantém as mensagens e contadores. Alertas repetidos da mesma mensagem são suprimidos.
- Online, Ausente, Ocupado e Invisível são persistidos. Invisível omite a pessoa da lista Online e indicadores de digitação; quem participa de uma sala de voz continua identificável nela, com indicação offline.
- Convites copiados pelo menu do canal de texto abrem o Papo nesse canal após autenticação. Não contêm credenciais.
- Violeta, Lavanda e Ameixa; feedback de preferências salvas, menus navegáveis por teclado e avisos locais sem empilhamento duplicado.
- Cursor padrão pequeno: **34 × 23 px**, hotspot **6,6**. Médio: **48 × 32 px**, hotspot **8,8**. Há opção de sistema; campos de texto mantêm o cursor de texto.

## Como descobrir os easter eggs

1. **Florzinha:** clique na flor discreta acima do perfil na barra de canais. Ela desabrocha e revela “um caminho de flores…”.
2. **Jardim secreto:** abra esse caminho; plante até seis flores, toque na placa para mensagens e no vagalume para iluminar o jardim. Fechar/Escape restaura o foco sem interromper a chamada.
3. **Kombi floral:** clique no pequeno coração em **Configurações → Aparência**. Ela entrega uma flor e uma mensagem.
4. **Pétalas:** no jardim, clique em **Soprar pétalas**. A camada ignora ponteiros e termina sozinha; a digitação continua disponível.
5. **Mensagens escondidas:** quatro cliques no logo lateral ou **Configurações → Aplicativo → Um detalhe de carinho**.

As imagens fornecidas inspiraram SVGs originais: jardim em pixel art com placas/vagalumes e Kombi com flores. Todos os novos easter eggs são silenciosos, respeitam redução de movimento e podem ser desligados em Aparência. Desligá-los remove imediatamente efeitos, mensagens e painel. A abertura da Kombi e seu áudio original foram preservados.

## Testes executados e limites

- Suíte Node: **70 testes aprovados, zero falhas e zero ignorados**, habilitando o teste opcional de PostgreSQL por `PAPO_TEST_PGLITE_MODULE`.
- HTTP real em dados temporários: cadastro, login existente, hashes legados, cookies, revogação, logout, perfis e substituição/reinício do servidor com o mesmo armazenamento.
- PostgreSQL real em WebAssembly/PGlite: SQL/transações, migração de arquivo e `kv`, importação em banco não vazio, rollback de conflitos, gravações por caches de deploy distintos e ausência de ressurreição de contas/sessões excluídas. Não foi uma conexão TCP/TLS com o Render.
- Navegador: login, perfil com nome longo, envio de mensagem, configurações/gaveta móvel e jardim integrado em 1280×720 e 390×844. O agente de assets também verificou os efeitos em 390×740.
- Prévia local com vídeo/áudio sintéticos: tela cheia real em 1920×1080, entrada/saída, destaque, volume de uma transmissão em 20% com outras em 100%, auto-hide e controles separados em 320×568.
- Testes de regressão preservam abertura/áudio, prontidão de sessão, instaladores/downloads, seletor Electron e credenciais TURN.
- Sintaxe dos scripts e `git diff --check` aprovados.

Não foram executados: migração/deploy real com banco no Render, fechamento/reabertura de instalador Electron, captura de tela do sistema operacional, microfone/câmera reais nem chamada WebRTC entre dois dispositivos/redes. A prévia sintética valida os controles, não substitui esses testes de mídia.

## Arquivos modificados

`README.md`, `docs/quality-update.md`, `package.json`, `server.js`, `storage.js`, `migrations/import-legacy.js`, `public/app.html`, `public/papo-enhancements.js`, `public/papo-ui.css`, `public/kombi-cursor.svg`, `public/kombi-cursor-medium.svg`, `public/papo-surprises.js`, `public/papo-surprises.css`, `public/papo-garden.svg`, `public/kombi-flowers.svg`, `test/server-updates.test.js`, `test/auth-persistence.test.js`, `test/storage.test.js`, `test/socket-session.test.js`, `test/stream-controls.test.js`, `test/papo-surprises.test.js`, `test/ui-preferences.test.js`.
