# Papo (chat + call + tela em HD)

Três partes: **servidor** (`server.js`), **site de download** (`/`) e **app de desktop** (Electron).

## 1) Hospedar o servidor/site
Precisa de Node 18+. Em qualquer hospedagem com Node (Render, Railway, Fly.io, VPS):
```
npm install --omit=dev
npm start
```
Variáveis opcionais: `PORT`, `SERVER_PASSWORD` (senha para entrar), `DATA_FILE` (onde salvar chat/perfis),
`ICE_SERVERS` (JSON com servidores TURN, recomendado para amigos em redes difíceis).
Use HTTPS (as hospedagens acima já dão), senão o navegador bloqueia microfone e tela.
Obs.: em planos grátis o disco é apagado a cada deploy, então o histórico some. Use disco persistente se quiser mantê-lo.

## 2) Gerar os executáveis
Edite `config.json` e coloque o endereço do seu site em `serverUrl`.
**Jeito fácil (sem instalar nada):** suba esta pasta num repositório do GitHub, vá em Actions > "Gerar executaveis" > Run workflow.
Ele gera Windows, macOS e Linux. Baixe os arquivos na aba do job.
**Local:** `npm install && npm run dist` (gera só para o sistema em que você está).

## 3) Publicar para os amigos
Coloque os arquivos na pasta `downloads/` do servidor, com estes nomes:
`Papo-win.exe`, `Papo-mac.dmg`, `Papo-linux.AppImage`.
A página inicial do seu site já tem os botões de download.

## Problemas comuns
- **"Reconectando ao servidor":** abra `https://SEU-SITE/health`. Se mostrar `{"ok":true...}` o servidor está certo; se der erro, a hospedagem não roda Node.js. GitHub Pages, Netlify e Vercel **não servem** (só hospedam páginas estáticas, sem WebSocket). Use Render, Railway, Fly.io ou uma VPS.
- **Download diz que o arquivo não existe:** os instaladores não vêm prontos. Gere-os (passo 2) e coloque na pasta `downloads/` com os nomes exatos. Abra `/health` para ver quais arquivos o servidor está enxergando. Enquanto isso, o botão "Instalar app" do site instala o Papo como programa direto do navegador (Chrome/Edge).
- **App de desktop preso:** pressione Ctrl+Shift+S para trocar o endereço do servidor.

## Avisos
- Windows pode mostrar "SmartScreen" e macOS "desenvolvedor não identificado", porque o app não é assinado. Basta "Mais informações > Executar mesmo assim" (Windows) ou clique direito > Abrir (Mac). Assinar exige certificado pago.
- Testar sem gerar executável: `npm install && npm start`, abra `http://localhost:3000`.
