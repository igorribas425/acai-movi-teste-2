(() => {
  const cfg = window.ACAI_MOVI_CONFIG || {};
  const title = document.getElementById("confirmTitle");
  const text = document.getElementById("confirmText");
  const icon = document.getElementById("statusIcon");
  const box = document.getElementById("statusBox");
  const label = document.getElementById("statusLabel");
  const detail = document.getElementById("statusDetail");
  const go = document.getElementById("goAdminBtn");

  function render(type, heading, message, status, statusDetail, showButton) {
    icon.className = "status-icon " + type;
    icon.textContent = type === "error" ? "!" : "✓";
    box.className = "status-box " + type;
    title.textContent = heading;
    text.textContent = message;
    label.textContent = status;
    detail.textContent = statusDetail;
    go.hidden = !showButton;
  }

  async function verify() {
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey || !window.supabase) {
      render("error", "Serviço indisponível", "Não foi possível validar o acesso agora.", "Falha de conexão", "Volte ao painel e tente novamente.", false);
      return;
    }

    try {
      const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
      await new Promise(resolve => setTimeout(resolve, 800));
      const { data } = await client.auth.getSession();
      const confirmed = Boolean(data?.session?.user?.email_confirmed_at);

      if (confirmed) {
        render("ok", "Acesso confirmado", "Seu e-mail foi verificado com sucesso. O painel administrativo está pronto para você.", "Conta verificada", "Autenticação concluída com segurança.", true);
      } else {
        render("ok", "Confirmação recebida", "Se você chegou aqui pelo botão do e-mail, sua verificação foi processada. Continue para o painel e faça login.", "Verificação processada", "Use o mesmo e-mail e senha cadastrados.", true);
      }
    } catch (error) {
      console.warn(error);
      render("error", "Não foi possível validar", "Ocorreu um problema durante a confirmação.", "Tente novamente", "Volte ao painel e refaça o acesso.", false);
    }
  }

  verify();
})();
