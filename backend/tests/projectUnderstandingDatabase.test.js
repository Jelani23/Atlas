const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const {createRepository}=require('../src/memory/projectUnderstandingRepository');
async function main(){
    const db=new PGlite();
    const key=JSON.stringify(['atlas','alice','src/example.js']);
    const record={schema:2,project:'atlas',agentId:'alice',path:'src/example.js',status:'interpretation_unverified',version:'a'.repeat(64),analysisRevision:'b'.repeat(64),analysis:{}};
    try {
        await db.exec("create role anon; create role authenticated; create role service_role bypassrls; create table agents(agent_id text primary key); insert into agents values ('alice'), ('bob');");
        const sql=fs.readFileSync(path.join(__dirname,'../src/database/migrations/017_project_understanding.sql'),'utf8');
        await db.exec(sql);
        await db.query('insert into project_understanding(project_key,agent_id,file_path,record) values ($1,$2,$3,$4)', ['atlas','alice','src/example.js',JSON.stringify(record)]);
        await db.exec(sql);
        assert.deepEqual((await db.query('select record from project_understanding')).rows[0].record,record);
        const withEvidence={...record,checkedEvidence:{status:'passed',scope:'Isolated fixture only',results:[{id:'example',observed:{calls:0}}]}};
        await db.query('update project_understanding set record=$1',[JSON.stringify(withEvidence)]);
        assert.deepEqual((await db.query('select record from project_understanding')).rows[0].record.checkedEvidence,withEvidence.checkedEvidence);
        await assert.rejects(db.query("update project_understanding set record='{}'"),/check constraint/);
        await assert.rejects(db.query('update project_understanding set record=$1',[JSON.stringify({...record,agentId:'bob'})]),/check constraint/);
        await db.exec('set role anon');
        await assert.rejects(db.query('select * from project_understanding'),/permission denied/);
        await db.exec('reset role; set role authenticated');
        await assert.rejects(db.query('select * from project_understanding'),/permission denied/);
        await db.exec('reset role; set role service_role');
        assert.equal((await db.query('select * from project_understanding')).rows.length,1);
    }finally{await db.close();}
    let filters={},saved;
    const client={from(table){assert.equal(table,'project_understanding');return {
        select(){return {eq(k,v){filters[k]=v;return this;},async maybeSingle(){return {data:{record}};}};},
        upsert(value,options){saved=value;assert.equal(options.onConflict,'project_key,agent_id,file_path');return {select(){return {async single(){return {data:{file_path:value.file_path}};}};}};}
    };}};
    const repository=createRepository(client);
    assert.deepEqual(await repository.get(key),record);
    assert.deepEqual(filters,{project_key:'atlas',agent_id:'alice',file_path:'src/example.js'});
    await repository.put(key,record);assert.deepEqual(saved.record,record);
    await assert.rejects(repository.put(key,{...record,agentId:'bob'}),/identity mismatch/);
    const unavailable=createRepository({from(){return {select(){return {eq(){return this;},async maybeSingle(){return {error:{message:'offline'}};}};}};}});
    await assert.rejects(unavailable.get(key),/no local fallback/);
    const failedSave=createRepository({from(){return {upsert(){return {select(){return {async single(){return {error:{message:'denied'}};}};}};}};}});
    await assert.rejects(failedSave.put(key,record),/denied/);
    console.log('Understanding database: idempotent migration, ownership constraints, role access and repository failures passed.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
