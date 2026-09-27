(() => {
  const cfg = window.ACAI_MOVI_CONFIG || {};
  const ready = Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase);
  const setupScreen = document.getElementById("setupScreen");
  const loginScreen = document.getElementById("loginScreen");
  const dashboard = document.getElementById("dashboard");
  if (!ready) { setupScreen.hidden = false; return; }

  const db = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  let orders = [], products = [], complements = [], zones = [], store = {};
  let orderFilter = "open";
  const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const $ = (id) => document.getElementById(id);
  const money = (value) => BRL.format(Number(value || 0));
  const toast = (msg) => { const el=$("adminToast");el.textContent=msg;el.classList.add("show");clearTimeout(toast._t);toast._t=setTimeout(()=>el.classList.remove("show"),2200); };
  const esc = (v="") => String(v).replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));

  async function isAdmin(id){ const {data,error}=await db.from("admin_users").select("user_id").eq("user_id",id).maybeSingle(); return !error && Boolean(data); }
  async function boot(){
    const {data:{session}}=await db.auth.getSession();
    if (!session?.user || !(await isAdmin(session.user.id))) { loginScreen.hidden=false; return; }
    await loadAll(); dashboard.hidden=false;
  }

  $("loginForm").addEventListener("submit", async e => {
    e.preventDefault();
    $("loginError").textContent="";
    const {data,error}=await db.auth.signInWithPassword({email:$("loginEmail").value.trim(),password:$("loginPassword").value});
    if(error){$("loginError").textContent="E-mail ou senha inválidos.";return;}
    if(!(await isAdmin(data.user.id))){await db.auth.signOut();$("loginError").textContent="Este usuário ainda não está autorizado. Confirme o e-mail do primeiro acesso e tente novamente.";return;}
    loginScreen.hidden=true; await loadAll(); dashboard.hidden=false;
  });

  $("firstAccessBtn").addEventListener("click", async () => {
    $("loginError").textContent="";
    $("firstAccessHelp").hidden=false;
    const email=$("loginEmail").value.trim();
    const password=$("loginPassword").value;
    if(!email || !password){$("loginError").textContent="Preencha e-mail e senha antes de criar o primeiro acesso.";return;}
    if(password.length < 8){$("loginError").textContent="A senha precisa ter pelo menos 8 caracteres.";return;}
    $("firstAccessBtn").disabled=true;
    $("firstAccessBtn").textContent="Enviando confirmação...";
    const {data,error}=await db.auth.signUp({email,password});
    await db.auth.signOut();
    $("firstAccessBtn").disabled=false;
    $("firstAccessBtn").textContent="Primeiro acesso";
    if(error){$("loginError").textContent="Não foi possível iniciar o primeiro acesso. Se a conta já existir, use Entrar no painel.";return;}
    if(data?.session){
      $("loginError").textContent="Por segurança, o acesso administrativo só é liberado após confirmação real do e-mail. Verifique a caixa de entrada e tente novamente.";
      return;
    }
    $("loginError").textContent="Enviamos a confirmação. Abra seu e-mail, confirme o cadastro e depois volte aqui para entrar.";
  });
  $("logoutBtn").addEventListener("click",async()=>{await db.auth.signOut();location.reload();});

  document.querySelectorAll("[data-tab]").forEach(btn=>btn.addEventListener("click",()=>{
    document.querySelectorAll("[data-tab]").forEach(x=>x.classList.toggle("active",x===btn));
    document.querySelectorAll("[data-section]").forEach(s=>s.classList.toggle("active",s.dataset.section===btn.dataset.tab));
    $("sectionTitle").textContent={orders:"Pedidos",products:"Produtos",complements:"Complementos",zones:"Entrega",store:"Loja"}[btn.dataset.tab];
  }));

  async function loadAll(){
    const [o,p,c,z,s]=await Promise.all([
      db.from("orders").select("*").order("created_at",{ascending:false}).limit(200),
      db.from("products").select("*").order("sort_order"),
      db.from("complements").select("*").order("sort_order"),
      db.from("delivery_zones").select("*").order("name"),
      db.from("store_settings").select("data").eq("id","main").maybeSingle()
    ]);
    orders=o.data||[]; products=p.data||[]; complements=c.data||[]; zones=z.data||[]; store=s.data?.data||{};
    renderOrders();renderProducts();renderComplements();renderZones();renderStore();
  }

  async function loadOrders(silent=false){
    const {data,error}=await db.from("orders").select("*").order("created_at",{ascending:false}).limit(200);
    if(error){ if(!silent) toast("Não foi possível atualizar os pedidos."); return; }
    orders=data||[];
    renderOrders();
    if(!silent) toast("Pedidos atualizados.");
  }

  const orderStatus = {
    new: "Novo",
    confirmed: "Confirmado",
    preparing: "Preparando",
    out_for_delivery: "Saiu para entrega",
    delivered: "Entregue",
    cancelled: "Cancelado"
  };

  function formatDate(value){
    if(!value) return "";
    return new Intl.DateTimeFormat("pt-BR",{
      timeZone:"America/Sao_Paulo",
      day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"
    }).format(new Date(value));
  }

  function localDay(value){
    return new Intl.DateTimeFormat("en-CA",{
      timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"
    }).format(new Date(value));
  }

  function filteredOrders(){
    if(orderFilter==="all") return orders;
    if(orderFilter==="open") return orders.filter(o=>!["delivered","cancelled"].includes(o.status));
    if(orderFilter==="preparing") return orders.filter(o=>["confirmed","preparing"].includes(o.status));
    return orders.filter(o=>o.status===orderFilter);
  }

  function phoneHref(phone=""){
    let digits=String(phone).replace(/\D/g,"");
    if(digits.length===10||digits.length===11) digits="55"+digits;
    return digits ? "https://wa.me/"+digits : "#";
  }

  function renderOrderSummary(){
    const today=localDay(new Date());
    const todayOrders=orders.filter(o=>localDay(o.created_at)===today && o.status!=="cancelled");
    const revenue=todayOrders.reduce((sum,o)=>sum+Number(o.total||0),0);
    const cards=[
      ["Novos",orders.filter(o=>o.status==="new").length,"Aguardando atendimento"],
      ["Em preparo",orders.filter(o=>["confirmed","preparing"].includes(o.status)).length,"Confirmados e preparando"],
      ["Em entrega",orders.filter(o=>o.status==="out_for_delivery").length,"Saíram para entrega"],
      ["Vendas hoje",money(revenue),todayOrders.length+" pedido(s)"]
    ];
    $("ordersSummary").innerHTML=cards.map(([label,value,sub])=>`<article class="order-kpi"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(sub)}</small></article>`).join("");
  }

  function paymentStatusInfo(order){
    if(order.payment_status==="paid") return ["Pago","paid"];
    if(order.payment_status==="pay_on_delivery") return ["Pagar na entrega","delivery"];
    if(order.payment_status==="cancelled") return ["Cancelado","cancelled"];
    if(order.payment_status==="refunded") return ["Estornado","refunded"];
    return order.payment==="pix" ? ["Aguardando PIX","pending"] : ["Aguardando pagamento","pending"];
  }

  function orderActionHtml(order){
    if(order.status==="cancelled" || order.status==="delivered") return "";
    if(order.payment==="pix" && order.payment_status!=="paid"){
      return '<button class="order-primary-action" data-confirm-pix="'+esc(order.id)+'">Confirmar PIX e preparar</button>';
    }
    if(order.status==="new" || order.status==="confirmed"){
      return '<button class="order-primary-action" data-start-preparing="'+esc(order.id)+'">Aceitar e preparar</button>';
    }
    if(order.status==="preparing" && order.delivery_mode==="delivery"){
      return '<button class="order-primary-action delivery-action" data-out-delivery="'+esc(order.id)+'">Saiu para entrega</button>';
    }
    if(order.status==="out_for_delivery"){
      return '<div class="waiting-customer">📲 Aguardando o cliente confirmar o recebimento</div>';
    }
    return "";
  }

  function renderOrders(){
    renderOrderSummary();
    const list=filteredOrders();
    if(!list.length){
      $("ordersAdmin").innerHTML='<div class="orders-empty"><span>📦</span><strong>Nenhum pedido nesta etapa</strong><p>Quando houver pedidos, eles aparecerão aqui automaticamente.</p></div>';
      return;
    }

    $("ordersAdmin").innerHTML=list.map(order=>{
      const items=Array.isArray(order.items)?order.items:[];
      const address=order.delivery_mode==="pickup"
        ? "Retirada no local"
        : [order.street,order.street_number,order.address_complement,order.neighborhood].filter(Boolean).join(", ");
      const payment=order.payment==="pix"?"PIX":order.payment==="card"?"Cartão":"Dinheiro";
      const payInfo=paymentStatusInfo(order);
      const lockStatus=order.payment==="pix" && order.payment_status!=="paid" && order.status==="new";
      const options=Object.entries(orderStatus).map(([value,label])=>'<option value="'+value+'" '+(order.status===value?"selected":"")+'>'+label+'</option>').join("");
      const itemHtml=items.map(item=>{
        const included=Array.isArray(item.included)?item.included.join(", "):"";
        const extras=Array.isArray(item.extras)?item.extras.map(x=>x?.name||x).filter(Boolean).join(", "):"";
        return '<div class="order-item-row"><div><strong>'+Number(item.quantity||1)+'x '+esc(item.name||"Item")+'</strong><small>'+(included?esc("Inclusos: "+included):"")+(extras?esc((included?" • ":"")+"Extras: "+extras):"")+(item.notes?esc(" • Obs.: "+item.notes):"")+'</small></div><b>'+money(Number(item.unit_price||0)*Number(item.quantity||1))+'</b></div>';
      }).join("");
      return '<article class="order-card status-'+esc(order.status)+'">'+
        '<div class="order-card-head">'+
          '<div><span class="order-number">'+esc(order.order_number)+'</span><small>'+formatDate(order.created_at)+'</small></div>'+
          '<select class="order-status-select" data-order-status="'+esc(order.id)+'" '+(lockStatus?"disabled":"")+'>'+options+'</select>'+
        '</div>'+
        '<div class="order-customer">'+
          '<div><strong>'+esc(order.customer_name)+'</strong><span>'+esc(order.customer_phone)+'</span></div>'+
          '<a href="'+phoneHref(order.customer_phone)+'" target="_blank" rel="noreferrer">WhatsApp</a>'+
        '</div>'+
        '<div class="payment-banner '+payInfo[1]+'"><div><span>Pagamento</span><strong>'+payment+'</strong></div><b>'+payInfo[0]+'</b></div>'+
        '<div class="order-items">'+itemHtml+'</div>'+
        '<div class="order-meta">'+
          '<div><span>Recebimento</span><strong>'+(order.delivery_mode==="pickup"?"Retirada":"Entrega")+'</strong></div>'+
          '<div><span>Endereço</span><strong>'+esc(address||"-")+'</strong></div>'+
          '<div><span>Pagamento</span><strong>'+payment+(order.change_for?esc(" • Troco: R$ "+order.change_for):"")+'</strong></div>'+
          (order.reference?'<div><span>Referência</span><strong>'+esc(order.reference)+'</strong></div>':"")+
          (order.notes?'<div><span>Observação</span><strong>'+esc(order.notes)+'</strong></div>':"")+
        '</div>'+
        '<div class="order-totals"><span>Subtotal '+money(order.subtotal)+' • Entrega '+money(order.delivery_fee)+'</span><strong>'+money(order.total)+'</strong></div>'+
        '<div class="order-actions">'+orderActionHtml(order)+'</div>'+
      '</article>';
    }).join("");

    document.querySelectorAll("[data-order-status]").forEach(select=>select.addEventListener("change",()=>updateOrderStatus(select.dataset.orderStatus,select.value)));
    document.querySelectorAll("[data-confirm-pix]").forEach(btn=>btn.addEventListener("click",()=>confirmPixAndPrepare(btn.dataset.confirmPix)));
    document.querySelectorAll("[data-start-preparing]").forEach(btn=>btn.addEventListener("click",()=>startPreparing(btn.dataset.startPreparing)));
    document.querySelectorAll("[data-out-delivery]").forEach(btn=>btn.addEventListener("click",()=>markOutForDelivery(btn.dataset.outDelivery)));
  }

  async function updateOrderStatus(id,status){
    const order=orders.find(o=>o.id===id);
    if(!order) return;
    if(order.payment==="pix" && order.payment_status!=="paid" && ["confirmed","preparing","out_for_delivery","delivered"].includes(status)){
      toast("Confirme o PIX antes de avançar o pedido.");
      renderOrders();
      return;
    }
    const now=new Date().toISOString();
    const patch={status,updated_at:now,status_updated_at:now};
    if(status==="confirmed" && !order.confirmed_at) patch.confirmed_at=now;
    if(status==="preparing"){
      if(!order.confirmed_at) patch.confirmed_at=now;
      if(!order.preparing_at) patch.preparing_at=now;
    }
    if(status==="out_for_delivery" && !order.out_for_delivery_at) patch.out_for_delivery_at=now;
    if(status==="delivered"){
      patch.delivered_at=now;
      if(order.payment==="card" || order.payment==="cash") patch.payment_status="paid";
    }
    if(status==="cancelled" && order.payment_status!=="paid") patch.payment_status="cancelled";
    const {error}=await db.from("orders").update(patch).eq("id",id);
    if(error){ toast("Não foi possível alterar o status."); await loadOrders(true); return; }
    toast("Status atualizado para "+orderStatus[status]+".");
    await loadOrders(true);
  }

  async function confirmPixAndPrepare(id){
    const now=new Date().toISOString();
    const {error}=await db.from("orders").update({
      payment_status:"paid",
      status:"preparing",
      confirmed_at:now,
      preparing_at:now,
      updated_at:now,
      status_updated_at:now
    }).eq("id",id);
    if(error){toast("Não foi possível confirmar o PIX.");return;}
    toast("PIX confirmado. Pedido em preparo.");
    await loadOrders(true);
  }

  async function startPreparing(id){
    const now=new Date().toISOString();
    const {error}=await db.from("orders").update({
      status:"preparing",
      confirmed_at:now,
      preparing_at:now,
      updated_at:now,
      status_updated_at:now
    }).eq("id",id);
    if(error){toast("Não foi possível iniciar o preparo.");return;}
    toast("Pedido enviado para preparo.");
    await loadOrders(true);
  }

  async function markOutForDelivery(id){
    const now=new Date().toISOString();
    const {error}=await db.from("orders").update({
      status:"out_for_delivery",
      out_for_delivery_at:now,
      updated_at:now,
      status_updated_at:now
    }).eq("id",id);
    if(error){toast("Não foi possível marcar a saída.");return;}
    toast("Pedido saiu para entrega. O cliente já pode confirmar o recebimento.");
    await loadOrders(true);
  }

  function renderProducts(){
    $("productsAdmin").innerHTML=products.map(p=>`<article class="editor-card" data-product="${esc(p.id)}">
      <div class="editor-photo"><img src="${esc(p.image_url||'images/produto-300.png')}" alt=""><label>Trocar foto<input type="file" accept="image/*" data-photo="${esc(p.id)}"></label></div>
      <div class="editor-fields">
        <label>Nome<input data-field="name" value="${esc(p.name)}"></label>
        <label>Descrição<textarea data-field="description">${esc(p.description||"")}</textarea></label>
        <div class="two"><label>Preço<input data-field="price" type="number" step="0.01" value="${Number(p.price||0)}"></label><label>Complementos inclusos<input data-field="free_limit" type="number" min="0" value="${Number(p.free_limit||0)}"></label></div>
        <div class="two"><label>Categoria<input data-field="category" value="${esc(p.category||"cups")}"></label><label>Ordem<input data-field="sort_order" type="number" value="${Number(p.sort_order||0)}"></label></div>
        <div class="switch-row"><label><input data-field="active" type="checkbox" ${p.active!==false?"checked":""}> Ativo</label><label><input data-field="featured" type="checkbox" ${p.featured?"checked":""}> Destaque</label></div>
        <div class="card-actions"><button data-save-product="${esc(p.id)}">Salvar</button><button class="danger" data-delete-product="${esc(p.id)}">Excluir</button></div>
      </div>
    </article>`).join("");
    document.querySelectorAll("[data-save-product]").forEach(b=>b.addEventListener("click",()=>saveProduct(b.dataset.saveProduct)));
    document.querySelectorAll("[data-delete-product]").forEach(b=>b.addEventListener("click",()=>deleteProduct(b.dataset.deleteProduct)));
    document.querySelectorAll("[data-photo]").forEach(i=>i.addEventListener("change",()=>uploadPhoto(i.dataset.photo,i.files?.[0])));
  }

  async function saveProduct(id){
    const card=document.querySelector(`[data-product="${CSS.escape(id)}"]`);
    const val=(f)=>card.querySelector(`[data-field="${f}"]`);
    const patch={name:val("name").value.trim(),description:val("description").value.trim(),price:Number(val("price").value),free_limit:Number(val("free_limit").value),category:val("category").value.trim(),sort_order:Number(val("sort_order").value),active:val("active").checked,featured:val("featured").checked,updated_at:new Date().toISOString()};
    const {error}=await db.from("products").update(patch).eq("id",id);
    if(error)return toast("Erro ao salvar produto.");
    toast("Produto salvo."); await loadAll();
  }

  async function deleteProduct(id){
    if(!confirm("Excluir este produto?"))return;
    const {error}=await db.from("products").delete().eq("id",id);
    if(error)return toast("Não foi possível excluir.");
    toast("Produto excluído."); await loadAll();
  }

  async function uploadPhoto(id,file){
    if(!file)return;
    const ext=(file.name.split(".").pop()||"jpg").toLowerCase();
    const path=`${id}-${Date.now()}.${ext}`;
    toast("Enviando foto...");
    const {error}=await db.storage.from("product-images").upload(path,file,{upsert:false});
    if(error)return toast("Erro ao enviar foto.");
    const {data}=db.storage.from("product-images").getPublicUrl(path);
    await db.from("products").update({image_url:data.publicUrl,updated_at:new Date().toISOString()}).eq("id",id);
    toast("Foto atualizada."); await loadAll();
  }

  $("addProductBtn").addEventListener("click",async()=>{
    const id=`produto-${Date.now()}`;
    const {error}=await db.from("products").insert({id,name:"Novo produto",description:"",price:0,image_url:"images/produto-300.png",free_limit:4,category:"cups",active:true,featured:false,sort_order:products.length+1});
    if(error)return toast("Erro ao criar produto.");
    await loadAll();
  });

  function renderComplements(){$("complementsAdmin").innerHTML=complements.map(c=>row("complement",c.id,c.name,c.price,c.active)).join("");bindRows("complement");}
  function renderZones(){$("zonesAdmin").innerHTML=zones.map(z=>row("zone",z.id,z.name,z.fee,z.active)).join("");bindRows("zone");}
  function row(type,id,name,value,active){return `<div class="table-row" data-${type}="${esc(id)}"><input data-row-name value="${esc(name)}"><input data-row-value type="number" step="0.01" value="${Number(value||0)}"><input data-row-active type="checkbox" ${active!==false?"checked":""}><div><button data-row-save="${type}:${esc(id)}">Salvar</button><button class="danger" data-row-delete="${type}:${esc(id)}">×</button></div></div>`;}
  function bindRows(type){
    document.querySelectorAll(`[data-row-save^="${type}:"]`).forEach(b=>b.addEventListener("click",()=>saveRow(type,b.dataset.rowSave.split(":").slice(1).join(":"))));
    document.querySelectorAll(`[data-row-delete^="${type}:"]`).forEach(b=>b.addEventListener("click",()=>deleteRow(type,b.dataset.rowDelete.split(":").slice(1).join(":"))));
  }

  async function saveRow(type,id){
    const el=document.querySelector(`[data-${type}="${CSS.escape(id)}"]`);
    const table=type==="complement"?"complements":"delivery_zones";
    const patch=type==="complement"
      ? {name:el.querySelector("[data-row-name]").value.trim(),price:Number(el.querySelector("[data-row-value]").value),active:el.querySelector("[data-row-active]").checked}
      : {name:el.querySelector("[data-row-name]").value.trim(),fee:Number(el.querySelector("[data-row-value]").value),active:el.querySelector("[data-row-active]").checked};
    const {error}=await db.from(table).update(patch).eq("id",id);
    if(error)return toast("Erro ao salvar.");
    toast("Alteração salva."); await loadAll();
  }

  async function deleteRow(type,id){
    if(!confirm("Excluir este item?"))return;
    const table=type==="complement"?"complements":"delivery_zones";
    const {error}=await db.from(table).delete().eq("id",id);
    if(error)return toast("Erro ao excluir.");
    await loadAll();
  }

  $("addComplementBtn").addEventListener("click",async()=>{const id=`comp-${Date.now()}`;await db.from("complements").insert({id,name:"Novo complemento",price:0,active:true,sort_order:complements.length+1});await loadAll();});
  $("addZoneBtn").addEventListener("click",async()=>{const id=`zone-${Date.now()}`;await db.from("delivery_zones").insert({id,name:"Novo bairro",fee:0,active:true});await loadAll();});

  function renderStore(){
    const form=$("storeForm");
    ["store_name","city","state","instagram_url","whatsapp_url","opens_at","closes_at"].forEach(k=>form.elements[k].value=store[k]||"");
  }

  $("storeForm").addEventListener("submit",async e=>{
    e.preventDefault();
    const f=e.currentTarget;
    const data={...store,store_name:f.elements.store_name.value.trim(),city:f.elements.city.value.trim(),state:f.elements.state.value.trim(),instagram_url:f.elements.instagram_url.value.trim(),whatsapp_url:f.elements.whatsapp_url.value.trim(),opens_at:f.elements.opens_at.value,closes_at:f.elements.closes_at.value};
    const {error}=await db.from("store_settings").upsert({id:"main",data});
    if(error)return toast("Erro ao salvar dados da loja.");
    store=data; toast("Dados da loja salvos.");
  });

  $("refreshOrdersBtn").addEventListener("click",()=>loadOrders(false));
  document.querySelectorAll("[data-order-filter]").forEach(btn=>btn.addEventListener("click",()=>{
    orderFilter=btn.dataset.orderFilter;
    document.querySelectorAll("[data-order-filter]").forEach(x=>x.classList.toggle("active",x===btn));
    renderOrders();
  }));

  boot();
  setInterval(()=>{ if(!dashboard.hidden) loadOrders(true); },15000);
})();
