# Papo - chat, call e tela em HD

## 1) Servidor (Render, Web Service, Node)
Build: `npm install --omit=dev` | Start: `npm start`. Teste em `https://SEU-APP.onrender.com/health`.

Variáveis de ambiente:
- `DATABASE_URL` - banco Postgres para **guardar contas, perfis e mensagens para sempre** (recomendado). Crie um grátis em neon.tech ou supabase.com e cole a connection string. Sem isso, os dados ficam num arquivo que o plano grátis do Render apaga a cada atualização.
- `INVITE_CODE` - código que os amigos precisam digitar para criar conta (evita estranhos).
- `GITHUB_REPO` - `seu-usuario/seu-repositorio`, para os botões de download funcionarem (passo 2).
- `ICE_SERVERS` - servidores TURN (opcional).

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
