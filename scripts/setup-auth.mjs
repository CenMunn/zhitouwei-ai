import fs from 'node:fs/promises'
import path from 'node:path'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import {randomBytes} from 'node:crypto'
import {hashPassword} from '../src/lib/auth/core.ts'
const root=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(import.meta.url)
createRequire(require.resolve('next/package.json'))('@next/env').loadEnvConfig(root,true,{info(){},error(){}})
// Match start-local.mjs explicitly; never resolve a relative .env URL against
// the generated client package or migrate the protected initial database.
const target=path.resolve(process.env.AUTH_DATABASE_PATH??path.join(root,'db/semifinal.db'))
await fs.access(target)
process.env.DATABASE_URL=`file:${target.replaceAll('\\','/')}`
const {PrismaClient}=require('@prisma/client'),db=new PrismaClient()
const dir=path.join(root,'.local');await fs.mkdir(dir,{recursive:true})
try {
 const databases=await db.$queryRawUnsafe('PRAGMA database_list')
 const actual=databases.find(x=>x.name==='main')?.file
 if(!actual)throw Error('SQLITE_DATABASE_REQUIRED')
 const backup=path.join(dir,`before-auth-${new Date().toISOString().replace(/[:.]/g,'-')}.db`)
 await db.$executeRawUnsafe(`VACUUM INTO '${backup.replaceAll("'","''")}'`)
 await db.$transaction(async tx=>{
  await tx.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS "User" ("id" TEXT NOT NULL PRIMARY KEY,"username" TEXT NOT NULL,"displayName" TEXT NOT NULL,"passwordHash" TEXT NOT NULL,"role" TEXT NOT NULL DEFAULT \'USER\',"disabled" BOOLEAN NOT NULL DEFAULT false,"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" DATETIME NOT NULL)')
  await tx.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username")')
  await tx.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS "AuthSession" ("id" TEXT NOT NULL PRIMARY KEY,"tokenHash" TEXT NOT NULL,"userId" TEXT NOT NULL,"expiresAt" DATETIME NOT NULL,"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE)')
  await tx.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "AuthSession_tokenHash_key" ON "AuthSession"("tokenHash")')
  await tx.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt")')
  await tx.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "AuthSession_userId_idx" ON "AuthSession"("userId")')
  await tx.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS "AuthThrottle" ("key" TEXT NOT NULL PRIMARY KEY,"windowStart" DATETIME NOT NULL,"attempts" INTEGER NOT NULL DEFAULT 0)')
  for(const table of ['ResearchSession','ComparisonResult','WatchlistItem','PortfolioAnalysis']) {
   const columns=await tx.$queryRawUnsafe(`PRAGMA table_info("${table}")`)
   if(!columns.some(c=>c.name==='ownerId'))await tx.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN "ownerId" TEXT`)
   await tx.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "${table}_ownerId_idx" ON "${table}"("ownerId")`)
  }
  await tx.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "WatchlistItem_ownerId_stockCode_key" ON "WatchlistItem"("ownerId","stockCode")')
  await tx.$executeRawUnsafe('DROP INDEX IF EXISTS "WatchlistItem_stockCode_key"')
 })
 let admin=await db.user.findFirst({where:{role:'ADMIN',disabled:false}})
 let credentialsCreated=false
 if(!admin) {
  const password='Aa9'+randomBytes(18).toString('base64url')
  admin=await db.user.create({data:{username:'admin',displayName:'猫猫小分队管理员',passwordHash:await hashPassword(password),role:'ADMIN'}})
  await fs.writeFile(path.join(dir,'admin-credentials.json'),JSON.stringify({username:admin.username,password,role:'ADMIN',privateFile:true,createdAt:new Date().toISOString()},null,2)+'\n',{flag:'wx'})
  credentialsCreated=true
 }
 const adopted={}
 for(const model of ['researchSession','comparisonResult','watchlistItem','portfolioAnalysis'])adopted[model]=(await db[model].updateMany({where:{ownerId:null},data:{ownerId:admin.id}})).count
 console.log(JSON.stringify({migration:'additive_complete',backup,credentialsCreated,credentialsFile:path.join(dir,'admin-credentials.json'),historicalRowsAdopted:adopted}))
} finally {await db.$disconnect()}
