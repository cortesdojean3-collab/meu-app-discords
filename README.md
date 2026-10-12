# Papo - chat, call e tela em HD

## 1) Servidor (Render, Web Service, Node)
Build: `npm install --omit=dev` | Start: `npm start`. Teste em `https://SEU-APP.onrender.com/health`.

Variáveis de ambiente:
- `DATABASE_URL` - banco Postgres usado para persistir contas, perfis, mensagens e sessões. Sem isso, o servidor usa `DATA_FILE` ou `data.json`; o disco efêmero do Render pode apagar esses dados em um redeploy. Para produção, configure Postgres ou um disco persistente antes de depender de sessões e histórico. Ao trocar do arquivo para um banco vazio, os dados antigos não são migrados automaticamente: migre-os antes de mudar a configuração.
- `INVITE_CODE` - código que os amigos precisam digitar para criar conta (evita estranhos).
- `GITHUB_REPO` - `seu-usuario/seu-repositorio` se você publicar uma cópia do app em outro repositório. Neste projeto, a consulta ao GitHub Releases já usa `cortesdojean3-collab/meu-app-discords` por padrão.
- `ICE_SERVERS` - servidores TURN (opcional).

**No Render, configure também:** Settings > Health Check Path = `/health` (o Render reinicia o serviço se ele parar de responder).
Plano grátis: o serviço **dorme após ~15 min sem acessos** e demora ~30-50 s para acordar. Isso é limite do plano, não defeito do código. Para evitar, use o plano pago ou um monitor (ex.: UptimeRobot) chamando `/health` a cada 10 min.

**Sessões:** o login agora usa cookie `HttpOnly` + `Secure` + `SameSite=Lax` validado no servidor ("Manter conectado" = 30 dias; sem marcar = 12 h). Na primeira atualização, quem já tinha conta precisa entrar de novo uma vez (as contas e mensagens são mantidas).

**Persistência:** confira `https://SEU-APP.onrender.com/health`. Em produção, `persistente` deve ser `true` quando `DATABASE_URL` estiver configurada. Se estiver `false`, contas, sessões e mensagens estão no arquivo local e podem sumir quando o Render substituir o disco. A página de download também está disponível em `/downloads`; só habilita instaladores com arquivo existente em um GitHub Release publicado.

## 2) Gerar os instaladores (sem instalar nada)
1. Suba esta pasta inteira (com `.github`) para um repositório **público** no GitHub.
2. Edite `config.json` e coloque o endereço do seu Render em `serverUrl`.
3. No GitHub: aba **Actions** > "Gerar executaveis" > **Run workflow**. O workflow compila em Windows, macOS e Linux, anexa apenas os artefatos gerados e publica checksums SHA-256.
4. Uma execução manual publica um release de build com versão e número da execução. Para uma versão numerada, publique uma tag `v*` (por exemplo `v1.1.0`).
5. A página `/downloads` consulta os metadados do GitHub Releases e exibe sistema, tamanho, data, versão e notas. Plataformas sem um artefato válido permanecem indisponíveis. O Render não armazena cópias dos instaladores.

**PWA e aplicativos nativos:** o botão de PWA abre o site instalável no navegador e não baixa um APK. Windows, macOS e Linux só aparecem como downloads quando seus instaladores estão no release; não há APK Android nem publicação na App Store/Play Store configurados neste projeto.

## Avisos
- Windows (SmartScreen) e macOS (clique direito > Abrir) mostram aviso porque o app não é assinado.
- Não funciona em GitHub Pages, Netlify ou Vercel (precisam de servidor Node com WebSocket).
- Sem acesso ao app de desktop? O botão **Instalar app** do site instala pelo Chrome/Edge.

