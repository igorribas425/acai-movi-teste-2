(() => {
  "use strict";

  const cfg = window.ACAI_MOVI_CONFIG || {};
  const section = document.querySelector('[data-section="financeiro"]');
  if (!section || !cfg.supabaseUrl || !cfg.supabaseAnonKey || !window.supabase) return;

  const db = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  const $ = id => document.getElementById(id);
  const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const money = value => brl.format(Number(value) || 0);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
  const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone:"America/Sao_Paulo", year:"numeric", month:"2-digit", day:"2-digit" });
  const formatDay = date => {
    const parts = Object.fromEntries(dayFormat.formatToParts(date).map(p => [p.type, p.value]));
    return parts.year + "-" + parts.month + "-" + parts.day;
  };
  const today = () => formatDay(new Date());
  const moveDays = (day, amount) => {
    const d = new Date(day + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + amount);
    return d.toISOString().slice(0, 10);
  };
  const periodStart = $("financeStart");
  const periodEnd = $("financeEnd");
  const statusEl = $("financeStatus");
  let orders = [];
  let busy = false;

  const methods = { pix:"PIX", card:"Cartão", cash:"Dinheiro" };
  const paymentMethod = order => methods[order.payment] || "Outro";
  const classify = order => {
    if (order.status === "cancelled" || ["cancelled", "refunded"].includes(order.payment_status)) return "cancelled";
    if (order.payment_status === "paid") return "received";
    return "pending";
  };
  const dateLabel = value => {
    if (!value) return "-";
    const d = new Date(value);
    return Number.isNaN(d.valueOf()) ? "-" : new Intl.DateTimeFormat("pt-BR", {
      timeZone:"America/Sao_Paulo", day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit"
    }).format(d);
  };
  const setMessage = (message, error = false) => {
    statusEl.textContent = message;
    statusEl.classList.toggle("finance-error", error);
  };
  const setPeriod = type => {
    const end = today();
    periodEnd.value = end;
    periodStart.value = type === "today" ? end
      : type === "7days" ? moveDays(end, -6)
      : type === "30days" ? moveDays(end, -29)
      : end.slice(0, 7) + "-01";
    document.querySelectorAll("[data-finance-period]").forEach(btn =>
      btn.classList.toggle("active", btn.dataset.financePeriod === type));
    loadFinance();
  };

  function renderBars(received) {
    const data = received.filter(o => o.created_at);
    const days = Math.round((Date.parse(periodEnd.value) - Date.parse(periodStart.value)) / 86400000) + 1;
    const monthly = days > 45;
    const values = new Map();
    for (const order of data) {
      const day = formatDay(new Date(order.created_at));
      const key = monthly ? day.slice(0, 7) : day;
      values.set(key, (values.get(key) || 0) + (Number(order.total) || 0));
    }
    let cursor = monthly ? periodStart.value.slice(0, 7) : periodStart.value;
    const stop = monthly ? periodEnd.value.slice(0, 7) : periodEnd.value;
    const buckets = [];
    for (let i = 0; cursor <= stop && i < 120; i++) {
      buckets.push({ key:cursor, value: values.get(cursor) || 0 });
      if (monthly) {
        const d = new Date(cursor + "-01T12:00:00Z");
        d.setUTCMonth(d.getUTCMonth() + 1);
        cursor = d.toISOString().slice(0, 7);
      } else cursor = moveDays(cursor, 1);
    }
    const max = Math.max(1, ...buckets.map(b => b.value));
    $("financeBars").innerHTML = buckets.map(b => {
      const label = monthly ? b.key.slice(5, 7) + "/" + b.key.slice(2, 4) : b.key.slice(8, 10) + "/" + b.key.slice(5, 7);
      const height = b.value ? Math.max(6, Math.round(b.value / max * 100)) : 2;
      return '<div class="finance-bar-col" title="' + esc(label + ": " + money(b.value)) + '">' +
        '<span>' + (b.value ? esc(money(b.value)) : "") + '</span>' +
        '<div class="finance-bar-track"><div class="finance-bar-fill" style="height:' + height + '%"></div></div>' +
        '<small>' + esc(label) + '</small></div>';
    }).join("") || '<p class="finance-empty">Nenhuma venda no período.</p>';
  }

  function render() {
    const received = orders.filter(o => classify(o) === "received");
    const pending = orders.filter(o => classify(o) === "pending");
    const cancelled = orders.filter(o => classify(o) === "cancelled");
    const sum = list => list.reduce((total, o) => total + (Number(o.total) || 0), 0);
    const total = sum(received);
    const cards = [
      ["Recebido", money(total), received.length + " pedido(s) com pagamento confirmado"],
      ["A receber", money(sum(pending)), pending.length + " pedido(s) sem pagamento confirmado"],
      ["Cancelado / estornado", money(sum(cancelled)), cancelled.length + " pedido(s) fora do faturamento"],
      ["Ticket médio", money(received.length ? total / received.length : 0), "Média dos pedidos recebidos"]
    ];
    $("financeKpis").innerHTML = cards.map(([title, value, sub]) =>
      '<article class="finance-kpi"><span>' + esc(title) + '</span><strong>' + esc(value) +
      '</strong><small>' + esc(sub) + '</small></article>').join("");

    const groups = ["pix", "card", "cash", "other"].map(key => {
      const subset = received.filter(o => (methods[o.payment] ? o.payment : "other") === key);
      return { label:key === "other" ? "Outros" : methods[key], count:subset.length, value:sum(subset) };
    });
    $("financePaymentMethods").innerHTML = groups.map(g =>
      '<div class="finance-method"><span>' + esc(g.label) + '<small>' + g.count + ' pago(s)</small></span><strong>' +
      esc(money(g.value)) + '</strong></div>').join("");

    renderBars(received);
    $("financeTableBody").innerHTML = orders.slice(0, 100).map(o => {
      const state = classify(o);
      const stateName = state === "received" ? "Recebido" : state === "pending" ? "Pendente" : "Cancelado/estornado";
      return '<tr><td><b>' + esc(o.order_number || String(o.id).slice(0, 8)) + '</b></td><td>' +
        esc(dateLabel(o.created_at)) + '</td><td>' + esc(paymentMethod(o)) + '</td><td><span class="finance-tag ' +
        state + '">' + stateName + '</span></td><td class="finance-amount">' + esc(money(o.total)) + '</td></tr>';
    }).join("") || '<tr><td colspan="5" class="finance-empty">Nenhum pedido no período escolhido.</td></tr>';
    $("financeTableCaption").textContent = "Exibindo " + Math.min(orders.length, 100) + " de " + orders.length +
      " pedido(s). O resumo e o CSV consideram todos os pedidos do período.";
    $("financeExport").disabled = !orders.length;
  }

  async function loadFinance() {
    if (busy) return;
    const start = periodStart.value;
    const end = periodEnd.value;
    if (!start || !end || start > end) {
      setMessage("Selecione um período válido.", true);
      return;
    }
    busy = true;
    $("financeRefresh").disabled = true;
    $("financeExport").disabled = true;
    setMessage("Carregando financeiro...");
    try {
      const { data:{ user }, error: authError } = await db.auth.getUser();
      if (authError || !user) throw new Error("Entre novamente no painel para consultar os valores.");
      const { data:admin, error:adminError } = await db.from("admin_users")
        .select("user_id").eq("user_id", user.id).maybeSingle();
      if (adminError || !admin) throw new Error("Sua conta não está autorizada a consultar o financeiro.");
      const first = new Date(start + "T00:00:00-03:00").toISOString();
      const last = new Date(moveDays(end, 1) + "T00:00:00-03:00").toISOString();
      const collected = [];
      const pageSize = 500;
      for (let offset = 0; ; offset += pageSize) {
        const {data, error} = await db.from("orders")
          .select("id,order_number,created_at,total,payment,payment_status,status")
          .gte("created_at", first).lt("created_at", last)
          .order("created_at", { ascending:false })
          .range(offset, offset + pageSize - 1);
        if (error) throw error;
        collected.push(...(data || []));
        if (!data || data.length < pageSize) break;
        if (collected.length >= 100000) throw new Error("O período tem pedidos demais. Escolha um intervalo menor.");
      }
      orders = collected;
      render();
      setMessage("Atualizado em " + new Intl.DateTimeFormat("pt-BR", {
        timeZone:"America/Sao_Paulo", hour:"2-digit", minute:"2-digit"
      }).format(new Date()) + " • Valores por data do pedido.");
    } catch (err) {
      orders = [];
      render();
      setMessage(err.message || "Falha ao carregar o financeiro. Tente novamente.", true);
    } finally {
      busy = false;
      $("financeRefresh").disabled = false;
    }
  }

  const csvValue = value => {
    let str = String(value ?? "");
    if (/^[\s]*[=+\-@]/.test(str)) str = "'" + str;
    return '"' + str.replace(/"/g, '""') + '"';
  };
  function exportCsv() {
    if (!orders.length) return;
    const rows = [["Pedido","Data do pedido","Forma de pagamento","Situação financeira","Valor (R$)"]];
    orders.forEach(o => rows.push([
      o.order_number || o.id, dateLabel(o.created_at), paymentMethod(o),
      classify(o) === "received" ? "Recebido" : classify(o) === "pending" ? "Pendente" : "Cancelado/estornado",
      (Number(o.total) || 0).toFixed(2).replace(".", ",")
    ]));
    const csv = "\uFEFF" + rows.map(row => row.map(csvValue).join(";")).join("\r\n");
    const blob = new Blob([csv], {type:"text/csv;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "acai-movi-financeiro-" + periodStart.value + "-a-" + periodEnd.value + ".csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  $("financeRefresh").addEventListener("click", loadFinance);
  $("financeExport").addEventListener("click", exportCsv);
  document.querySelectorAll("[data-finance-period]").forEach(btn =>
    btn.addEventListener("click", () => setPeriod(btn.dataset.financePeriod)));
  [periodStart, periodEnd].forEach(el => el.addEventListener("change", () => {
    document.querySelectorAll("[data-finance-period]").forEach(btn => btn.classList.remove("active"));
    loadFinance();
  }));
  document.querySelector('[data-tab="financeiro"]').addEventListener("click", () => {
    if (!periodStart.value) setPeriod("month");
    else loadFinance();
  });
})();