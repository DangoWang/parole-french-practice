'use strict';
const {getDatabase}=require('../server/database');
const {session,origin}=require('../server/auth');
module.exports=require('../server/sync-handler').createHandler({getCollection:async()=>(await getDatabase()).collection('study'),getSession:async req=>session(req,await getDatabase())});
