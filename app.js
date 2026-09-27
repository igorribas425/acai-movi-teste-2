(() => {
  const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const STORAGE_KEY = "acai-movi-cart-v3";
  const whatsappUrl = "https://wa.me/message/KONPQZAX7CH2L1";

  const defaults = {
    store: {
      store_name: "Açaí Moví",
      city: "Francisco Beltrão",
      state: "PR",
      instagram_url: "https://www.instagram.com/acaimovi?stkn=MW56b3NqeTcxZTQ5Zw==",
      whatsapp_url: whatsappUrl,
      opens_at: "13:00",
      closes_at: "22:00"
    },
    products: [
      { id: "acai-300", name: "Açaí 300ml", description: "O tamanho perfeito para começar 💜", price: 18, image_url: "images/produto-300.png", free_limit: 4, category: "cups", active: true, featured: false },
      { id: "acai-400", name: "Açaí 400ml", description: "O equilíbrio perfeito.", price: 20, image_url: "images/produto-400.png", free_limit: 4, category: "cups", active: true, featured: true },
      { id: "acai-500", name: "Açaí 500ml", description: "Nosso campeão de pedidos.", price: 22, image_url: "images/produto-500.png", free_limit: 4, category: "cups", active: true, featured: false },
      { id: "acai-1kg", name: "Marmita 1kg", description: "Ideal para compartilhar.", price: 45, image_url: "images/produto-1kg.jpg", free_limit: 6, category: "marmita", active: true, featured: false }
    ],
    complements: [
      { id: "banana", name: "Banana", price: 0, premium: false, active: true },
      { id: "granola", name: "Granola", price: 0, premium: false, active: true },
      { id: "amendoim", name: "Amendoim", price: 0, premium: false, active: true },
      { id: "pacoca", name: "Paçoca", price: 0, premium: false, active: true },
      { id: "leite-po", name: "Leite em pó", price: 0, premium: false, active: true },
      { id: "confete", name: "Confete", price: 0, premium: false, active: true },
      { id: "coco", name: "Coco ralado", price: 0, premium: false, active: true },
      { id: "leite-condensado", name: "Leite condensado", price: 0, premium: false, active: true },
      { id: "bis", name: "Bis", price: 0, premium: false, active: true },
      { id: "morango", name: "Morango", price: 3, premium: true, active: true },
      { id: "kiwi", name: "Kiwi", price: 3, premium: true, active: true },
      { id: "creme-avela", name: "Creme de avelã", price: 3, premium: true, active: true },
      { id: "oreo", name: "Oreo (bolacha)", price: 3, premium: true, active: true }
    ],
    neighborhoods: [
      ["Aeroporto",13],["Água Branca",14],["Água Branca M",15],["Alto da Julio",12],["Alvorada",10],["Bom Pastor",13],["Cango",10],["Cantelmo",14],["Centro",10],["Centro M",30],["Cristo Rei",10],["Guanabara",11],["Industrial",12],["Ipiranga M",30],["Jardim Floresta",14],["Jardim Itália",12],["Primavera",14],["Seminário",13],["Virgínia",12],["Júpiter",14],["Kennedy",10],["Marmeleiro",30],["Marrecas",12],["Miniguaçu",14],["Monte Rey",12],["Nortão",20],["Nossa Senhora",10],["Nova Petrópolis",12],["Novo Horizonte",12],["Novo Mundo",12],["Padre Ulrico",14],["Passarela M",30],["Pedra Branca M",18],["Pinheirão",15],["Pinheirinho",14],["Raffer",13],["Sadia",15],["Santa Bárbara",20],["São Cristóvão",12],["São Francisco",11],["São Marcos",18],["São Miguel",12],["Terra Nossa",15],["Vila Nova",12]
    ].map(([name, fee], index) => ({ id: `zone-${index+1}`, name, fee, active: true }))
  };

  let catalog = structuredClone(defaults);
  let cart = loadCart();
  let category = "all";
  let currentProduct = null;
  let freeSelected = new Set();
  let premiumSelected = new Set();
  let quantity = 1;
  let deliveryMode = "delivery";
  let payment = "pix";
  let supabaseClient = null;
  let submittingOrder = false;
  let lastOrderFingerprint = "";
  let lastOrderNumber = "";
  let lastTrackingToken = "";

  const $ = (id) => document.getElementById(id);
  const qsa = (selector, root = document) => [...root.querySelectorAll(selector)];

  function money(value) { return BRL.format(Number(value || 0)); }
  function escapeHtml(value = "") { return String(value).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }
  function slugLabel(cat) { return cat === "marmita" ? "Marmita" : "Açaí"; }
  function showToast(text) { const t = $("toast"); t.textContent = text; t.classList.add("show"); clearTimeout(showToast._t); showToast._t = setTimeout(() => t.classList.remove("show"), 2600); }

  function normalizePlace(value = "") {
    return String(value)
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function setLocationStatus(text, type = "") {
    const el = $("locationStatus");
    el.hidden = false;
    el.className = "location-status" + (type ? " " + type : "");
    el.innerHTML = text;
  }

  function matchDeliveryZone(address = {}) {
    const rawDistrict = address.suburb || address.neighbourhood || address.city_district || address.quarter || address.hamlet || address.village || "";
    const district = normalizePlace(rawDistrict);
    const municipality = normalizePlace(address.city || address.town || address.municipality || address.county || "");
    const active = catalog.neighborhoods.filter(z => z.active !== false);

    if (municipality.includes("marmeleiro")) {
      const marmeleiroPreferred = active.find(z => {
        const zn = normalizePlace(z.name);
        return district && (zn === district + " m" || zn.replace(/ m$/, "") === district && / m$/.test(zn));
      });
      if (marmeleiroPreferred) return { zone: marmeleiroPreferred, detected: rawDistrict || "Marmeleiro" };
      const marmeleiroZone = active.find(z => normalizePlace(z.name) === "marmeleiro");
      if (marmeleiroZone) return { zone: marmeleiroZone, detected: rawDistrict || "Marmeleiro" };
    }

    const exact = active.find(z => normalizePlace(z.name) === district);
    if (exact) return { zone: exact, detected: rawDistrict };

    const close = active.find(z => {
      const zn = normalizePlace(z.name).replace(/ m$/, "");
      return district && (district.includes(zn) || zn.includes(district));
    });
    if (close) return { zone: close, detected: rawDistrict };

    return { zone: null, detected: rawDistrict };
  }

  async function reverseGeocode(latitude, longitude) {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("lat", String(latitude));
    url.searchParams.set("lon", String(longitude));
    url.searchParams.set("zoom", "18");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("accept-language", "pt-BR");
    const response = await fetch(url.toString(), { headers: { "Accept": "application/json" } });
    if (!response.ok) throw new Error("Falha ao identificar o bairro.");
    return response.json();
  }

  async function useCurrentLocation() {
    if (!navigator.geolocation) {
      setLocationStatus("Este aparelho não oferece localização pelo navegador. Selecione o bairro manualmente.", "warn");
      return;
    }
    const btn = $("useLocationBtn");
    btn.classList.add("loading");
    btn.querySelector("strong").textContent = "Localizando...";
    setLocationStatus("Aguardando a permissão de localização do aparelho.");

    navigator.geolocation.getCurrentPosition(async position => {
      try {
        const data = await reverseGeocode(position.coords.latitude, position.coords.longitude);
        const address = data.address || {};
        const { zone, detected } = matchDeliveryZone(address);
        if (!zone) {
          setLocationStatus(`Local encontrado${detected ? `: <strong>${escapeHtml(detected)}</strong>` : ""}, mas não consegui relacionar com segurança a uma taxa. Escolha o bairro manualmente. <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a>`, "warn");
          return;
        }
        $("neighborhoodSelect").value = zone.id;
        renderSummary();
        const place = detected || zone.name;
        setLocationStatus(`Bairro identificado: <strong>${escapeHtml(place)}</strong>. Taxa aplicada: <strong>${money(zone.fee)}</strong>. <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a>`, "ok");
        showToast(`Taxa de ${money(zone.fee)} aplicada para ${zone.name}.`);
      } catch (error) {
        console.warn(error);
        setLocationStatus("Não consegui identificar o bairro agora. Você pode selecionar manualmente sem problema.", "warn");
      } finally {
        btn.classList.remove("loading");
        btn.querySelector("strong").textContent = "Usar minha localização";
      }
    }, error => {
      const messages = {
        1: "A permissão de localização foi negada. Selecione o bairro manualmente.",
        2: "Não foi possível obter sua localização. Selecione o bairro manualmente.",
        3: "A localização demorou demais. Tente novamente ou selecione o bairro manualmente."
      };
      setLocationStatus(messages[error.code] || "Não foi possível usar sua localização. Selecione o bairro manualmente.", "warn");
      btn.classList.remove("loading");
      btn.querySelector("strong").textContent = "Usar minha localização";
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 300000 });
  }

  function loadCart() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; }
  }
  function saveCart() { localStorage.setItem(STORAGE_KEY, JSON.stringify(cart)); renderCartBadge(); renderCart(); }

  async function loadRemoteCatalog() {
    const cfg = window.ACAI_MOVI_CONFIG || {};
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey || !window.supabase) return;
    try {
      supabaseClient = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
      const client = supabaseClient;
      const [products, complements, zones, settings] = await Promise.all([
        client.from("products").select("*").order("sort_order"),
        client.from("complements").select("*").order("sort_order"),
        client.from("delivery_zones").select("*").order("name"),
        client.from("store_settings").select("data").eq("id", "main").maybeSingle()
      ]);
      if (!products.error && products.data?.length) catalog.products = products.data;
      if (!complements.error && complements.data?.length) catalog.complements = complements.data;
      if (!zones.error && zones.data?.length) catalog.neighborhoods = zones.data;
      if (!settings.error && settings.data?.data) catalog.store = { ...catalog.store, ...settings.data.data };
    } catch (error) { console.warn("Catálogo remoto indisponível; usando dados locais.", error); }
  }

  function renderProducts() {
    const search = $("searchInput").value.trim().toLowerCase();
    const products = catalog.products.filter(p => p.active !== false).filter(p => category === "all" || p.category === category).filter(p => !search || `${p.name} ${p.description}`.toLowerCase().includes(search));
    $("productGrid").innerHTML = products.length ? products.map(p => `
      <article class="product-card ${p.featured ? "featured" : ""}" data-id="${escapeHtml(p.id)}" tabindex="0">
        <div class="product-image-wrap">
          ${p.featured ? '<span class="badge">⭐ Mais pedido</span>' : ''}
          <img src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.name)}" loading="lazy" />
        </div>
        <div class="product-body">
          <span class="product-category">${slugLabel(p.category)}</span>
          <h3>${escapeHtml(p.name)}</h3>
          <p>${escapeHtml(p.description)}</p>
          <div class="product-bottom"><strong>${money(p.price)}</strong><button type="button" data-open-product="${escapeHtml(p.id)}">Adicionar</button></div>
        </div>
      </article>
    `).join("") : '<div class="empty-products"><span>🔎</span><strong>Nenhum item encontrado</strong><p>Tente buscar por outro nome.</p></div>';

    qsa("[data-open-product]").forEach(btn => btn.addEventListener("click", (e) => { e.stopPropagation(); openProduct(btn.dataset.openProduct); }));
    qsa(".product-card").forEach(card => {
      card.addEventListener("click", () => openProduct(card.dataset.id));
      card.addEventListener("keydown", e => { if (e.key === "Enter") openProduct(card.dataset.id); });
    });
  }

  function renderComplementShowcase() {
    $("complementShowcase").innerHTML = catalog.complements.filter(c => c.active !== false).map(c => `<span class="showcase-pill ${Number(c.price) > 0 ? "premium" : ""}">${escapeHtml(c.name)}${Number(c.price) > 0 ? ` <b>+${money(c.price)}</b>` : ""}</span>`).join("");
  }

  function renderZones() {
    const active = catalog.neighborhoods.filter(z => z.active !== false).sort((a,b) => Number(a.fee)-Number(b.fee));
    $("zonePreview").innerHTML = active.slice(0, 7).map(z => `<div><span>${escapeHtml(z.name)}</span><strong>${money(z.fee)}</strong></div>`).join("") + `<button type="button" id="showAllZones">Ver ${active.length} bairros</button>`;
    $("neighborhoodSelect").innerHTML = '<option value="">Selecione o bairro</option>' + active.sort((a,b)=>a.name.localeCompare(b.name,"pt-BR")).map(z => `<option value="${escapeHtml(z.id)}">${escapeHtml(z.name)} — ${money(z.fee)}</option>`).join("");
    $("showAllZones")?.addEventListener("click", () => { openCart(); setTimeout(() => $("neighborhoodSelect").focus(), 100); });
  }

  function storeHour() {
    const parts = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
    const hour = Number(parts.find(p => p.type === "hour")?.value || 0);
    const minute = Number(parts.find(p => p.type === "minute")?.value || 0);
    const current = hour * 60 + minute;
    const open = current >= 13*60 && current < 22*60;
    const el = $("storeStatus"); el.classList.toggle("closed", !open); el.querySelector("b").textContent = open ? "Aberto até 22h" : "Fechado • abre às 13h";
  }

  function openProduct(id) {
    currentProduct = catalog.products.find(p => p.id === id); if (!currentProduct) return;
    freeSelected = new Set(); premiumSelected = new Set(); quantity = 1;
    $("itemNotes").value = "";
    $("modalProductImage").src = currentProduct.image_url;
    $("modalProductImage").alt = currentProduct.name;
    $("productModalTitle").textContent = currentProduct.name;
    $("modalProductDescription").textContent = currentProduct.description;
    $("modalBasePrice").textContent = money(currentProduct.price);
    $("freeRuleText").textContent = `Escolha exatamente ${currentProduct.free_limit} opções. Essa etapa é obrigatória.`;
    renderBuilder();
    $("productOverlay").hidden = false;
    document.body.classList.add("no-scroll");
  }

  function closeProduct() { $("productOverlay").hidden = true; currentProduct = null; document.body.classList.remove("no-scroll"); }

  function renderBuilder() {
    const free = catalog.complements.filter(c => c.active !== false && Number(c.price) === 0);
    const premium = catalog.complements.filter(c => c.active !== false && Number(c.price) > 0);
    $("freeChoices").innerHTML = free.map(c => `<button type="button" class="choice ${freeSelected.has(c.id)?"selected":""}" data-free="${escapeHtml(c.id)}"><span class="check">✓</span><b>${escapeHtml(c.name)}</b><small>Incluso</small></button>`).join("");
    $("premiumChoices").innerHTML = premium.map(c => `<button type="button" class="choice premium ${premiumSelected.has(c.id)?"selected":""}" data-premium="${escapeHtml(c.id)}"><span class="check">✓</span><b>${escapeHtml(c.name)}</b><small>+ ${money(c.price)}</small></button>`).join("");
    $("freeCounter").textContent = `${freeSelected.size}/${currentProduct.free_limit}`;
    $("freeCounter").classList.toggle("done", freeSelected.size === Number(currentProduct.free_limit));
    $("qtyValue").textContent = quantity;
    const premiumTotal = [...premiumSelected].reduce((sum,id) => sum + Number(catalog.complements.find(c=>c.id===id)?.price || 0),0);
    $("addButtonTotal").textContent = money((Number(currentProduct.price)+premiumTotal)*quantity);
    $("addToCartBtn").disabled = freeSelected.size !== Number(currentProduct.free_limit);

    qsa("[data-free]", $("freeChoices")).forEach(btn => btn.addEventListener("click", () => {
      const id = btn.dataset.free;
      if (freeSelected.has(id)) freeSelected.delete(id);
      else if (freeSelected.size < Number(currentProduct.free_limit)) freeSelected.add(id);
      else showToast(`Você já escolheu ${currentProduct.free_limit} complementos inclusos.`);
      renderBuilder();
    }));
    qsa("[data-premium]", $("premiumChoices")).forEach(btn => btn.addEventListener("click", () => { const id=btn.dataset.premium; premiumSelected.has(id)?premiumSelected.delete(id):premiumSelected.add(id); renderBuilder(); }));
  }

  function addCurrentToCart() {
    if (!currentProduct || freeSelected.size !== Number(currentProduct.free_limit)) return;
    const premiums = [...premiumSelected];
    const premiumUnit = premiums.reduce((sum,id)=>sum+Number(catalog.complements.find(c=>c.id===id)?.price || 0),0);
    cart.push({
      key: `${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
      product_id: currentProduct.id,
      name: currentProduct.name,
      image_url: currentProduct.image_url,
      base_price: Number(currentProduct.price),
      unit_price: Number(currentProduct.price)+premiumUnit,
      quantity,
      free: [...freeSelected],
      premium: premiums,
      notes: $("itemNotes").value.trim()
    });
    saveCart(); closeProduct(); showToast("Item adicionado ao pedido."); openCart();
  }

  function cartSubtotal() { return cart.reduce((sum,i)=>sum + Number(i.unit_price)*Number(i.quantity),0); }
  function selectedZone() { return catalog.neighborhoods.find(z => z.id === $("neighborhoodSelect").value); }
  function deliveryFee() { return deliveryMode === "delivery" ? Number(selectedZone()?.fee || 0) : 0; }
  function grandTotal() { return cartSubtotal() + deliveryFee(); }

  function renderCartBadge() {
    const count = cart.reduce((sum,i)=>sum+Number(i.quantity),0);
    $("cartCount").textContent = count; $("mobileCartCount").textContent = count; $("mobileCartTotal").textContent = money(cartSubtotal());
    $("mobileCartBar").hidden = count === 0;
  }

  function renderCart() {
    const content = $("cartContent");
    if (!cart.length) {
      content.innerHTML = '<div class="empty-cart"><span>🛍️</span><h3>Seu pedido está vazio</h3><p>Escolha um açaí no cardápio para começar.</p><button type="button" id="backToMenu">Ver cardápio</button></div>';
      $("checkoutPanel").hidden = true;
      $("backToMenu")?.addEventListener("click", () => { closeCart(); document.querySelector("#cardapio").scrollIntoView({behavior:"smooth"}); });
      return;
    }
    content.innerHTML = `<div class="cart-list">${cart.map(item => {
      const freeNames = item.free.map(id => catalog.complements.find(c=>c.id===id)?.name).filter(Boolean).join(", ");
      const premiumNames = item.premium.map(id => catalog.complements.find(c=>c.id===id)?.name).filter(Boolean).join(", ");
      return `<article class="cart-item">
        <img src="${escapeHtml(item.image_url)}" alt="" />
        <div class="cart-item-info"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(freeNames)}</small>${premiumNames?`<small>Extras: ${escapeHtml(premiumNames)}</small>`:""}${item.notes?`<small>Obs.: ${escapeHtml(item.notes)}</small>`:""}<b>${money(item.unit_price * item.quantity)}</b></div>
        <div class="cart-item-actions"><button type="button" data-dec="${item.key}">−</button><span>${item.quantity}</span><button type="button" data-inc="${item.key}">+</button><button class="remove-item" type="button" data-remove="${item.key}">Remover</button></div>
      </article>`;
    }).join("")}</div>`;
    $("checkoutPanel").hidden = false;
    qsa("[data-dec]").forEach(b=>b.addEventListener("click",()=>changeItemQty(b.dataset.dec,-1)));
    qsa("[data-inc]").forEach(b=>b.addEventListener("click",()=>changeItemQty(b.dataset.inc,1)));
    qsa("[data-remove]").forEach(b=>b.addEventListener("click",()=>{cart=cart.filter(i=>i.key!==b.dataset.remove);saveCart();}));
    renderSummary();
  }

  function changeItemQty(key, delta) { cart = cart.flatMap(i => i.key !== key ? [i] : (i.quantity + delta <= 0 ? [] : [{...i,quantity:i.quantity+delta}])); saveCart(); }

  function renderPaymentHelp() {
    const text = payment === "pix"
      ? "<strong>PIX:</strong> o pedido fica aguardando a confirmação do pagamento. Depois que a equipe confirmar, ele entra em preparo."
      : payment === "card"
        ? "<strong>Cartão:</strong> pagamento na entrega. A equipe pode iniciar o preparo antes do pagamento."
        : "<strong>Dinheiro:</strong> pagamento na entrega. Informe o troco se precisar.";
    $("paymentHelp").innerHTML = text;
  }

  function renderSummary() {
    if (!cart.length) return;
    const fee = deliveryFee();
    $("summaryBox").innerHTML = `<div><span>Subtotal</span><strong>${money(cartSubtotal())}</strong></div><div><span>${deliveryMode === "delivery" ? "Entrega" : "Retirada"}</span><strong>${deliveryMode === "delivery" ? (selectedZone()?money(fee):"Selecione o bairro") : "Grátis"}</strong></div><div class="summary-total"><span>Total</span><strong>${money(grandTotal())}</strong></div>`;
    $("checkoutTotal").textContent = money(grandTotal());
    $("deliveryFields").hidden = deliveryMode === "pickup";
    $("changeField").hidden = payment !== "cash";
  }

  function openCart() { $("cartOverlay").hidden = false; document.body.classList.add("no-scroll"); renderCart(); }
  function closeCart() { $("cartOverlay").hidden = true; document.body.classList.remove("no-scroll"); }

  function validateCheckout() {
    if (!cart.length) return "Seu pedido está vazio.";
    if (!$("customerName").value.trim()) return "Informe seu nome.";
    if (!$("customerPhone").value.trim()) return "Informe seu telefone.";
    if (deliveryMode === "delivery") {
      if (!selectedZone()) return "Selecione o bairro da entrega.";
      if (!$("streetInput").value.trim()) return "Informe a rua.";
      if (!$("numberInput").value.trim()) return "Informe o número.";
    }
    return "";
  }

  function generateOrderNumber() {
    const date = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "2-digit"
    }).format(new Date()).replace(/\D/g, "");
    const random = globalThis.crypto?.randomUUID
      ? globalThis.crypto.randomUUID().slice(0, 6).toUpperCase()
      : Math.random().toString(36).slice(2, 8).toUpperCase();
    return `MV-${date}-${random}`;
  }

  function orderItemsForStorage() {
    return cart.map(item => ({
      product_id: item.product_id,
      name: item.name,
      quantity: Number(item.quantity),
      base_price: Number(item.base_price),
      unit_price: Number(item.unit_price),
      included: item.free.map(id => catalog.complements.find(c => c.id === id)?.name).filter(Boolean),
      extras: item.premium.map(id => {
        const extra = catalog.complements.find(c => c.id === id);
        return extra ? { id: extra.id, name: extra.name, price: Number(extra.price) } : null;
      }).filter(Boolean),
      notes: item.notes || ""
    }));
  }

  function buildOrderPayload(orderNumber, trackingToken = "") {
    const zone = selectedZone();
    return {
      order_number: orderNumber,
      ...(trackingToken ? { tracking_token: trackingToken } : {}),
      customer_name: $("customerName").value.trim(),
      customer_phone: $("customerPhone").value.trim(),
      delivery_mode: deliveryMode,
      neighborhood: deliveryMode === "delivery" ? (zone?.name || null) : null,
      street: deliveryMode === "delivery" ? $("streetInput").value.trim() : null,
      street_number: deliveryMode === "delivery" ? $("numberInput").value.trim() : null,
      address_complement: deliveryMode === "delivery" ? ($("addressComplement").value.trim() || null) : null,
      reference: deliveryMode === "delivery" ? ($("referenceInput").value.trim() || null) : null,
      payment,
      change_for: payment === "cash" ? ($("changeInput").value.trim() || null) : null,
      items: orderItemsForStorage(),
      subtotal: Number(cartSubtotal().toFixed(2)),
      delivery_fee: Number(deliveryFee().toFixed(2)),
      total: Number(grandTotal().toFixed(2)),
      notes: $("orderNotes").value.trim() || null,
      status: "new",
      source: "site"
    };
  }

  function currentOrderFingerprint() {
    const payload = buildOrderPayload("");
    delete payload.order_number;
    delete payload.tracking_token;
    return JSON.stringify(payload);
  }

  async function saveOrderRecord(orderNumber, trackingToken) {
    if (!supabaseClient) return { ok: false, error: new Error("Banco de pedidos indisponível.") };
    const payload = buildOrderPayload(orderNumber, trackingToken);
    const { error } = await supabaseClient.from("orders").insert(payload);
    if (error) {
      console.error("Falha ao registrar pedido:", error);
      return { ok: false, error };
    }
    return { ok: true, payload };
  }

  function buildOrderMessage(orderNumber, trackingToken) {
    const trackingUrl = new URL("acompanhar-pedido.html", window.location.href);
    trackingUrl.searchParams.set("token", trackingToken);
    const paymentLabel = payment === "pix" ? "PIX — aguardando confirmação" : payment === "card" ? "Cartão — pagamento na entrega" : "Dinheiro — pagamento na entrega";
    const lines = [
      `🍧 *NOVO PEDIDO — AÇAÍ MOVÍ*`,
      `Pedido: *${orderNumber}*`,
      ``,
      ...cart.flatMap((item,index)=>{
        const free = item.free.map(id=>catalog.complements.find(c=>c.id===id)?.name).filter(Boolean);
        const premium = item.premium.map(id=>{const c=catalog.complements.find(x=>x.id===id);return c?`${c.name} (+${money(c.price)})`:null;}).filter(Boolean);
        return [
          `*${index+1}. ${item.quantity}x ${item.name}* — ${money(item.unit_price*item.quantity)}`,
          `Inclusos: ${free.join(", ")}`,
          premium.length ? `Extras: ${premium.join(", ")}` : null,
          item.notes ? `Obs. item: ${item.notes}` : null,
          ``
        ].filter(v=>v!==null);
      }),
      `👤 *Cliente:* ${$("customerName").value.trim()}`,
      `📱 *Telefone:* ${$("customerPhone").value.trim()}`,
      deliveryMode === "pickup" ? `🏪 *Retirada no local*` : `📍 *Entrega:* ${selectedZone().name} — ${money(selectedZone().fee)}`,
      deliveryMode === "delivery" ? `🏠 *Endereço:* ${$("streetInput").value.trim()}, ${$("numberInput").value.trim()}${$("addressComplement").value.trim()?` — ${$("addressComplement").value.trim()}`:""}` : null,
      deliveryMode === "delivery" && $("referenceInput").value.trim() ? `🧭 *Referência:* ${$("referenceInput").value.trim()}` : null,
      `💳 *Pagamento:* ${paymentLabel}`,
      payment === "cash" && $("changeInput").value.trim() ? `💵 *Troco para:* R$ ${$("changeInput").value.trim()}` : null,
      $("orderNotes").value.trim() ? `📝 *Observação:* ${$("orderNotes").value.trim()}` : null,
      ``,
      `Subtotal: ${money(cartSubtotal())}`,
      deliveryMode === "delivery" ? `Entrega: ${money(deliveryFee())}` : `Retirada: Grátis`,
      `*TOTAL: ${money(grandTotal())}*`,
      ``,
      `📲 *Acompanhar pedido:* ${trackingUrl.href}`
    ].filter(v=>v!==null);
    return lines.join("\n");
  }

  async function finishOrder() {
    if (submittingOrder) return;
    const validationError = validateCheckout();
    if (validationError) { showToast(validationError); return; }

    submittingOrder = true;
    const button = $("finishOrderBtn");
    button.disabled = true;

    try {
      const fingerprint = currentOrderFingerprint();
      let orderNumber = lastOrderNumber;
      let trackingToken = lastTrackingToken;

      if (!orderNumber || !trackingToken || fingerprint !== lastOrderFingerprint) {
        orderNumber = generateOrderNumber();
        trackingToken = globalThis.crypto?.randomUUID
          ? globalThis.crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        showToast("Registrando seu pedido...");
        const saved = await saveOrderRecord(orderNumber, trackingToken);
        if (!saved.ok) {
          showToast("Não consegui registrar o pedido. Tente novamente em alguns segundos.");
          return;
        }
        lastOrderFingerprint = fingerprint;
        lastOrderNumber = orderNumber;
        lastTrackingToken = trackingToken;
        localStorage.setItem("acai-movi-last-order", JSON.stringify({ orderNumber, trackingToken }));
      }

      const message = buildOrderMessage(orderNumber, trackingToken);
      try {
        await navigator.clipboard.writeText(message);
        showToast(`Pedido ${orderNumber} registrado. Abrindo WhatsApp...`);
      } catch {
        showToast(`Pedido ${orderNumber} registrado. Abrindo WhatsApp...`);
      }

      const target = catalog.store.whatsapp_url || whatsappUrl;
      setTimeout(() => window.open(target, "_blank", "noopener,noreferrer"), 180);
    } finally {
      setTimeout(() => {
        submittingOrder = false;
        button.disabled = false;
      }, 1200);
    }
  }

  function bindEvents() {
    $("searchInput").addEventListener("input", renderProducts);
    qsa("[data-category]").forEach(btn => btn.addEventListener("click", () => { category=btn.dataset.category; qsa("[data-category]").forEach(x=>x.classList.toggle("active",x===btn)); renderProducts(); }));
    $("closeProductBtn").addEventListener("click", closeProduct); $("productOverlay").addEventListener("click",e=>{if(e.target===$("productOverlay"))closeProduct();});
    $("qtyMinus").addEventListener("click",()=>{quantity=Math.max(1,quantity-1);renderBuilder();}); $("qtyPlus").addEventListener("click",()=>{quantity+=1;renderBuilder();});
    $("addToCartBtn").addEventListener("click",addCurrentToCart);
    $("openCartBtn").addEventListener("click",openCart); $("mobileCartBar").addEventListener("click",openCart); $("closeCartBtn").addEventListener("click",closeCart); $("cartOverlay").addEventListener("click",e=>{if(e.target===$("cartOverlay"))closeCart();});
    $("deliveryPreviewBtn").addEventListener("click",()=>{openCart();setTimeout(()=>$("neighborhoodSelect").focus(),100);});
    qsa("[data-mode]").forEach(btn=>btn.addEventListener("click",()=>{deliveryMode=btn.dataset.mode;qsa("[data-mode]").forEach(x=>x.classList.toggle("active",x===btn));renderSummary();}));
    qsa("[data-payment]").forEach(btn=>btn.addEventListener("click",()=>{payment=btn.dataset.payment;qsa("[data-payment]").forEach(x=>x.classList.toggle("active",x===btn));renderPaymentHelp();renderSummary();}));
    $("neighborhoodSelect").addEventListener("change",renderSummary);
    $("useLocationBtn").addEventListener("click",useCurrentLocation);
    $("finishOrderBtn").addEventListener("click",finishOrder);
    document.addEventListener("keydown",e=>{if(e.key==="Escape"){if(!$("productOverlay").hidden)closeProduct();else if(!$("cartOverlay").hidden)closeCart();}});
  }

  async function init() {
    await loadRemoteCatalog();
    renderProducts(); renderComplementShowcase(); renderZones(); renderCartBadge(); renderCart(); renderPaymentHelp(); storeHour(); bindEvents();
    setInterval(storeHour,60000);
  }
  init();
})();
