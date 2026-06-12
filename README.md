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

## Firebase Auth

Crie um projeto no Firebase, habilite os provedores `E-mail/senha` e `Google` em **Authentication > Sign-in method** e adicione os domínios da loja em **Authentication > Settings > Authorized domains**.

Configure as mesmas variáveis no `.env` local e nos ambientes HML/Produção da Vercel:

```env
FIREBASE_API_KEY=
FIREBASE_AUTH_DOMAIN=
FIREBASE_PROJECT_ID=
FIREBASE_STORAGE_BUCKET=
FIREBASE_MESSAGING_SENDER_ID=
FIREBASE_APP_ID=
FIREBASE_MEASUREMENT_ID=
```

Esses valores são a configuração pública do app Web do Firebase. Senhas e tokens privados não devem ser adicionados ao frontend. Sem essa configuração, a loja continua navegável, mas login e cadastro ficam desabilitados.

O checkout é protegido por `authGuard`. Usuários não autenticados são enviados para `/login` e retornam automaticamente para `/checkout` após o acesso. O carrinho é persistido no `localStorage` durante esse fluxo.

As rotas `/minha-conta` e `/minhas-compras` também exigem autenticação. Depois de um pagamento realmente aprovado, o carrinho e sua cópia no `localStorage` são limpos; pagamentos recusados, pendentes ou com erro preservam os itens.

Enquanto não houver um endpoint de pedidos por cliente, o `OrderService` salva o histórico no `localStorage`, associado ao `uid` do Firebase. A tela `/minhas-compras` filtra pelo usuário autenticado, ordena os pedidos mais recentes primeiro e exibe os detalhes dos itens em uma modal. Essa camada está isolada para facilitar a futura troca por uma API.

## Catálogo

A rota pública `/catalogo` lista todos os produtos ativos da loja, com busca, categorias dinâmicas, ordenação de preço e modos grade/lista. As categorias são carregadas pelo endpoint público `GET /categories/public`; operações administrativas em `/categories` continuam protegidas.

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
