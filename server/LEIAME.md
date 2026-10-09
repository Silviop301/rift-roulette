# Servidor da API da Riot no seu PC

Este servidor guarda a sua chave da Riot no seu computador e entrega ao Rift Roulette só o que ele precisa: o Riot ID e a maestria de cada campeão. A chave nunca vai pro navegador nem pro GitHub.

Enquanto o servidor e o túnel estiverem ligados, o site ganha a seção **Conta Riot**: você digita seu `Nome#TAG`, escolhe a região, e pode filtrar a roleta por **Nunca joguei**, **Já joguei** ou **Meus top 10**. O card do campeão sorteado também mostra sua maestria nele. Com o PC desligado, o site funciona normal (usa a última maestria salva no navegador, se tiver).

## 1. Instalar o que precisa (uma vez só)

Baixe o projeto no seu PC: no GitHub, botão **Code > Download ZIP** (ou `git clone https://github.com/Silviop301/rift-roulette`) e descompacte numa pasta. O servidor fica na pasta `server` dele.

No Windows, abra o **Prompt de Comando** e rode:

```
winget install OpenJS.NodeJS.LTS
winget install --id Cloudflare.cloudflared
```

Feche e abra o Prompt de novo depois de instalar. Pra conferir: `node --version` (precisa ser 18 ou mais) e `cloudflared --version`.

No Mac: `brew install node cloudflared`.

## 2. Pegar a chave da Riot

1. Entre em https://developer.riotgames.com com a sua conta da Riot.
2. No painel, copie a **Development API Key** (começa com `RGAPI-`).

A chave de desenvolvimento **expira a cada 24 horas**. Quando expirar, o site avisa "A chave da Riot expirou"; é só clicar em *Regenerate API Key* no portal, colar a nova no `.env` e reiniciar o servidor.

Pra não ter que renovar todo dia, peça uma **Personal API Key**: no portal, clique em *Register Product*, escolha *Personal API Key*, descreva o Rift Roulette (uma roleta de campeões pra jogar com amigos, que lê Riot ID e maestria) e envie. A Riot analisa e, se aprovar, você recebe uma chave que não expira.

## 3. Configurar a chave

Na pasta `server` do projeto, copie o arquivo `.env.example` com o nome `.env` e troque a chave:

```
RIOT_API_KEY=RGAPI-sua-chave-de-verdade
```

O `.env` está no `.gitignore`, então ele não sobe pro GitHub.

## 4. Ligar

**Jeito fácil (Windows):** dê dois cliques em `server/iniciar.bat`. Ele abre o servidor numa janela e o túnel em outra.

**Jeito manual (qualquer sistema):** abra dois terminais na pasta `server`.

```
node server.mjs
```

```
cloudflared tunnel --url http://localhost:8787
```

O cloudflared mostra um link parecido com `https://palavras-aleatorias.trycloudflare.com`. Esse link já é o site completo, com a API funcionando. Mande pros amigos.

## 5. Usar no site do GitHub Pages

Se preferir o endereço de sempre, abra uma vez:

```
https://silviop301.github.io/rift-roulette/?api=https://palavras-aleatorias.trycloudflare.com
```

O navegador guarda o endereço. Também dá pra colar o link do túnel no campo **Endereço do servidor**, que aparece na seção Conta Riot quando o servidor está desligado.

O link `trycloudflare.com` **muda toda vez** que você liga o túnel. Se quiser um endereço fixo, veja abaixo.

## Endereço fixo (opcional)

Pra ter sempre o mesmo link, você precisa de um domínio próprio (pago à parte) adicionado a uma conta grátis da Cloudflare. Depois:

```
cloudflared tunnel login
cloudflared tunnel create rift-roulette
cloudflared tunnel route dns rift-roulette api.seudominio.com
cloudflared tunnel run --url http://localhost:8787 rift-roulette
```

E coloque o endereço no `index.html`, na linha `const RIOT_API = '';` (por exemplo `const RIOT_API = 'https://api.seudominio.com';`). Aí todo mundo que abrir o site já usa o servidor, sem precisar de link especial.

## Segurança

- A chave fica só no `.env` do seu PC.
- O servidor só responde a busca de Riot ID e maestria, guarda as respostas por 10 minutos e limita cada visitante a 20 buscas por minuto, pra ninguém gastar o limite da sua chave.
- Só o site do GitHub Pages (e o próprio link do túnel) podem chamar o servidor pelo navegador. Pra liberar outro endereço, edite `ALLOWED_ORIGINS` no `.env`.
- Desligar é só fechar as janelas.
