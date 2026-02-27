#!/usr/bin/env node

function help() {
  console.log('Archipel CLI (Sprint 0)');
  console.log('Commandes disponibles:');
  console.log('  start --port <port>   (placeholder sprint 0)');
  console.log('  help');
}

const args = process.argv.slice(2);
const cmd = args[0] || 'help';

if (cmd === 'start') {
  const portFlag = args.indexOf('--port');
  const port = portFlag >= 0 ? args[portFlag + 1] : '7777';
  console.log(`[Sprint 0] Bootstrap OK. Node port cible: ${port}`);
  console.log('La couche reseau/crypto sera implementee a partir du Sprint 1.');
  process.exit(0);
}

help();
