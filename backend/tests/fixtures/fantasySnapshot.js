const player=(id,name,rate,eligible,slot)=>({playerId:id,name,projectedAverage:rate,observedAverage:rate-1,
    eligibleSlots:eligible,lineupSlot:slot,lineupLocked:false,rosterLocked:false,droppable:true,injuryStatus:'ACTIVE',proTeamId:1});
function snapshot() {
    const games=[{id:1,scoringPeriod:1,startAt:Date.parse('2026-10-20T23:00:00Z'),home:1,away:2,completed:true,startTimeTBD:false}];
    for(const [period,date] of [[14,'02'],[15,'03'],[17,'05'],[20,'08'],[21,'09'],[22,'10'],[24,'12'],[27,'15']])
        games.push({id:period,scoringPeriod:period,startAt:Date.parse(`2026-11-${date}T23:00:00Z`),home:1,away:2,completed:false,startTimeTBD:false});
    return {snapshotVersion:1,leagueId:1,season:2027,leagueName:'Fixture League',team:{team_id:7,team_name:'Jitters'},
        fetchedAt:'2026-11-02T15:00:00Z',collectionStartedAt:'2026-11-02T14:59:59Z',scoringType:'H2H_POINTS',matchupPeriod:3,
        firstScoringPeriod:1,currentScoringPeriods:[14],games,
        settings:{rosterSettings:{lineupLocktimeType:'FIRSTGAME_WEEKLY',lineupSlotCounts:{0:1,4:1,12:2,13:1},lineupSlotStatLimits:{}},
            scheduleSettings:{periodTypeId:2,matchupPeriods:{3:[3],4:[4]}},acquisitionSettings:{matchupAcquisitionLimit:1},tradeSettings:{}},
        teams:[{team_id:7,team_name:'Jitters',roster:[player(1,'Flexible Star',50,['PG','C'],'PG'),player(2,'Guard Player',40,['PG'],'BE'),player(3,'Center Player',30,['C'],'C')]},
            {team_id:8,team_name:'Rival',roster:[player(4,'Rival Guard',20,['PG'],'PG'),player(5,'Rival Center',10,['C'],'C')]}],
        freeAgents:[player(6,'Waiver Center',60,['C'],'')],matchups:[{homeId:7,awayId:8,homeScore:10,awayScore:20}]};
}
module.exports={snapshot,player};
