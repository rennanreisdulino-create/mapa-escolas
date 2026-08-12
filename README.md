# Mapa de calor — escolas prospectadas

Página com mapa de calor e ranking de visita da carteira **Escolas alvo 2026**.

Prioridade (0–100):

- 50 pontos se o **ticket ≥ R$ 300**
- até 50 pontos conforme o **número de alunos** (proporcional à maior escola)

## Desenvolvimento

```bash
npm run sync
npm install
npm run dev
```

A planilha pública é lida em CSV. Endereços são geocodificados uma vez (CEP via BrasilAPI/AwesomeAPI, fallback Nominatim) e gravados em `public/escolas.json`.

Escolas da **rede pública** são ignoradas no sync (status estadual/municipal, OBS “publica” / EJA pública, nomes “Escola Municipal/Estadual”, etc.).

## Acesso

Login nativo no código (`src/auth.js`), sem banco. E-mails autorizados:

- `taffarel@dulino.com.br`
- `priscilaramos@dulino.com.br`
- `rennanreis@dulino.com.br`

Senha compartilhada: `Dulino@2026` (altere em `src/auth.js` se quiser).

## Publicação (Vercel)

Build pronto em `dist/`. Para publicar:

```bash
npm run deploy
```

Na primeira vez, o Vercel pede login no navegador. Depois disso você recebe um link público (ex.: `https://mapa-escolas.vercel.app`).

**Alternativa sem CLI:** arraste a pasta `dist` em [app.netlify.com/drop](https://app.netlify.com/drop).

## Atualizar dados

**Automático:** uma GitHub Action roda **todo dia às 11h (Brasília)** e também pode ser disparada manualmente em *Actions → Sync planilha → Run workflow*. Se a planilha mudou, ela atualiza `public/escolas.json` e faz push no GitHub. Com Vercel conectado ao repo, o site redeploya sozinho.

**Manual:**

```bash
npm run sync
npm run build
git add public/escolas.json scripts/geocode-cache.json
git commit -m "Atualiza escolas da planilha"
git push
```

O cache de geocodificação (`scripts/geocode-cache.json`) fica no repositório — só endereços novos são consultados de novo.
