function nodeName() {
  return document.getElementById("nodeName").value.trim() || "machine-1";
}

function setOut(id, value) {
  document.getElementById(id).textContent = value;
}

function toast(message, error = false) {
  const el = document.getElementById("toast");
  el.classList.remove("hidden", "error");
  if (error) el.classList.add("error");
  el.textContent = message;
  setTimeout(() => el.classList.add("hidden"), 2600);
}

function setBusy(buttonId, busy) {
  const btn = document.getElementById(buttonId);
  if (!btn) return;
  btn.disabled = busy;
}

async function api(path, method = "GET", body = null) {
  const res = await fetch(path, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || "request failed");
  return json;
}

async function probeApi() {
  const pill = document.getElementById("apiHealth");
  try {
    await api(`/api/status?node=${encodeURIComponent(nodeName())}`);
    pill.textContent = "API connectee";
    pill.style.color = "#0a7f60";
  } catch {
    pill.textContent = "API indisponible";
    pill.style.color = "#b4232e";
  }
}

async function refreshStatus() {
  setBusy("refreshStatus", true);
  try {
    const out = await api(`/api/status?node=${encodeURIComponent(nodeName())}`);
    setOut("statusOut", out.raw || "(empty)");
    toast("Status mis a jour");
  } catch (err) {
    setOut("statusOut", err.message);
    toast(err.message, true);
  } finally {
    setBusy("refreshStatus", false);
  }
}

async function refreshPeers() {
  setBusy("refreshPeers", true);
  try {
    const out = await api(`/api/peers?node=${encodeURIComponent(nodeName())}`);
    setOut("peersOut", out.raw || "(empty)");
    toast("Peers mis a jour");
  } catch (err) {
    setOut("peersOut", err.message);
    toast(err.message, true);
  } finally {
    setBusy("refreshPeers", false);
  }
}

async function refreshTrust() {
  setBusy("refreshTrust", true);
  try {
    const out = await api(`/api/trust?node=${encodeURIComponent(nodeName())}`);
    setOut("trustOut", out.raw || "(empty)");
    toast("Trust mis a jour");
  } catch (err) {
    setOut("trustOut", err.message);
    toast(err.message, true);
  } finally {
    setBusy("refreshTrust", false);
  }
}

async function sendMsg() {
  const toNodeId = document.getElementById("msgNodeId").value.trim();
  const message = document.getElementById("msgText").value;
  const noAi = document.getElementById("msgNoAi").checked;
  setBusy("sendMsg", true);
  try {
    const out = await api("/api/msg", "POST", {
      nodeName: nodeName(),
      toNodeId,
      message,
      noAi,
    });
    setOut("msgOut", out.raw || "ok");
    toast("Message envoye");
  } catch (err) {
    setOut("msgOut", err.message);
    toast(err.message, true);
  } finally {
    setBusy("sendMsg", false);
  }
}

async function sendFile() {
  const toNodeId = document.getElementById("sendNodeId").value.trim();
  const filePath = document.getElementById("sendPath").value.trim();
  setBusy("sendFile", true);
  try {
    const out = await api("/api/send", "POST", {
      nodeName: nodeName(),
      toNodeId,
      filePath,
    });
    setOut("sendOut", out.raw || "ok");
    toast("Fichier prepare");
  } catch (err) {
    setOut("sendOut", err.message);
    toast(err.message, true);
  } finally {
    setBusy("sendFile", false);
  }
}

async function listFiles() {
  setBusy("listFiles", true);
  try {
    const out = await api(`/api/files?node=${encodeURIComponent(nodeName())}`);
    setOut("downloadOut", out.raw || "(empty)");
    toast("Liste des fichiers chargee");
  } catch (err) {
    setOut("downloadOut", err.message);
    toast(err.message, true);
  } finally {
    setBusy("listFiles", false);
  }
}

async function downloadFile() {
  const fileId = document.getElementById("fileId").value.trim();
  setBusy("downloadFile", true);
  try {
    const out = await api("/api/download", "POST", {
      nodeName: nodeName(),
      fileId,
    });
    setOut("downloadOut", out.raw || "ok");
    toast("Download lance");
  } catch (err) {
    setOut("downloadOut", err.message);
    toast(err.message, true);
  } finally {
    setBusy("downloadFile", false);
  }
}

async function ask() {
  const prompt = document.getElementById("askPrompt").value.trim();
  const noAi = document.getElementById("askNoAi").checked;
  setBusy("askBtn", true);
  try {
    const out = await api("/api/ask", "POST", {
      nodeName: nodeName(),
      prompt,
      noAi,
    });
    setOut("askOut", out.raw || "(empty)");
    toast("Reponse recue");
  } catch (err) {
    setOut("askOut", err.message);
    toast(err.message, true);
  } finally {
    setBusy("askBtn", false);
  }
}

async function quickRefresh() {
  await Promise.all([refreshStatus(), refreshPeers(), refreshTrust()]);
}

function wireSidebarButtons() {
  document.querySelectorAll("[data-target]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const el = document.getElementById(btn.dataset.target);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

document.getElementById("refreshStatus").addEventListener("click", refreshStatus);
document.getElementById("refreshPeers").addEventListener("click", refreshPeers);
document.getElementById("refreshTrust").addEventListener("click", refreshTrust);
document.getElementById("quickRefresh").addEventListener("click", quickRefresh);
document.getElementById("sendMsg").addEventListener("click", sendMsg);
document.getElementById("sendFile").addEventListener("click", sendFile);
document.getElementById("listFiles").addEventListener("click", listFiles);
document.getElementById("downloadFile").addEventListener("click", downloadFile);
document.getElementById("askBtn").addEventListener("click", ask);

wireSidebarButtons();
probeApi();
quickRefresh();
