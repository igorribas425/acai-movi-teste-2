(() => {
  const cfg = window.ACAI_MOVI_CONFIG || {};
  const token = new URLSearchParams(window.location.search).get("token") || "";
  const $ = (id) => document.getElementById(id);
  const BRL = new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"});
  let client = null;
  let current = null;
})();