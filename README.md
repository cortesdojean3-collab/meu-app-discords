# Papo - chat, call e tela em HD

## 1) Servidor (Render, Web Service, Node)
Build: `npm install --omit=dev` | Start: `npm start`. Teste em `https://SEU-APP.onrender.com/health`.

Variáveis de ambiente:
- `DATABASE_URL` - banco Postgres para **guardar contas, perfis e mensagens para sempre** (recomendado). Crie um grátis em neon.tech ou supabase.com e cole a connection string. Sem isso, os dados ficam num arquivo que o plano grátis do Render apaga a cada atualização.
- `INVITE_CODE` - código que os amigos precisam digitar para criar conta (evita estranhos).
- `GITHUB_REPO` - `seu-usuario/seu-repositorio`, para os botões de download funcionarem (passo 2).
- `ICE_SERVERS` - servidores TURN (opcional).

**No Render, configure também:** Settings > Health Check Path = `/health` (o Render reinicia o serviço se ele parar de responder).
Plano grátis: o serviço **dorme após ~15 min sem acessos** e demora ~30-50 s para acordar. Isso é limite do plano, não defeito do código. Para evitar, use o plano pago ou um monitor (ex.: UptimeRobot) chamando `/health` a cada 10 min.

**Sessões:** o login agora usa cookie `HttpOnly` + `Secure` + `SameSite=Lax` validado no servidor ("Manter conectado" = 30 dias; sem marcar = 12 h). Na primeira atualização, quem já tinha conta precisa entrar de novo uma vez (as contas e mensagens são mantidas).

## 2) Gerar os instaladores (sem instalar nada)
1. Suba esta pasta inteira (com `.github`) para um repositório **público** no GitHub.
2. Edite `config.json` e coloque o endereço do seu Render em `serverUrl`.
3. No GitHub: aba **Actions** > "Gerar executaveis" > **Run workflow**. Leva uns 10 minutos.
4. Quando terminar, aparece em **Releases** com `Papo-win.exe`, `Papo-mac.dmg` e `Papo-linux.AppImage`.
5. No Render, defina `GITHUB_REPO` e reinicie. Os botões da página inicial passam a baixar de lá.

## Avisos
- Windows (SmartScreen) e macOS (clique direito > Abrir) mostram aviso porque o app não é assinado.
- Não funciona em GitHub Pages, Netlify ou Vercel (precisam de servidor Node com WebSocket).
- Sem acesso ao app de desktop? O botão **Instalar app** do site instala pelo Chrome/Edge.
