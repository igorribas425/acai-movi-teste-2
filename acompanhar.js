(() => {
  const cfg = window.ACAI_MOVI_CONFIG || {};
  const token = new URLSearchParams(window.location.search).get("token") || "";
  const $ = (id) => document.getElementById(id);
  const BRL = new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"});

  const statusLabels = {
    new: "Pedido recebido",
    confirmed: "Pedido confirmado",
    preparing: "Preparando",
    out_for_delivery: "Saiu para entrega",
    delivered: "Entregue",
    cancelled: "Cancelado"
  };
  const steps = ["new","confirmed","preparing","out_for_delivery","delivered"];
  let client = null;
  let current = null;

  function formatPayment(method){
    return method === "pix" ? "PIX" : method === "card" ? "Cartão" : "Dinheiro";
  }

  function paymentStateLabel(order){
    if(order.payment_status === "paid") return ["Pagamento confirmado","paid"];
    if(order.payment_status === "pay_on_delivery") return ["Pagamento na entrega","delivery"];
    if(order.payment_status === "cancelled") return ["Pagamento cancelado",""];
    if(order.payment_status === "refunded") return ["Pagamento estornado",""];
    return order.payment === "pix" ? ["Aguardando confirmação do PIX",""] : ["Aguardando pagamento",""];
  }

  function showError(){
    $("loadingState").hidden = true;
    $("trackingContent").hidden = true;
    $("errorState").hidden = false;
  }

  function renderTimeline(status){
    const currentIndex = steps.indexOf(status);
    document.querySelectorAll("[data-step]").forEach(el => {
      const idx = steps.indexOf(el.dataset.step);
      el.classList.toggle("done", status === "delivered" ? idx <= currentIndex : idx < currentIndex);
      el.classList.toggle("current", idx === currentIndex && status !== "delivered");
      if(status === "delivered" && el.dataset.step === "delivered") el.classList.add("done");
    });
  }

  function render(order){
    current = order;
    $("loadingState").hidden = true;
    $("errorState").hidden = true;
    $("trackingContent").hidden = false;
    $("orderNumber").textContent = order.order_number;
    $("customerGreeting").textContent = order.customer_name ? "Olá, " + order.customer_name.split(" ")[0] + ". Acompanhe o andamento abaixo." : "Acompanhe seu pedido abaixo.";
    $("mainStatus").textContent = statusLabels[order.status] || order.status;
    $("mainStatus").className = "status-pill" + (order.status === "out_for_delivery" ? " out" : order.status === "delivered" ? " done" : order.status === "cancelled" ? " cancelled" : "");
    $("paymentMethod").textContent = formatPayment(order.payment);
    const pay = paymentStateLabel(order);
    $("paymentState").textContent = pay[0];
    $("paymentState").className = "payment-state" + (pay[1] ? " " + pay[1] : "");
    if(order.status === "cancelled"){
      document.querySelectorAll("[data-step]").forEach(el => el.classList.remove("done","current"));
    } else {
      renderTimeline(order.status);
    }
    $("deliveryConfirm").hidden = order.status !== "out_for_delivery";
    $("deliveryMode").textContent = order.delivery_mode === "pickup" ? "Retirada" : "Entrega";
    $("neighborhood").textContent = order.delivery_mode === "pickup" ? "Retirada no local" : (order.neighborhood || "—");
    $("orderTotal").textContent = BRL.format(Number(order.total || 0));
    $("updatedAt").textContent = "Atualizado às " + new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",hour:"2-digit",minute:"2-digit",second:"2-digit"}).format(new Date());
  }

  async function load(){
    if(!client || !token){ showError(); return; }
    const {data,error} = await client.rpc("get_order_tracking",{p_token:token});
    if(error || !Array.isArray(data) || !data.length){ showError(); return; }
    render(data[0]);
  }

  async function confirmDelivery(){
    if(!current || current.status !== "out_for_delivery") return;
    const btn = $("confirmDeliveryBtn");
    btn.disabled = true;
    btn.textContent = "Confirmando...";
    const {data,error} = await client.rpc("confirm_order_delivery",{p_token:token});
    if(error || !Array.isArray(data) || !data.length){
      btn.disabled = false;
      btn.textContent = "Confirmar recebimento";
      return;
    }
    await load();
    btn.textContent = "Recebimento confirmado";
  }

  async function init(){
    if(!cfg.supabaseUrl || !cfg.supabaseAnonKey || !window.supabase || !token){
      showError();
      return;
    }
    client = window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey);
    $("confirmDeliveryBtn").addEventListener("click",confirmDelivery);
    await load();
    setInterval(load,12000);
  }

  init();
})();