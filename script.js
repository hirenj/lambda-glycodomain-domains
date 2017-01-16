'use strict';
/*jshint esversion: 6, node:true */

var helpers = require('lambda-helpers');

let runner = require('./index');
helpers.lambda_promise(runner.produceDataset)({'release' : '60.0', 'file' : 'dist', 'interpro_bucket' : 'glycodomain-data-builds', 'interpro_bucket_prefix' : 'glycodomain/interpro'}).then(function(result) {
  console.log(result);
});