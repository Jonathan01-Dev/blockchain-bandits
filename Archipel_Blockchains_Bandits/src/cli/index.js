#!/usr/bin/env node
import readline from 'node:readline';
import net from 'node:net';
import { ArchipelNode } from '../core/node.js';

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      out[key] = value;
    } else {
      out._.push(token);
    }
  }
  return out;
}

function printHelp() {
  console.log('Archipel CLI (Sprint 1)');
  console.log('Usage: node src/cli/index.js start --port 7777');
  console.log('Commandes interactives: peers, status, ping <host> <port>, help, exit');
}

async function tcpPing(host, port) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port: Number(port) }, () => {
      socket.write('PING\n');
    });

    let done = false;
    socket.on('data', (buf) => {
      if (done) return;
      done = true;
      resolve(buf.toString('utf8').trim());
      socket.end();
    });

    socket.on('error', (err) => {
      if (!done) reject(err);
    });

    socket.setTimeout(5000, () => {
      if (!done) reject(new Error('TCP ping timeout'));
      socket.destroy();
    });
  });
}

async function runStart(args) {
  const port = Number(args.port || 7777);
  const node = new ArchipelNode({ port });
  node.start();

  printHelp();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'archipel> ',
  });

  rl.prompt();
  rl.on('line', async (line) => {
    const [cmd, ...rest] = line.trim().split(' ');

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
      } else if (cmd === 'status') {
        console.log(JSON.stringify(node.status(), null, 2));
      } else if (cmd === 'ping') {
        const [host, portArg] = rest;
        if (!host || !portArg) {
          console.log('Usage: ping <host> <port>');
        } else {
          const res = await tcpPing(host, portArg);
          console.log(`TCP reply: ${res}`);
        }
      } else if (cmd === 'help') {
        printHelp();
      } else if (cmd === 'exit' || cmd === 'quit') {
        rl.close();
        return;
      } else if (cmd.length > 0) {
        console.log('Commande inconnue. help pour la liste.');
      }
    } catch (err) {
      console.error(`Erreur: ${err.message}`);
    }

    rl.prompt();
  });

  rl.on('close', () => {
    node.stop();
    process.exit(0);
  });
}

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0] || 'help';

if (cmd === 'start') {
  runStart(args);
} else {
  printHelp();
}
