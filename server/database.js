'use strict';
const {MongoClient}=require('mongodb');
let connection;
async function getDatabase(){
 if(!connection){const client=new MongoClient(process.env.MONGODB_URI,{maxPoolSize:3,minPoolSize:0,maxIdleTimeMS:60000,serverSelectionTimeoutMS:8000,connectTimeoutMS:8000});connection=client.connect().catch(async e=>{connection=null;await client.close().catch(()=>{});throw e;});}
 return (await connection).db(process.env.MONGODB_DB||'parole');
}
module.exports={getDatabase};
