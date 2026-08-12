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

## Publicação (Vercel)

Build pronto em `dist/`. Para publicar:

```bash
npm run deploy
```

Na primeira vez, o Vercel pede login no navegador. Depois disso você recebe um link público (ex.: `https://mapa-escolas.vercel.app`).

**Alternativa sem CLI:** arraste a pasta `dist` em [app.netlify.com/drop](https://app.netlify.com/drop).

## Atualizar dados

Quando a planilha mudar:

```bash
npm run sync
npm run build
npm run deploy
```

O cache de geocodificação fica em `scripts/geocode-cache.json` — só endereços novos são consultados de novo.
