'use strict';
const {getDatabase}=require('../server/database');
module.exports=require('../server/auth').makeAuth({getDatabase});
