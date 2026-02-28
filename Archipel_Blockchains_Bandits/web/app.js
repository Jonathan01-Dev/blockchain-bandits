const NOEUDS = [
  { nom: "machine-1", tcp: 7777, secure: 8802, provider: 9931 },
  { nom: "machine-2", tcp: 7778, secure: 8803, provider: 9932 },
  { nom: "machine-3", tcp: 7779, secure: 8804, provider: 9933 },
];

const etat = {
  nodeIds: {},
  sortiePeers: {},
  sortieFiles: {},
};

function elt(id) {
  return document.getElementById(id);
}

function texte(id, valeur) {
  elt(id).textContent = String(valeur ?? "");
}

function journal(message) {
  const zone = elt("journalUi");
  const ligne = `[${new Date().toLocaleTimeString("fr-FR")}] ${message}`;
  zone.textContent = `${ligne}\n${zone.textContent}`.trim();
}

function toast(message, erreur = false) {
  const t = elt("toast");
  t.classList.remove("cache", "erreur");
  if (erreur) t.classList.add("erreur");
  t.textContent = message;
  setTimeout(() => t.classList.add("cache"), 2600);
}

function entierOuNull(v) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.floor(n);
}

function lireConfigNoeud(nom) {
  const row = document.querySelector(`[data-noeud-row="${nom}"]`);
  if (!row) {
    const base = NOEUDS.find((n) => n.nom === nom);
    return base ?? { nom, tcp: 7777, secure: 8802, provider: 9931 };
  }
  return {
    nom,
    tcp: entierOuNull(row.querySelector(".port-tcp").value) ?? 7777,
    secure: entierOuNull(row.querySelector(".port-secure").value) ?? 8802,
    provider: entierOuNull(row.querySelector(".port-provider").value) ?? 9931,
  };
}

function remplirSelectNoeuds(id) {
  const s = elt(id);
  s.innerHTML = "";
  for (const n of NOEUDS) {
    const o = document.createElement("option");
    o.value = n.nom;
    o.textContent = n.nom;
    s.appendChild(o);
  }
}

function remplirSelectCibles(idSelect, noeudSource, valeurPreferee = "") {
  const s = elt(idSelect);
  const ancienneValeur = valeurPreferee || s.value;
  s.innerHTML = "";

  const cibles = NOEUDS.filter((n) => n.nom !== noeudSource);
  for (const n of cibles) {
    const o = document.createElement("option");
    o.value = n.nom;
    o.textContent = n.nom;
    s.appendChild(o);
  }

  if (cibles.length === 0) return "";

  const valeurValide = cibles.some((n) => n.nom === ancienneValeur)
    ? ancienneValeur
    : cibles[0].nom;
  s.value = valeurValide;
  return valeurValide;
}

function synchroniserCibleMessage() {
  const noeudCible = elt("noeudMsgCible").value;
  if (!noeudCible) return;
  const nodeId = etat.nodeIds[noeudCible] ?? "";
  elt("idMsgCible").value = nodeId;
  elt("portMsgCible").value = String(lireConfigNoeud(noeudCible).secure);
}

function synchroniserCibleFichier() {
  const noeudCible = elt("noeudSendCible").value;
  if (!noeudCible) return;
  const nodeId = etat.nodeIds[noeudCible] ?? "";
  elt("idSendCible").value = nodeId;
  elt("portSendCible").value = String(lireConfigNoeud(noeudCible).secure);
}

function extraireNodeId(sortieStatus) {
  for (const ligne of String(sortieStatus ?? "").split("\n")) {
    const m = ligne.match(/^node_id=(.+)$/);
    if (m) return m[1].trim();
  }
  return "";
}

function extrairePremierFileId(sortieReceive) {
  for (const ligne of String(sortieReceive ?? "").split("\n")) {
    const m = ligne.trim().match(/^([a-f0-9]{64})\s+/i);
    if (m) return m[1];
  }
  return "";
}

function formaterHeure(ts) {
  if (!ts) return "--:--:--";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "--:--:--";
  return d.toLocaleTimeString("fr-FR");
}

function afficherHistoriqueMessagerie(events) {
  const zone = elt("sortieHistorique");
  zone.innerHTML = "";

  if (!Array.isArray(events) || events.length === 0) {
    const vide = document.createElement("div");
    vide.className = "chat-vide";
    vide.textContent = "Aucun message pour ce filtre.";
    zone.appendChild(vide);
    return;
  }

  for (const e of events) {
    const direction = String(e?.direction ?? "evt") === "out" ? "out" : "in";
    const ligne = document.createElement("div");
    ligne.className = `chat-msg ${direction}`;

    const bulle = document.createElement("div");
    bulle.className = "chat-bulle";

    const meta = document.createElement("div");
    meta.className = "chat-meta";
    const peer = e?.peer ? String(e.peer).slice(0, 12) : "-";
    const dirLabel = direction === "out" ? "Sortant" : "Entrant";
    meta.textContent = `${dirLabel} - ${peer} - ${formaterHeure(e?.ts)}`;

    const texteMsg = document.createElement("div");
    texteMsg.className = "chat-texte";
    texteMsg.textContent = String(e?.text ?? "");

    bulle.appendChild(meta);
    bulle.appendChild(texteMsg);
    ligne.appendChild(bulle);
    zone.appendChild(ligne);
  }

  zone.scrollTop = zone.scrollHeight;
}

function choisirCibleParDefaut(noeudSource) {
  return NOEUDS.find((n) => n.nom !== noeudSource) ?? NOEUDS[0];
}

async function api(path, method = "GET", body = null) {
  const res = await fetch(path, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || "requete echouee");
  return json;
}

async function testerApi() {
  const pastille = elt("etatApi");
  try {
    await api("/api/status?node=machine-1");
    pastille.textContent = "API connectee";
    pastille.classList.remove("ko");
    pastille.classList.add("ok");
  } catch {
    pastille.textContent = "API indisponible";
    pastille.classList.remove("ok");
    pastille.classList.add("ko");
  }
}

function construireTableNoeuds() {
  const tbody = document.querySelector("#tableNoeuds tbody");
  tbody.innerHTML = "";

  for (const n of NOEUDS) {
    const tr = document.createElement("tr");
    tr.setAttribute("data-noeud-row", n.nom);
    tr.innerHTML = `
      <td>${n.nom}</td>
      <td><input class="port-tcp" type="number" min="1024" max="65535" value="${n.tcp}" /></td>
      <td><input class="port-secure" type="number" min="1024" max="65535" value="${n.secure}" /></td>
      <td><input class="port-provider" type="number" min="1024" max="65535" value="${n.provider}" /></td>
      <td>
        <div class="rangee">
          <button data-action="keys" data-noeud="${n.nom}">Cles</button>
          <button data-action="start" data-noeud="${n.nom}">Demarrer</button>
          <button data-action="stop" data-noeud="${n.nom}" class="secondaire">Arreter</button>
          <button data-action="status" data-noeud="${n.nom}" class="secondaire">Etat</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll("button[data-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const action = btn.getAttribute("data-action");
      const nom = btn.getAttribute("data-noeud");
      try {
        if (action === "keys") await genererCles(nom);
        if (action === "start") await demarrerServicesNoeud(nom);
        if (action === "stop") await arreterServicesNoeud(nom);
        if (action === "status") await rafraichirEtatNoeud(nom);
      } catch (err) {
        toast(err.message, true);
      }
    });
  });
}

function afficherServicesBloc(resultats) {
  const lignes = [];
  for (const r of resultats) {
    lignes.push(`== ${r.noeud} ==`);
    for (const s of r.services ?? []) {
      const etatTxt = s.running ? "en cours" : "arrete";
      lignes.push(`${s.service}: ${etatTxt} port=${s.port ?? "-"} pid=${s.pid ?? "-"}`);
      for (const l of s.recentLogs ?? []) lignes.push(`  ${l}`);
    }
  }
  texte("sortieServices", lignes.join("\n"));
}

async function rafraichirServices() {
  const resultats = [];
  for (const n of NOEUDS) {
    const out = await api(`/api/services?node=${encodeURIComponent(n.nom)}`);
    resultats.push({ noeud: n.nom, services: out.services });
  }
  afficherServicesBloc(resultats);
  journal("Services rafraichis");
}

async function genererCles(noeud) {
  const out = await api("/api/keys/generate", "POST", { nodeName: noeud, force: true });
  journal(`Cles regenerees pour ${noeud}`);
  toast(`Cles generees pour ${noeud}`);
  if (out.raw) texte("sortieServices", out.raw);
}

async function demarrerServicesNoeud(noeud) {
  const cfg = lireConfigNoeud(noeud);
  await api("/api/services/start", "POST", {
    nodeName: noeud,
    nodePort: cfg.tcp,
    securePort: cfg.secure,
    providerPort: cfg.provider,
  });
  journal(`Services demarres pour ${noeud} (tcp=${cfg.tcp}, secure=${cfg.secure}, provider=${cfg.provider})`);
}

async function arreterServicesNoeud(noeud) {
  await api("/api/services/stop", "POST", { nodeName: noeud });
  journal(`Services arretes pour ${noeud}`);
}

async function genererClesTout() {
  for (const n of NOEUDS) await genererCles(n.nom);
  await autoRemplirIds();
}

async function demarrerTout() {
  for (const n of NOEUDS) await demarrerServicesNoeud(n.nom);
  await rafraichirServices();
  await autoRemplirIds();
  toast("Tous les services sont demarres");
}

async function arreterTout() {
  for (const n of [...NOEUDS].reverse()) await arreterServicesNoeud(n.nom);
  await rafraichirServices();
  toast("Tous les services sont arretes");
}

async function rafraichirEtatNoeud(noeud) {
  const s = await api(`/api/status?node=${encodeURIComponent(noeud)}`);
  const p = await api(`/api/peers?node=${encodeURIComponent(noeud)}`);
  etat.nodeIds[noeud] = extraireNodeId(s.raw);
  etat.sortiePeers[noeud] = p.raw;
  if (elt("noeudEtat").value === noeud) {
    texte("sortieEtat", s.raw || "(vide)");
    texte("sortiePeers", p.raw || "(vide)");
  }
}

async function rafraichirEtatSelection() {
  const n = elt("noeudEtat").value;
  await rafraichirEtatNoeud(n);
  journal(`Etat + peers rafraichis pour ${n}`);
}

async function rafraichirTrust() {
  const n = elt("noeudTrust").value;
  const nodeId = elt("idTrustFiltre").value.trim();
  const suffix = nodeId ? `&nodeId=${encodeURIComponent(nodeId)}` : "";
  const out = await api(`/api/trust?node=${encodeURIComponent(n)}${suffix}`);
  texte("sortieTrust", out.raw || "(vide)");
  journal(`Trust rafraichi pour ${n}${nodeId ? ` filtre=${nodeId.slice(0, 12)}` : ""}`);
}

async function approuverTrust() {
  const nodeName = elt("noeudTrust").value;
  const targetNodeId = elt("idTrustCible").value.trim();
  if (!targetNodeId) throw new Error("node_id cible manquant pour trust");

  const out = await api("/api/trust/approve", "POST", {
    nodeName,
    targetNodeId,
    byNodeName: nodeName,
    note: elt("noteTrust").value.trim(),
  });
  texte("sortieTrust", out.raw || "ok");
  journal(`Trust approuve: ${nodeName} -> ${targetNodeId.slice(0, 12)}`);
}

async function revoquerTrust() {
  const nodeName = elt("noeudTrust").value;
  const targetNodeId = elt("idTrustCible").value.trim();
  if (!targetNodeId) throw new Error("node_id cible manquant pour revocation");

  const out = await api("/api/trust/revoke", "POST", {
    nodeName,
    targetNodeId,
    byNodeName: nodeName,
    reason: elt("raisonTrust").value.trim() || "revocation manuelle",
  });
  texte("sortieTrust", out.raw || "ok");
  journal(`Trust revoque: ${nodeName} -> ${targetNodeId.slice(0, 12)}`);
}

async function envoyerMessage() {
  const nodeName = elt("noeudMsg").value;
  const toNodeId = elt("idMsgCible").value.trim();
  if (!toNodeId) throw new Error("node_id cible manquant");

  const out = await api("/api/msg", "POST", {
    nodeName,
    toNodeId,
    toPort: entierOuNull(elt("portMsgCible").value),
    message: elt("texteMsg").value,
    noAi: elt("flagNoAiMsg").checked,
    contextMessages: entierOuNull(elt("ctxMsg").value),
  });
  texte("sortieMsg", out.raw || "ok");
  await rafraichirHistorique();
  journal(`Message envoye ${nodeName} -> ${toNodeId.slice(0, 12)}`);
}

async function envoyerFichier() {
  const nodeName = elt("noeudSend").value;
  const filePath = elt("cheminFichier").value.trim();
  if (!filePath) throw new Error("chemin fichier manquant");

  const out = await api("/api/send", "POST", {
    nodeName,
    toNodeId: elt("idSendCible").value.trim(),
    toPort: entierOuNull(elt("portSendCible").value),
    filePath,
    chunkSize: entierOuNull(elt("tailleChunk").value),
  });
  texte("sortieSend", out.raw || "ok");
  journal(`Fichier prepare depuis ${nodeName}`);
}

async function listerFichiers() {
  const nodeName = elt("noeudReceive").value;
  const out = await api(`/api/files?node=${encodeURIComponent(nodeName)}`);
  etat.sortieFiles[nodeName] = out.raw || "";
  texte("sortieReceive", out.raw || "(vide)");
  journal(`Fichiers listes pour ${nodeName}`);
}

async function construirePeersDownload(noeudReceveur) {
  const manuel = elt("peersDownload").value
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const out = [];
  for (const ligne of manuel) {
    const m = ligne.match(/^(.+?)@([^:]+):(\d+)$/);
    if (!m) continue;
    out.push({ nodeId: m[1], host: m[2], port: Number(m[3]) });
  }
  if (out.length > 0) return out;

  const servicesParNoeud = new Map();
  for (const n of NOEUDS) {
    if (n.nom === noeudReceveur) continue;
    try {
      const outServices = await api(`/api/services?node=${encodeURIComponent(n.nom)}`);
      servicesParNoeud.set(n.nom, outServices.services ?? []);
    } catch {
      servicesParNoeud.set(n.nom, []);
    }
  }

  for (const n of NOEUDS) {
    if (n.nom === noeudReceveur) continue;
    const nodeId = etat.nodeIds[n.nom];
    if (!nodeId) continue;
    const providerSvc = (servicesParNoeud.get(n.nom) ?? []).find((s) => s.service === "provider");
    if (!providerSvc?.running) continue;
    out.push({ nodeId, host: "127.0.0.1", port: Number(providerSvc.port) });
  }
  return out;
}

async function telechargerFichier() {
  const nodeName = elt("noeudReceive").value;
  const fileId = elt("fileIdDownload").value.trim();
  if (!fileId) throw new Error("file_id manquant");

  const peers = await construirePeersDownload(nodeName);
  if (peers.length === 0) {
    throw new Error("Aucun provider actif detecte. Demarre au moins un service 'provider' sur un noeud source.");
  }

  const out = await api("/api/download", "POST", {
    nodeName,
    fileId,
    providerPort: entierOuNull(elt("providerPortDownload").value),
    peers,
    parallel: entierOuNull(elt("parallelDownload").value),
    timeoutMs: entierOuNull(elt("timeoutDownload").value),
  });
  texte("sortieDownload", out.raw || "ok");
  journal(`Download lance pour ${nodeName}`);
}

async function interrogerGemini() {
  const nodeName = elt("noeudAsk").value;
  const prompt = elt("promptAsk").value.trim();
  if (!prompt) throw new Error("question Gemini manquante");

  const out = await api("/api/ask", "POST", {
    nodeName,
    prompt,
    noAi: elt("flagNoAiAsk").checked,
    contextMessages: entierOuNull(elt("ctxAskN").value),
    context: elt("ctxAsk").value.trim(),
  });
  texte("sortieAsk", out.raw || "(vide)");
  journal(`Gemini execute pour ${nodeName}`);
}

async function rafraichirHistorique() {
  const node = elt("noeudHistorique").value;
  const direction = elt("directionHistorique").value;
  const peer = elt("peerHistorique").value.trim();
  const limit = entierOuNull(elt("limiteHistorique").value) ?? 100;
  const qs = new URLSearchParams({
    node,
    limit: String(limit),
  });
  if (direction) qs.set("direction", direction);
  if (peer) qs.set("peer", peer);
  const out = await api(`/api/chat?${qs.toString()}`);
  afficherHistoriqueMessagerie(out.events ?? []);
  journal(`Historique E2E rafraichi pour ${node}`);
}

async function autoRemplirIds() {
  for (const n of NOEUDS) {
    try {
      await rafraichirEtatNoeud(n.nom);
    } catch {
      // noop
    }
  }

  const sourceMsg = elt("noeudMsg").value;
  const sourceSend = elt("noeudSend").value;
  const sourceTrust = elt("noeudTrust").value;

  const cibleMsg = choisirCibleParDefaut(sourceMsg);
  const cibleSend = choisirCibleParDefaut(sourceSend);
  const cibleTrust = choisirCibleParDefaut(sourceTrust);

  if (cibleMsg) {
    remplirSelectCibles("noeudMsgCible", sourceMsg, cibleMsg.nom);
    synchroniserCibleMessage();
  }
  if (cibleMsg && etat.nodeIds[cibleMsg.nom]) {
    elt("idMsgCible").value = etat.nodeIds[cibleMsg.nom];
    elt("portMsgCible").value = String(lireConfigNoeud(cibleMsg.nom).secure);
  }
  if (cibleSend) {
    remplirSelectCibles("noeudSendCible", sourceSend, cibleSend.nom);
    synchroniserCibleFichier();
  }
  if (cibleSend && etat.nodeIds[cibleSend.nom]) {
    elt("idSendCible").value = etat.nodeIds[cibleSend.nom];
    elt("portSendCible").value = String(lireConfigNoeud(cibleSend.nom).secure);
  }
  if (cibleTrust && etat.nodeIds[cibleTrust.nom]) {
    elt("idTrustCible").value = etat.nodeIds[cibleTrust.nom];
    elt("idTrustFiltre").value = etat.nodeIds[cibleTrust.nom];
  }

  const rec = elt("noeudReceive").value;
  if (rec) {
    try {
      await listerFichiers();
      const fid = extrairePremierFileId(etat.sortieFiles[rec]);
      if (fid) elt("fileIdDownload").value = fid;
    } catch {
      // noop
    }
  }

  const lignesPeers = [];
  for (const n of NOEUDS) {
    if (n.nom === rec) continue;
    const nodeId = etat.nodeIds[n.nom];
    if (!nodeId) continue;
    let providerPort = lireConfigNoeud(n.nom).provider;
    try {
      const outServices = await api(`/api/services?node=${encodeURIComponent(n.nom)}`);
      const providerSvc = (outServices.services ?? []).find((s) => s.service === "provider");
      if (!providerSvc?.running) continue;
      providerPort = Number(providerSvc.port);
    } catch {
      // fallback config locale
    }
    lignesPeers.push(`${nodeId}@127.0.0.1:${providerPort}`);
  }
  if (lignesPeers.length > 0) elt("peersDownload").value = lignesPeers.join("\n");

  journal("Champs auto-remplis (node_id, ports, file_id, peers)");
  toast("Auto-remplissage termine");
}

function lierEvenements() {
  elt("btnRafraichirServices").addEventListener("click", () => executer("Rafraichir services", rafraichirServices));
  elt("btnGenererTout").addEventListener("click", () => executer("Generer celes", genererClesTout));
  elt("btnDemarrerTout").addEventListener("click", () => executer("Demarrer tout", demarrerTout));
  elt("btnArreterTout").addEventListener("click", () => executer("Arreter tout", arreterTout));
  elt("btnAutoRemplir").addEventListener("click", () => executer("Auto-remplir", autoRemplirIds));

  elt("btnRefreshEtat").addEventListener("click", () => executer("Rafraichir etat", rafraichirEtatSelection));
  elt("btnRefreshTrust").addEventListener("click", () => executer("Rafraichir trust", rafraichirTrust));
  elt("btnTrustApprove").addEventListener("click", () => executer("Trust approve", approuverTrust));
  elt("btnTrustRevoke").addEventListener("click", () => executer("Trust revoke", revoquerTrust));

  elt("btnEnvoyerMsg").addEventListener("click", () => executer("Envoyer message", envoyerMessage));
  elt("btnRefreshHistorique").addEventListener("click", () => executer("Rafraichir historique", rafraichirHistorique));
  elt("btnSend").addEventListener("click", () => executer("Envoyer fichier", envoyerFichier));
  elt("btnListerFichiers").addEventListener("click", () => executer("Lister fichiers", listerFichiers));
  elt("btnAutoFileId").addEventListener("click", () => {
    const rec = elt("noeudReceive").value;
    const fid = extrairePremierFileId(etat.sortieFiles[rec]);
    if (fid) {
      elt("fileIdDownload").value = fid;
      toast("file_id rempli");
    } else {
      toast("Aucun file_id detecte", true);
    }
  });
  elt("btnDownload").addEventListener("click", () => executer("Download", telechargerFichier));

  elt("btnAsk").addEventListener("click", () => executer("Gemini", interrogerGemini));

  ["noeudEtat", "noeudMsg", "noeudSend", "noeudTrust", "noeudReceive", "noeudAsk", "noeudHistorique"].forEach((id) => {
    elt(id).addEventListener("change", () => {
      if (id === "noeudEtat") executer("Rafraichir etat", rafraichirEtatSelection);
      if (id === "noeudMsg") {
        remplirSelectCibles("noeudMsgCible", elt("noeudMsg").value);
        synchroniserCibleMessage();
      }
      if (id === "noeudSend") {
        remplirSelectCibles("noeudSendCible", elt("noeudSend").value);
        synchroniserCibleFichier();
      }
      if (id === "noeudHistorique") executer("Rafraichir historique", rafraichirHistorique);
    });
  });
  ["directionHistorique", "peerHistorique", "limiteHistorique"].forEach((id) => {
    elt(id).addEventListener("change", () => executer("Rafraichir historique", rafraichirHistorique));
  });
  elt("noeudMsgCible").addEventListener("change", synchroniserCibleMessage);
  elt("noeudSendCible").addEventListener("change", synchroniserCibleFichier);
}

async function executer(etiquette, fn) {
  try {
    await fn();
  } catch (err) {
    const msg = err?.message || String(err);
    toast(msg, true);
    journal(`${etiquette} en echec: ${msg}`);
  }
}

async function init() {
  construireTableNoeuds();
  remplirSelectNoeuds("noeudEtat");
  remplirSelectNoeuds("noeudTrust");
  remplirSelectNoeuds("noeudMsg");
  remplirSelectNoeuds("noeudSend");
  remplirSelectNoeuds("noeudMsgCible");
  remplirSelectNoeuds("noeudSendCible");
  remplirSelectNoeuds("noeudReceive");
  remplirSelectNoeuds("noeudAsk");
  remplirSelectNoeuds("noeudHistorique");

  elt("noeudEtat").value = "machine-1";
  elt("noeudTrust").value = "machine-1";
  elt("noeudMsg").value = "machine-1";
  elt("noeudSend").value = "machine-1";
  remplirSelectCibles("noeudMsgCible", "machine-1", "machine-2");
  remplirSelectCibles("noeudSendCible", "machine-1", "machine-2");
  elt("noeudReceive").value = "machine-2";
  elt("noeudAsk").value = "machine-1";
  elt("noeudHistorique").value = "machine-1";

  lierEvenements();
  await testerApi();
  await executer("Rafraichir services", rafraichirServices);
  await executer("Rafraichir etat", rafraichirEtatSelection);
  await executer("Rafraichir trust", rafraichirTrust);
  await executer("Rafraichir historique", rafraichirHistorique);
  await executer("Auto-remplir", autoRemplirIds);
  journal("Interface initialisee");
}

init();
