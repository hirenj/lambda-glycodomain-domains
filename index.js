'use strict';
/*jshint esversion: 6, node:true */

const AWS = require('lambda-helpers').AWS;
const s3 = new AWS.S3();
const JSONStream = require('JSONStream');
const fs = require('fs');

const stream = require('stream');
const util = require('util');

const Transform = stream.Transform;

var bucket_name = 'test-gator';

try {
    var config = require('./resources.conf.json');
    bucket_name = config.buckets.dataBucket;
} catch (e) {
}

var upload_data_s3 = function upload_data_s3(stream) {
  var params = {
    'Bucket': bucket_name,
    'Key': 'uploads/glycodomain/public',
    'ContentType': 'application/json'
  };
  params.Body = (new require('stream').PassThrough());
  var options = {partSize: 5 * 1024 * 1024, queueSize: 1};
  s3.upload(params, options,function(err,data) {
    console.log(err);
    console.log(data);
  });
  return params.Body;
};

function Filter(classes, options) {
  if (!(this instanceof Filter)) {
    return new Filter(taxid, options);
  }

  if (!options) options = {};
  options.objectMode = true;
  Transform.call(this, options);
  this.classes = classes;
  this.lastid = null;
  this.domains = [];
}

util.inherits(Filter, Transform);

/* filter each object's sensitive properties */
Filter.prototype._transform = function (obj,enc,cb) {
  if (this.lastid != null && this.lastid !== obj[0]) {
    this.push([this.lastid.toLowerCase(),[].concat(this.domains)]);
    this.domains = [];
  }
  this.domains.push({'dom' : obj[1], 'start' : parseInt(obj[2]), 'end' : parseInt(obj[3]) });
  this.lastid = obj[0];
  cb();
};

const line_filter = function(filter,stream) {
  return new Promise(function(resolve) {
    var lineReader = require('readline').createInterface({
      input: stream
    });
    lineReader.on('line',function(dat) {
      console.log(dat);
      let row = dat.toString().split('\t');
      filter.write(row);
    });

    lineReader.on('close',function() {
      console.log("Done reading");
      filter.write([null,null,null,null]);
      filter.end();
    });

    lineReader.on('error',function(err) {
      console.log(err);
      reject(err);
    });

    resolve(filter);
  });
};

const retrieve_file_s3 = function retrieve_file_s3(bucket,filekey) {
  var params = {
    'Key' : filekey,
    'Bucket' : bucket
  };
  return s3.getObject(params).createReadStream();
};


const download_file_s3 = function(bucket,key) {
  var params = {
    'Key' : key,
    'Bucket' : bucket
  };
  return s3.getObject(params).promise();
};

const get_interpro_set_keys = function(bucket) {
  var params = {
    Bucket: bucket,
    Prefix: "interpro/InterPro"
  };
  return s3.listObjects(params).promise().then(function(result) {
    let keys = result.Contents.map(function(content) { return content.Key; });
    return keys;
  });
};

const create_json_writer = function() {
  let meta = [{ a:'b'}];
  var out = JSONStream.stringifyObject('{\n"data" : {\n\t',',\n\t','\n},\n"metadata":'+JSON.stringify(meta)+'\n}');
  out.on('error',function(err) {
    console.log(err,err.stack);
  });
  //out.pipe(fs.createWriteStream('test.json'));
  out.pipe(upload_data_s3());
  return out;
};

const get_interpro_streams_s3 = function() {
  return get_interpro_set_keys('node-lambda').then(function(interpros) {
    return (interpros.map(retrieve_file_s3.bind(null,'node-lambda'))).map(function(stream) {
      let result = (new require('stream').PassThrough());
      stream.pipe(result);
      return result;
    });
  });
};

const get_interpro_streams = function() {
  //return get_interpro_streams_s3();
  return Promise.resolve([ fs.createReadStream('InterPro-559292.tsv') ]);
};

const create_glycodomain_filter = function() {
  let classes = [];
  return Promise.resolve(line_filter.bind(null,new Filter(classes)));
};

const produce_dataset = function() {
  return get_interpro_streams().then(function(interpro_streams) {
    let combined = require('stream-stream')();
    while( interpro_streams.length > 0 ) {
      combined.write(interpro_streams.shift());
    }
    combined.end();
    let writer = create_json_writer();
    return create_glycodomain_filter().then(function(domain_filter) {
      return domain_filter(combined).then(function(stream) {
        stream.pipe(writer);
        return new Promise(function(resolve,reject) {
          stream.on('end',function() {
            console.log("Done");
            resolve();
          });
          stream.on('error',function(err) {
            console.log(err);
            reject();
          });
        });
      });
    });
  }).catch(function(err) {
    console.log(err,err.stack);
  });
};

var download_all_data_s3 = function(accession,grants) {
  // Get metadata entries that contain the desired accession
  var start_time = (new Date()).getTime();
  console.log("datasets_containing_acc start ");
  return datasets_containing_acc(accession).then(function(sets) {
    console.log("datasets_containing_acc end ",(new Date()).getTime() - start_time);
    console.log(sets);
    var valid_sets = [];
    sets.forEach(function(set) {

      // Filter metadata by the JWT permissions

      if (grants[set.group_id+'/'+set.id]) {
        var valid_prots = grants[set.group_id+'/'+set.id];
        if (valid_prots.filter(function(id) { return id == '*' || id.toLowerCase() == accession; }).length > 0) {
          valid_sets.push(set.group_id+':'+set.id);
        }
      }
      if (grants[set.group_id+'/*']) {
        var valid_prots = grants[set.group_id+'/*'];
        if (valid_prots.filter(function(id) { return id == '*' || id.toLowerCase() == accession; }).length > 0) {
          valid_sets.push(set.group_id+':'+set.id);
        }
      }
    });
    console.log(valid_sets.join(','));
    return valid_sets;
  }).then(function(sets) {
    start_time = (new Date()).getTime();
    // Get data from S3 and combine
    console.log("download_set_s3 start");
    return Promise.all(sets.map(function (set) { return download_set_s3(set+'/'+accession); })).then(function(entries) {
      console.log("download_set_s3 end ",(new Date()).getTime() - start_time);
      return entries;
    });
  });
};

var produceDataset = function produceDataset(event,context) {
  let result_promise = produce_dataset();
  result_promise.then(function(done) {
    console.log("Uploaded all components");
    context.succeed('OK');
    // Upload the metadata at the end of a successful decomposition
  }).catch(function(err) {
    console.error(err);
    console.error(err.stack);
    context.succeed('NOT-OK');
  });
};

exports.produceDataset = produceDataset;