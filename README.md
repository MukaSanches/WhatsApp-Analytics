# WhatsApp Analytics 1.3 — Windows

Painel moderno em verde, com gráficos e **conexão real à sua conta pelo QR Code de Aparelhos conectados**. Projeto independente de MukaSanches, não afiliado à Meta/WhatsApp.

## Como funciona a conexão

- Abra o app; clique em **Conectar WhatsApp**.
- No celular: WhatsApp → **Aparelhos conectados** → **Conectar aparelho** → leia o QR Code exibido no app.
- Aguarde o status **Conectado de verdade**, selecione as conversas que desejar e clique em **Sincronizar selecionadas**.
- O programa consulta **400, 2.000 ou todas as mensagens disponibilizadas pelo WhatsApp Web**, conforme o histórico realmente disponibilizado pelo WhatsApp Web. Mensagens novas nas conversas selecionadas alimentam o painel em tempo real enquanto o programa estiver em execução e conectado.
- A aba permite voltar à demonstração e importar exportações TXT/ZIP sem conexão.

**Atenção:** a conexão usa a biblioteca comunitária [`whatsapp-web.js`](https://github.com/wwebjs/whatsapp-web.js), **não uma API oficial do WhatsApp**. Ela pode parar após atualizações e pode envolver risco de limitação/bloqueio da conta. A API oficial é [WhatsApp Business Platform](https://developers.facebook.com/docs/whatsapp/cloud-api/overview), que exige configuração comercial específica e não é uma API geral de acesso ao histórico pessoal. Não há garantia de disponibilidade do histórico completo.

## Privacidade e limites

- QR Code e autenticação local pelo cliente oficial WhatsApp Web, executado em navegador Chromium do computador (Edge/Chrome), com autenticação persistida na pasta de dados do app Windows (Electron `userData`). **Não coloque essa pasta em repositórios públicos nem compartilhe suas sessões.**
- Não utiliza servidor próprio, nuvem para análise, telemetria, mensagens automáticas, envio em massa ou leitura de anexos. Sua conexão com os servidores do WhatsApp ocorre normalmente para sincronizar chats.
- Conteúdo de mensagens e estatísticas ficam na memória do aplicativo, não em banco de dados. O arquivo CSV só é salvo quando você solicitar. Use **Pausar** para encerrar conexão sem apagar a sessão vinculada; para desvincular definitivamente, remova o dispositivo em **Aparelhos conectados**, no celular.
- O painel inicia **vazio**, sem métricas fictícias. A demonstração só aparece quando você clicar no botão correspondente.

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

## Novidades da v1.2.0 (mantidas na v1.3.0)

- **Reparar conexão**: após erro de perfil do navegador em uso, encerra **somente** processos Chrome/Edge cujo comando aponta para o diretório exclusivo `session-analytics`. Não apaga cookies, tokens nem a sessão vinculada. É acionado somente após confirmação do usuário.
- O Electron usa bloqueio de instância única e aguarda o encerramento do Chromium antes de fechar, reduzindo conflitos de sessão.
- A lista de chats não tem corte artificial de 250; a interface pagina visualmente os resultados para não sobrecarregar a tela. Há seleção de todas as conversas filtradas.
- Sincronização opcional de 400, 2.000 ou **todo o histórico disponível** por conversa; resultados chegam ao painel em lotes. **Isso não garante acesso ao histórico completo do celular**.
- Indicadores de cobertura por conversa (primeira e última mensagem recuperada, quantidade e aviso de possível histórico adicional), cancelamento entre conversas e visualizador paginado das mensagens reais.
- Os dados das mensagens ficam apenas na memória durante a execução; fechar o aplicativo descarta os dados carregados. Não há acesso a mídias binárias nem a mensagens apagadas.

**Importante:** a função de reparo não deve ser usada com outro aplicativo que esteja intencionalmente usando o mesmo perfil. O WhatsApp Web é um serviço não oficial para automação, sujeito a mudanças e restrições. A sincronização de histórico extenso pode ser lenta e consumir memória. Para histórico que não esteja disponível no WhatsApp Web, use exportação TXT/ZIP da conversa no celular.

## Compatibilidade com WhatsApp Web 2.3000.x

Na versão 1.34.7 de `whatsapp-web.js`, `getChats()`/`getChatById()` podem falhar com o erro `r: r` após a autenticação, devido a mudanças internas dos modelos do WhatsApp Web. O app agora usa leitura alternativa **somente de leitura**, extraindo campos primitivos da coleção quando a API pública falha. A sessão permanece vinculada.

Também há leitura alternativa de mensagens, tentando carregar mensagens anteriores quando disponível. A opção **Todo o histórico disponível** fica limitada no modo alternativo a **20 mil mensagens por conversa** para proteger a memória; o app exibe a limitação e informa histórico parcial. Não é garantia de acesso a todas as mensagens da conta.

Fonte sobre a falha: https://github.com/wwebjs/whatsapp-web.js/issues/201845

A conexão e a leitura de uma conta real ainda precisam ser verificadas com o usuário; os testes locais simulam modelos internos conhecidos.