# WhatsApp Analytics 1.1 — Windows

Painel moderno em verde, com gráficos e **conexão real à sua conta pelo QR Code de Aparelhos conectados**. Projeto independente de MukaSanches, não afiliado à Meta/WhatsApp.

## Como funciona a conexão

- Abra o app; clique em **Conectar WhatsApp**.
- No celular: WhatsApp → **Aparelhos conectados** → **Conectar aparelho** → leia o QR Code exibido no app.
- Aguarde o status **Conectado de verdade**, selecione de 1 a 15 conversas e clique em **Sincronizar selecionadas**.
- O programa consulta até **400 mensagens recentes por conversa**, conforme o histórico realmente disponibilizado pelo WhatsApp Web. Mensagens novas nas conversas selecionadas alimentam o painel em tempo real enquanto o programa estiver em execução e conectado.
- A aba permite voltar à demonstração e importar exportações TXT/ZIP sem conexão.

**Atenção:** a conexão usa a biblioteca comunitária [`whatsapp-web.js`](https://github.com/wwebjs/whatsapp-web.js), **não uma API oficial do WhatsApp**. Ela pode parar após atualizações e pode envolver risco de limitação/bloqueio da conta. A API oficial é [WhatsApp Business Platform](https://developers.facebook.com/docs/whatsapp/cloud-api/overview), que exige configuração comercial específica e não é uma API geral de acesso ao histórico pessoal. Não há garantia de disponibilidade do histórico completo.

## Privacidade e limites

- QR Code e autenticação local pelo cliente oficial WhatsApp Web, executado em navegador Chromium do computador (Edge/Chrome), com autenticação persistida na pasta de dados do app Windows (Electron `userData`). **Não coloque essa pasta em repositórios públicos nem compartilhe suas sessões.**
- Não utiliza servidor próprio, nuvem para análise, telemetria, mensagens automáticas, envio em massa ou leitura de anexos. Sua conexão com os servidores do WhatsApp ocorre normalmente para sincronizar chats.
- Conteúdo de mensagens e estatísticas ficam na memória do aplicativo, não em banco de dados. O arquivo CSV só é salvo quando você solicitar. Use **Pausar** para encerrar conexão sem apagar a sessão vinculada; para desvincular definitivamente, remova o dispositivo em **Aparelhos conectados**, no celular.
- Por padrão o painel abre com dados **fictícios**, marcados como demonstração, até importar ou sincronizar dados reais.

## Instalação para desenvolvimento

Requer **Windows 10/11 x64**, **Node.js 22**, **Microsoft Edge ou Chrome** instalado. Execute:

```powershell
npm install
npm start
```

Caso não queira que Puppeteer baixe um Chrome separado ao instalar dependências, defina `PUPPETEER_SKIP_DOWNLOAD=true` antes de `npm install` (o app procura Edge/Chrome instalado).

Para gerar instalador e versão portátil no Windows:

```powershell
npm test
npm run pack:win
```

Arquivos `.exe` ficam em `dist/`. A rotina GitHub Actions também compila builds Windows em cada push, e disponibiliza artefatos em **Actions → Windows desktop build → Artifacts**. Um build bem-sucedido não comprova que o emparelhamento por QR funcionou na conta real; esta etapa deve ser validada com seu celular.

## Estatísticas

Mensagens por mês, ranking de participantes, frequência por horário/dia da semana, palavras mais utilizadas, emojis, mídias registradas, links e tempo mediano aproximado de alternância de autor (não é confirmação de leitura). Filtros por conversa, data e texto; exportação CSV e PDF. Também suporta arquivos TXT e ZIP de conversas exportadas.

## Segurança e integridade

Electron com `contextIsolation`, `sandbox`, sem `nodeIntegration` na UI, CSP restritiva e navegação externa bloqueada; chamadas nativas pelo preload. Conexões WhatsApp iniciam apenas após um clique. Nunca envie conteúdos sensíveis, credenciais ou QR Code para suporte ou GitHub.

## Testes

`npm test` cobre o parser e motor de análises. Sem uma conta autorizada nesta execução, **o login QR e a sincronização com conta real não podem ser considerados testados**.

Licença MIT.