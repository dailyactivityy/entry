// Thin wrapper around the Apps Script Web App.
// IMPORTANT: content-type "text/plain" keeps this a "simple request" so the
// browser skips a CORS preflight (Apps Script can't answer OPTIONS requests).
const Api = (() => {
  function token() {
    return localStorage.getItem("lm_token") || "";
  }
  function setToken(t) {
    if (t) localStorage.setItem("lm_token", t);
    else localStorage.removeItem("lm_token");
  }
  function setUser(u) {
    if (u) localStorage.setItem("lm_user", JSON.stringify(u));
    else localStorage.removeItem("lm_user");
  }
  function getUser() {
    const raw = localStorage.getItem("lm_user");
    return raw ? JSON.parse(raw) : null;
  }

  async function call(action, payload = {}) {
    const body = JSON.stringify({ action, token: token(), ...payload });
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body
    });
    if (!res.ok) throw new Error("Network error: " + res.status);
    const data = await res.json();
    if (data.ok === false && /Session expired|Not logged in/.test(data.error || "")) {
      setToken(null);
      setUser(null);
      window.location.reload();
    }
    return data;
  }

  return { call, token, setToken, setUser, getUser };
})();
