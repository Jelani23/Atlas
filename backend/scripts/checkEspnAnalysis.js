require('dotenv').config({path:require('node:path').resolve(__dirname,'../.env')});
const {configuration,runBridge}=require('../src/integrations/espnFantasy');
const {analyze}=require('../src/integrations/espnAnalysisPresenter');
(async()=>{
    const snapshot=await runBridge(configuration(),'snapshot');
    if(snapshot.error) throw new Error(snapshot.error);
    console.log(JSON.stringify({snapshotVersion:snapshot.snapshotVersion,fetchedAt:snapshot.fetchedAt,teams:snapshot.teams.length,
        rosterPlayers:snapshot.teams.reduce((n,t)=>n+t.roster.length,0),freeAgents:snapshot.freeAgents.length,games:snapshot.games.length,
        lock:snapshot.settings.rosterSettings.lineupLocktimeType}));
    for(const action of ['league_analysis','optimize_lineup','forecast','waiver_scout','trade_scout']) {
        const start=Date.now();const result=analyze(snapshot,action);
        console.log(JSON.stringify({action,elapsedMs:Date.now()-start,result}));
    }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
