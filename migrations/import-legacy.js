'use strict';

const path = require('node:path');
const { createStorage } = require('../storage');

async function main() {
  if (!process.env.DATABASE_URL || !process.env.LEGACY_DATA_FILE) throw new Error('Configure DATABASE_URL e LEGACY_DATA_FILE em variáveis privadas. O arquivo deve ser uma cópia de backup, fora do repositório.');
  const storage = createStorage({ databaseUrl:process.env.DATABASE_URL,dataFile:path.resolve(process.env.LEGACY_DATA_FILE),legacyDataFile:path.resolve(process.env.LEGACY_DATA_FILE),importLegacy:true,production:true });
  try {
    const data = await storage.load();
    console.log(JSON.stringify({ ok:true,usuarios:Object.keys(data.users).length,perfis:Object.keys(data.profiles).length,sessoes:Object.keys(data.sessions).length,mensagens:Object.values(data.msgs).reduce((total,items)=>total+items.length,0),origemPreservada:true }));
  } finally { await storage.close(); }
}

main().catch(() => { console.error('A importação falhou; a origem foi preservada e a transação não foi confirmada. Confira o arquivo, acesso ao banco e conflitos antes de tentar novamente.'); process.exitCode=1; });
