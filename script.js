'use strict';
/*jshint esversion: 6, node:true */

const nconf = require('nconf');

nconf.env().argv({'release': {'type' : 'string'}});

let helpers = require('lambda-helpers');

let runner = require('./index');
helpers.lambda_promise(runner.produceDataset)({'release' : nconf.get('release'), 'file' : nconf.get('output'), 'interpro_bucket' : nconf.get('interpro_bucket'), 'interpro_bucket_prefix' : nconf.get('interpro_bucket_prefix')}).then(function(result) {
  console.log(result);
});