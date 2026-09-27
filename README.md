# Açaí Moví Delivery

Site de delivery do Açaí Moví para Francisco Beltrão/PR.

## Produção

- Site do cliente: https://igorribas425.github.io/acai-movi-teste-2/
- Painel administrativo: https://igorribas425.github.io/acai-movi-teste-2/painel-movi-gestao.html
- Acompanhamento do pedido: link individual gerado para cada pedido.

## Cliente

- Cardápio responsivo com busca e categorias.
- Montagem obrigatória de 4 complementos nos copos e 6 na marmita.
- Extras premium cobrados separadamente.
- Carrinho, quantidade e observações.
- Entrega por bairro ou retirada no local.
- Localização atual com tentativa de preencher bairro, rua e número.
- Taxa de entrega automática.
- PIX, cartão e dinheiro.
- Pedido salvo no Supabase antes da abertura do WhatsApp.
- Link individual para acompanhar o andamento.
- Confirmação de recebimento pelo cliente.

## Fluxo do pedido

- Novo
- Confirmado
- Preparando
- Saiu para entrega
- Entregue
- Cancelado

### Pagamento

- PIX: fica aguardando confirmação manual no painel antes de entrar em preparo.
- Cartão: pagamento na entrega.
- Dinheiro: pagamento na entrega, com campo de troco.
- Quando o cliente confirma o recebimento em cartão ou dinheiro, o pagamento é marcado como concluído.

## Painel administrativo

- Central de pedidos com filtros e resumo do dia.
- Confirmação de PIX.
- Início do preparo.
- Saída para entrega.
- Produtos, fotos, preços e disponibilidade.
- Complementos e extras.
- Bairros e taxas.
- Horário da loja, Instagram e WhatsApp.
- Acesso protegido por Supabase Auth + RLS.

## Tecnologia

Frontend estático em HTML, CSS e JavaScript, publicado no GitHub Pages, com Supabase para autenticação, banco de dados, armazenamento e segurança.

O frontend usa somente a chave pública/publishable do Supabase. Nunca use `service_role` no navegador.
