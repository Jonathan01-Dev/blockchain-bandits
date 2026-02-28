const $ = (id) => document.getElementById(id);

const ui = {
  statsGrid: $('statsGrid'),
  peersList: $('peersList'),
  trustList: $('trustList'),
  logOutput: $('logOutput'),
  connectionState: $('connectionState'),
};

function fmt(text) {
  if (text === null || text === undefined) return '-';
  if (typeof text === 'object') return JSON.stringify(text);
  return String(text);
}

function shortId(value, len = 16) {
  if (!value) return 'unknown';
  const s = String(value);
  return s.slice(0, len);
}

function logAction(title, payload) {
  const line = `[${new Date().toLocaleTimeString()}] ${title}\n${JSON.stringify(payload, null, 2)}\n\n`;
  ui.logOutput.textContent = line + ui.logOutput.textContent;
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    method: options.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Erreur API');
  return json.data;
}

function renderStats(status) {
  const cards = [
    ['Node ID', (status.nodeId || '').slice(0, 14)],
    ['Port TCP', status.port],
    ['Peers online', status.peersOnline],
    ['Peers total', status.peersTotal],
    ['Uptime (s)', status.uptimeSec],
    ['AI active', status.aiEnabled ? 'Oui' : 'Non'],
    ['AI dispo', status.aiAvailable ? 'Oui' : 'Non'],
    ['Replication', status.replicationFactor],
  ];

  ui.statsGrid.innerHTML = cards
    .map(([key, value]) => `
      <article class="stat-card">
        <span class="stat-key">${key}</span>
        <span class="stat-value">${fmt(value)}</span>
      </article>
    `)
    .join('');
}

function renderPeers(peers) {
  const safePeers = Array.isArray(peers) ? peers : [];
  ui.peersList.innerHTML = safePeers.length
    ? safePeers
      .map((p) => `
        <article class="item">
          <strong>${shortId(p?.nodeId, 16)}</strong><br>
          ${fmt(p?.ip)}:${fmt(p?.tcpPort)} | ${fmt(p?.status)} | rep=${Number(p?.reputation ?? 1).toFixed(2)}
        </article>
      `)
      .join('')
    : '<article class="item">Aucun pair détecté</article>';
}

function renderTrust(trust) {
  const entries = Object.entries(trust || {});
  ui.trustList.innerHTML = entries.length
    ? entries
      .map(([nodeId, t]) => `
        <article class="item">
          <strong>${shortId(nodeId, 16)}</strong><br>
          ${t.state || 'trusted_tofu'}
          ${t.revokedAt ? ` | revoked: ${new Date(t.revokedAt).toLocaleString()}` : ''}
        </article>
      `)
      .join('')
    : '<article class="item">Trust store vide</article>';
}

async function refreshAll() {
  try {
    const [status, peers, trust] = await Promise.all([
      api('/api/status'),
      api('/api/peers'),
      api('/api/trust'),
    ]);

    renderStats(status);
    renderPeers(peers);
    renderTrust(trust);
    ui.connectionState.textContent = 'Connecté';
  } catch (err) {
    ui.connectionState.textContent = 'Hors ligne';
    logAction('Erreur refresh', { error: err.message });
  }
}

function bindForms() {
  $('msgForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      const out = await api('/api/msg', {
        method: 'POST',
        body: { peerPrefix: fd.get('peerPrefix'), text: fd.get('text') },
      });
      logAction('Message envoyé', out);
      e.currentTarget.reset();
    } catch (err) {
      logAction('Erreur message', { error: err.message });
    }
    refreshAll();
  });

  $('shareForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      const out = await api('/api/share', {
        method: 'POST',
        body: { filePath: fd.get('filePath') },
      });
      logAction('Fichier partagé', out);
      e.currentTarget.reset();
    } catch (err) {
      logAction('Erreur share', { error: err.message });
    }
    refreshAll();
  });

  $('pullMultiForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      const out = await api('/api/pull-multi', {
        method: 'POST',
        body: {
          fileId: fd.get('fileId'),
          outputPath: fd.get('outputPath') || null,
          parallelism: Number(fd.get('parallelism') || 3),
        },
      });
      logAction('Pull-multi terminé', out);
    } catch (err) {
      logAction('Erreur pull-multi', { error: err.message });
    }
    refreshAll();
  });

  $('trustApproveForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      const out = await api('/api/trust/approve', {
        method: 'POST',
        body: { peerPrefix: fd.get('peerPrefix') },
      });
      logAction('Trust approve', out);
      e.currentTarget.reset();
    } catch (err) {
      logAction('Erreur trust approve', { error: err.message });
    }
    refreshAll();
  });

  $('trustRevokeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      const out = await api('/api/trust/revoke', {
        method: 'POST',
        body: { peerPrefix: fd.get('peerPrefix'), reason: fd.get('reason') || 'manual_revoke' },
      });
      logAction('Trust revoke', out);
      e.currentTarget.reset();
    } catch (err) {
      logAction('Erreur trust revoke', { error: err.message });
    }
    refreshAll();
  });

  $('askForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      const out = await api('/api/ask', {
        method: 'POST',
        body: { question: fd.get('question') },
      });
      logAction('Réponse IA', out);
      e.currentTarget.reset();
    } catch (err) {
      logAction('Erreur IA', { error: err.message });
    }
  });

  $('refreshBtn').addEventListener('click', () => refreshAll());
}

bindForms();
refreshAll();
setInterval(refreshAll, 5000);
