'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {PrismaClient} = require('@prisma/client');
const root = path.resolve(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'db/seed/universe.json'), 'utf8'));
const rows = data.stocks;
if (!Array.isArray(rows) || !rows.length) throw new Error('Stock seed is missing');
const db = new PrismaClient();
(async () => {
  try {
    for (let start=0; start<rows.length; start+=200) {
      await db.$transaction(rows.slice(start,start+200).map(row => {
        const item = {name:row.name, market:row.market, industry:row.industry || null};
        return db.stockUniverse.upsert({where:{code:row.code}, create:{code:row.code,...item}, update:item});
      }));
    }
    console.log('Public stock identities imported: ' + await db.stockUniverse.count());
  } finally { await db.$disconnect(); }
})().catch(error => {console.error(error.message); process.exitCode=1;});
