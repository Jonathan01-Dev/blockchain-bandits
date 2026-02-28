#!/usr/bin/env node
import readline from 'node:readline';
import { ArchipelNode } from '../core/node.js';
import { DEFAULT_TCP_PORT } from '../core/constants.js';
import { DashboardServer } from '../web/dashboardServer.js';

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      out[key] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    } else {
      out._.push(arg);
    }
  }
  return out;
}

function printHelp() {
  console.log(`
Archipel CLI

Usage:
  node src/cli/index.js start --port 7777
  node src/cli/index.js start --port 7777 --no-ai --replication-factor 2
  node src/cli/index.js start --port 7777 --web --web-port 8080
  node src/cli/index.js start --port 7777 --web --web-port 8080 --web-only

Interactive commands:
  peers
  msg <peer_id_prefix> <text>
  ask <question>
  share <filepath>
  send <peer_id_prefix> <filepath>
  pull <peer_id_prefix> <file_id> [output_path]
  sources <file_id>
  pull-multi <file_id> [output_path] [parallelism]
  resume <file_id> [output_path] [parallelism]
  receive
  download <file_id> [output_path]
  status
  trust
  trust <peer_id_prefix> approve
  trust <peer_id_prefix> revoke [reason]
  help
  exit
`);
}

async function startCommand(args) {
  const port = Number(args.port || DEFAULT_TCP_PORT);
  const noAi = Boolean(args['no-ai']);
  const replicationFactor = Number(args['replication-factor'] || process.env.ARCHIPEL_REPLICATION_FACTOR || 2);
  const node = new ArchipelNode({ port, noAi, replicationFactor });
  node.start();
  const webEnabled = Boolean(args.web);
  const webPort = Number(args['web-port'] || 8080);
  const webOnly = Boolean(args['web-only']);
  const dashboard = webEnabled ? new DashboardServer({ node, logger: node.logger, port: webPort }) : null;
  if (dashboard) dashboard.start();

  if (webOnly) {
    const shutdown = () => {
      if (dashboard) dashboard.stop();
      node.stop();
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    // Keep process alive in headless mode.
    setInterval(() => {}, 1 << 30);
    return;
  }

  printHelp();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'archipel> ',
  });

  rl.prompt();
  rl.on('line', async (line) => {
    const raw = line.trim();
    if (!raw) {
      rl.prompt();
      return;
    }

    const [cmd, ...rest] = raw.split(' ');

    try {
      if (cmd === 'peers') {
        const peers = node.listPeers();
        if (peers.length === 0) {
          console.log('Aucun pair detecte');
        } else {
          for (const p of peers) {
            console.log(`${p.nodeId.slice(0, 12)} | ${p.ip}:${p.tcpPort} | ${p.status}`);
          }
        }
      } else if (cmd === 'msg') {
        const peer = rest[0];
        const text = rest.slice(1).join(' ');
        const res = await node.sendMessage(peer, text);
        console.log('ACK:', res);
      } else if (cmd === 'ask') {
        const question = rest.join(' ');
        const answer = await node.askAi(question);
        console.log(answer);
      } else if (cmd === 'send') {
        const peer = rest[0];
        const filePath = rest.slice(1).join(' ');
        const res = await node.sendFile(peer, filePath);
        console.log(`Transfert termine: ${res.manifest.filename} -> ${peer}`);
        console.log(res.finalize);
      } else if (cmd === 'share') {
        const filePath = rest.join(' ');
        const manifest = node.shareFile(filePath);
        console.log(`Fichier partage: ${manifest.filename}`);
        console.log(`file_id: ${manifest.fileId}`);
      } else if (cmd === 'pull') {
        const peer = rest[0];
        const fileId = rest[1];
        const outputPath = rest[2] || null;
        const res = await node.pullFile(peer, fileId, outputPath);
        console.log('Pull termine:', res);
      } else if (cmd === 'sources') {
        const fileId = rest[0];
        const sources = node.findSourcePeers(fileId);
        if (sources.length === 0) {
          console.log('Aucune source detectee');
        } else {
          for (const s of sources) {
            console.log(`${s.nodeId.slice(0, 12)} | ${s.ip}:${s.tcpPort} | ${s.status}`);
          }
        }
      } else if (cmd === 'pull-multi') {
        const fileId = rest[0];
        const outputPath = rest[1] || null;
        const parallelism = Number(rest[2] || 3);
        const res = await node.pullFileMulti(fileId, outputPath, parallelism);
        console.log('Pull multi termine:', res);
      } else if (cmd === 'resume') {
        const fileId = rest[0];
        const outputPath = rest[1] || null;
        const parallelism = Number(rest[2] || 3);
        const res = await node.pullFileMulti(fileId, outputPath, parallelism);
        console.log('Resume termine:', res);
      } else if (cmd === 'receive') {
        const manifests = node.transfer.listManifests();
        if (manifests.length === 0) {
          console.log('Aucun fichier recu');
        } else {
          manifests.forEach((m) => {
            console.log(`${m.fileId.slice(0, 12)} | ${m.filename} | ${m.status} | ${m.receivedChunks || 0}/${m.nbChunks}`);
          });
        }
      } else if (cmd === 'download') {
        const fileId = rest[0];
        const outputPath = rest[1] || null;
        const result = node.assemble(fileId, outputPath);
        console.log(result);
      } else if (cmd === 'status') {
        console.log(JSON.stringify(node.status(), null, 2));
      } else if (cmd === 'trust') {
        if (rest.length === 0) {
          console.log(JSON.stringify(node.listTrust(), null, 2));
        } else {
          const [peerPrefix, action, ...tail] = rest;
          if (action === 'approve') {
            const res = await node.approvePeer(peerPrefix);
            console.log(JSON.stringify({ ok: true, action: 'approve', ...res }, null, 2));
          } else if (action === 'revoke') {
            const reason = tail.join(' ') || 'manual_revoke';
            const res = node.revokePeer(peerPrefix, reason);
            console.log(JSON.stringify({ ok: true, action: 'revoke', ...res }, null, 2));
          } else {
            console.log('Usage: trust <peer_id_prefix> approve|revoke [reason]');
          }
        }
      } else if (cmd === 'help') {
        printHelp();
      } else if (cmd === 'exit' || cmd === 'quit') {
        rl.close();
        return;
      } else {
        console.log('Commande inconnue. Tape `help`.');
      }
    } catch (err) {
      console.error('Erreur:', err.message);
    }

    rl.prompt();
  });

  rl.on('close', () => {
    if (dashboard) dashboard.stop();
    node.stop();
    process.exit(0);
  });
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];

  if (!command || command === 'help') {
    printHelp();
    process.exit(0);
  }

  if (command === 'start') {
    await startCommand(args);
    return;
  }

  console.error('Commande non supportee. Utilise `start`.');
  process.exit(1);
})();
