# Açaí Moví Delivery

Site de delivery do Açaí Moví para Francisco Beltrão/PR.

## Cliente
- Cardápio navegável e responsivo.
- Busca e categorias.
- Montagem obrigatória: 4 complementos nos copos e 6 na marmita.
- Morango, kiwi, Oreo e creme de avelã como extras de R$ 3.
- Carrinho com quantidade e observações.
- Entrega por bairro ou retirada.
- PIX, cartão e dinheiro.
- Finalização pelo WhatsApp.

## Admin
- `admin.html`: painel administrativo.
- Produtos: nome, descrição, preço, foto, limite, destaque e disponibilidade.
- Complementos: nome, preço e disponibilidade.
- Entrega: bairros e taxas.
- Loja: dados, horário, Instagram e WhatsApp.
- Login e dados preparados para Supabase com RLS.

O arquivo `config.js` recebe apenas URL e chave pública (anon/publishable) do Supabase. Nunca use `service_role` no frontend.
