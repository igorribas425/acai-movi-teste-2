import { chromium } from "playwright";

const base = process.env.TEST_URL || "http://127.0.0.1:4173";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  permissions: ["clipboard-read", "clipboard-write", "geolocation"],
  geolocation: { latitude: -26.0810, longitude: -53.0550 }
});
let capturedOrder = null;
await context.route("**/rest/v1/orders*", async route => {
  if (route.request().method() === "POST") {
    capturedOrder = route.request().postDataJSON();
    await route.fulfill({ status: 201, contentType: "application/json", body: "[]" });
    return;
  }
  await route.continue();
});
await context.route("https://nominatim.openstreetmap.org/**", route => route.fulfill({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({
    address: {
      house_number: "321",
      road: "Rua Teste GPS",
      suburb: "Centro",
      city: "Francisco Beltrão",
      state: "Paraná",
      country: "Brasil"
    }
  })
}));
const page = await context.newPage();
const failures = [];

function ok(condition, message) {
  if (!condition) failures.push(message);
  else console.log("✓", message);
}

try {
  await page.goto(base + "/", { waitUntil: "networkidle" });
  ok((await page.title()).includes("Açaí Moví"), "Título do site");
  ok(await page.locator(".product-card").count() === 4, "4 produtos carregados");
  ok((await page.locator("body").innerText()).includes("Francisco Beltrão"), "Região correta");

  await page.locator('[data-open-product="acai-300"]').click();
  ok(await page.locator("#productOverlay").isVisible(), "Modal do produto abre");
  ok(await page.locator("#addToCartBtn").isDisabled(), "Não adiciona sem 4 complementos");

  const freeChoices = page.locator("#freeChoices .choice");
  for (let i = 0; i < 4; i++) await freeChoices.nth(i).click();
  ok((await page.locator("#freeCounter").innerText()) === "4/4", "Copo exige 4 complementos");
  ok(!(await page.locator("#addToCartBtn").isDisabled()), "Libera adicionar com 4 complementos");

  await page.locator("#premiumChoices .choice").first().click();
  ok((await page.locator("#addButtonTotal").innerText()).includes("21,00"), "Extra premium soma R$ 3");
  await page.locator("#addToCartBtn").click();

  ok(await page.locator("#cartOverlay").isVisible(), "Carrinho abre após adicionar");
  ok((await page.locator("#summaryBox").innerText()).includes("21,00"), "Subtotal do carrinho correto");

  await page.locator("#customerName").fill("Cliente Teste");
  await page.locator("#customerPhone").fill("(46) 99999-9999");
  await page.locator("#useLocationBtn").click();
  await page.waitForFunction(() => document.querySelector("#neighborhoodSelect")?.value === "centro");
  ok((await page.locator("#neighborhoodSelect").inputValue()) === "centro", "GPS identifica Centro automaticamente");
  ok((await page.locator("#locationStatus").innerText()).includes("R$"), "GPS mostra a taxa aplicada");
  ok((await page.locator("#streetInput").inputValue()) === "Rua Teste GPS", "GPS preenche a rua automaticamente");
  ok((await page.locator("#numberInput").inputValue()) === "321", "GPS preenche o número automaticamente");
  ok((await page.locator("#checkoutTotal").innerText()).includes("31,00"), "Taxa do Centro soma R$ 10");
  ok((await page.locator("#paymentHelp").innerText()).includes("aguardando"), "Checkout explica o fluxo do PIX");

  await page.evaluate(() => {
    window.__opened = [];
    window.open = (url) => { window.__opened.push(url); return null; };
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (text) => { window.__copied = text; } }
    });
  });

  await page.locator("#finishOrderBtn").click();
  await page.waitForTimeout(650);
  const savedOrder = Array.isArray(capturedOrder) ? capturedOrder[0] : capturedOrder;
  ok(Boolean(savedOrder), "Pedido é salvo antes de abrir o WhatsApp");
  ok(savedOrder?.status === "new", "Pedido entra como Novo");
  ok(savedOrder?.neighborhood === "Centro", "Pedido salva o bairro");
  ok(Number(savedOrder?.delivery_fee) === 10, "Pedido salva taxa de R$ 10");
  ok(Number(savedOrder?.total) === 31, "Pedido salva total de R$ 31");
  ok(Array.isArray(savedOrder?.items) && savedOrder.items.length === 1, "Pedido salva os itens");
  ok(typeof savedOrder?.tracking_token === "string" && savedOrder.tracking_token.length > 20, "Pedido gera token de acompanhamento");
  const copied = await page.evaluate(() => window.__copied || "");
  const opened = await page.evaluate(() => window.__opened || []);
  ok(copied.includes("Açaí 300ml"), "Resumo contém o produto");
  ok(copied.includes("Centro"), "Resumo contém o bairro");
  ok(copied.includes("R$ 31,00") || copied.includes("R$ 31,00"), "Resumo contém total");
  ok(copied.includes("PIX"), "Resumo contém pagamento");
  ok(copied.includes("acompanhar-pedido.html?token="), "Resumo contém link de acompanhamento");
  ok(opened.some(u => String(u).includes("wa.me/message/KONPQZAX7CH2L1")), "Abre WhatsApp correto");

  await page.locator('[data-mode="pickup"]').click();
  ok((await page.locator("#checkoutTotal").innerText()).includes("21,00"), "Retirada remove taxa");
  ok(await page.locator("#deliveryFields").isHidden(), "Retirada oculta endereço");

  await page.locator("#closeCartBtn").click();
  await page.locator("#searchInput").fill("Marmita");
  ok(await page.locator(".product-card").count() === 1, "Busca filtra marmita");
  await page.locator('[data-open-product="acai-1kg"]').click();
  const freeMarmita = page.locator("#freeChoices .choice");
  for (let i = 0; i < 5; i++) await freeMarmita.nth(i).click();
  ok(await page.locator("#addToCartBtn").isDisabled(), "Marmita não libera com só 5 complementos");
  await freeMarmita.nth(5).click();
  ok((await page.locator("#freeCounter").innerText()) === "6/6", "Marmita exige 6 complementos");
  ok(!(await page.locator("#addToCartBtn").isDisabled()), "Marmita libera com 6 complementos");

  await page.goto(base + "/painel-movi-gestao.html", { waitUntil: "networkidle" });
  ok(await page.locator("#loginScreen").isVisible(), "Painel ADM conectado e exige login");
  ok(await page.locator("#setupScreen").isHidden(), "Painel não está em modo sem banco");
  ok(await page.locator('[data-section="orders"]').count() === 1, "Central de Pedidos existe no ADM");
  ok(await page.locator('[data-tab="orders"]').count() === 1, "Menu Pedidos existe no ADM");
  await page.locator("#firstAccessBtn").click();
  ok((await page.locator("#loginError").innerText()).includes("Preencha e-mail e senha"), "Botão Primeiro acesso responde ao clique");
  ok(await page.locator("#firstAccessHelp").isVisible(), "Ajuda do primeiro acesso aparece");

  await page.goto(base + "/confirmacao-acesso.html", { waitUntil: "networkidle" });
  ok((await page.title()).includes("Acesso confirmado"), "Página profissional de confirmação existe");
  ok(await page.locator(".confirm-card").isVisible(), "Tela de confirmação renderiza");
  ok(await page.locator("#goAdminBtn").count() === 1, "Confirmação oferece acesso ao painel");

  let deliveryConfirmed = false;
  await context.route("**/rest/v1/rpc/get_order_tracking", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify([{
      order_number: "MV-TRACK-001",
      status: deliveryConfirmed ? "delivered" : "out_for_delivery",
      payment: "card",
      payment_status: deliveryConfirmed ? "paid" : "pay_on_delivery",
      customer_name: "Cliente Teste",
      delivery_mode: "delivery",
      neighborhood: "Centro",
      total: 31,
      created_at: new Date().toISOString(),
      delivered_confirmed_by_customer: deliveryConfirmed
    }])
  }));
  await context.route("**/rest/v1/rpc/confirm_order_delivery", route => {
    deliveryConfirmed = true;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{order_number:"MV-TRACK-001",status:"delivered",payment_status:"paid",delivered_at:new Date().toISOString()}])
    });
  });
  await page.goto(base + "/acompanhar-pedido.html?token=11111111-1111-4111-8111-111111111111", { waitUntil: "networkidle" });
  ok((await page.locator("#mainStatus").innerText()).includes("Saiu para entrega"), "Cliente vê saída para entrega");
  ok(await page.locator("#confirmDeliveryBtn").isVisible(), "Cliente recebe botão de confirmar recebimento");
  await page.locator("#confirmDeliveryBtn").click();
  await page.waitForTimeout(250);
  ok(deliveryConfirmed, "Confirmação do cliente chama o fluxo de entrega");
  ok((await page.locator("#mainStatus").innerText()).includes("Entregue"), "Pedido muda para Entregue após confirmação");
  ok((await page.locator("#paymentState").innerText()).includes("confirmado"), "Pagamento na entrega é concluído com o recebimento");

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.goto(base + "/", { waitUntil: "networkidle" });
  ok(await mobile.locator(".product-card").count() === 4, "Cardápio carrega no celular");
  const gridCols = await mobile.locator("#productGrid").evaluate(el => getComputedStyle(el).gridTemplateColumns.split(" ").length);
  ok(gridCols === 2, "Grid responsivo com 2 colunas no celular");
  await mobile.close();
} catch (error) {
  failures.push("Erro inesperado no teste: " + (error?.stack || error));
}

await browser.close();

if (failures.length) {
  console.error("\nFalhas:");
  failures.forEach(f => console.error("✗", f));
  process.exit(1);
}
console.log("\nTodos os testes E2E passaram.");
