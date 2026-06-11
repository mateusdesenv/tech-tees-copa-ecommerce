# Tech-Tees Copa - Angular

Projeto convertido de HTML/CSS/JS para Angular standalone.

## Rodar localmente

```bash
npm install
npm start
```

Acesse: `http://localhost:4200`

## Build

```bash
npm run build
```

## Meta Pixel

O Pixel é carregado dinamicamente pelo `MetaPixelService` somente quando `PIXEL_ID` está configurado.

Na Vercel, configure:

Produção:

```env
PIXEL_ID=796146570133494
```

HML:

```env
PIXEL_ID=996614626592280
```

Depois de alterar a variável, faça um novo deploy para que o Angular gere o `environment.ts` correspondente.

O projeto não inclui a imagem `<noscript>` porque o ID é resolvido em build/runtime pelo JavaScript e a aplicação é uma SPA Angular. Isso evita manter um ID fixo no HTML.

Como a navegação atual é controlada por estado no `AppComponent`, os `PageView` são emitidos ao abrir loja, detalhe, checkout e confirmação. O componente também escuta `NavigationEnd` automaticamente caso Angular Router seja habilitado futuramente.

## API usada

O projeto mantém o consumo da API original:

- `https://tech-tees-admin-api.vercel.app/stores/public?slug=copa-do-mundo`
- `https://tech-tees-admin-api.vercel.app/products?storeId=...`

## Estrutura principal

- `src/app/app.component.html` — layout da página
- `src/app/app.component.ts` — lógica de catálogo, API, fallback de imagens e parallax
- `src/styles.css` — identidade visual original migrada
- `src/assets/banner-hero.webp` — banner principal
# tech-tees-copa-ecommerce
