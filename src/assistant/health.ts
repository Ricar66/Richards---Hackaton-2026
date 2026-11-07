import "dotenv/config";
import { getDb } from "@/lib/db";
try { const state=await getDb().assistantWorkerState.findUnique({where:{key:"telegram"}}); if(!state?.heartbeatAt||Date.now()-state.heartbeatAt.getTime()>30000)process.exitCode=1; }
catch {process.exitCode=1;}
finally {await getDb().$disconnect();}
