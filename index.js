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

function Filter(names,classes, options) {
  if (!(this instanceof Filter)) {
    return new Filter(taxid, options);
  }

  if (!options) options = {};
  options.objectMode = true;
  Transform.call(this, options);
  this.names = names;
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
  let data = {'dom' : this.names[obj[1]], 'interpro' : obj[1], 'start' : parseInt(obj[2]), 'end' : parseInt(obj[3]) };
  if (this.classes[obj[1]]) {
    data.class = this.classes[obj[1]];
  }
  this.domains.push(data);
  this.lastid = obj[0];
  cb();
};

const line_filter = function(filter,stream) {
  return new Promise(function(resolve) {
    var lineReader = require('readline').createInterface({
      input: stream
    });
    lineReader.on('line',function(dat) {
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

const create_json_writer = function(interpro_release,glycodomain_release,taxonomies) {
  let meta = [{ interpro: interpro_release, glycodomain: glycodomain_release, taxonomy: taxonomies }];
  var out = JSONStream.stringifyObject('{\n"data" : {\n\t',',\n\t','\n},\n"metadata":'+JSON.stringify(meta)+'\n}');
  out.on('error',function(err) {
    console.log(err,err.stack);
  });
  out.pipe(fs.createWriteStream('test.json'));
  //out.pipe(upload_data_s3());
  return out;
};

const get_interpro_streams_s3 = function() {
  return get_interpro_set_keys('node-lambda').then(function(interpros) {
    return (interpros.map(retrieve_file_s3.bind(null,'node-lambda'))).map(function(stream,idx) {
      let result = (new require('stream').PassThrough());
      stream.pipe(result);
      result.taxid = interpros[idx].replace(/.*InterPro-/,'');
      return result;
    });
  });
};

const get_interpro_streams = function() {
  //return get_interpro_streams_s3();
  let stream = fs.createReadStream('InterPro-559292.tsv');
  stream.taxid = '559292';
  return Promise.resolve([ stream ]);
};

const download_glycodomain_classes = function() {
  return download_file_s3('node-lambda','glycodomain/Glycodomain-latest-InterPro-latest-class.tsv').then(function(data) {
    let classes = {};
    (data.Body || '').toString().split('\n').forEach(function(line) {
      let bits = line.split('\t');
      classes[bits[0]] = classes[bits[0]] || [];
      classes[bits[0]].push(bits[1]);
    });
    return classes;
  });
};

const download_interpro_names = function() {
  return download_file_s3('node-lambda','interpro/meta-InterPro.tsv').then(function(data) {
    let names = {};
    names['release'] = data.Metadata.interpro;
    (data.Body || '').toString().split('\n').forEach(function(line) {
      let bits = line.split('\t');
      names[bits[0]] = bits[1];
    });
    return names;
  });
};

const create_glycodomain_filter = function() {
  let classes = {};
  let names = {};
  return Promise.all([ download_glycodomain_classes(), download_interpro_names() ]).then(function(results) {
    let classes = results[0];
    let names = results[1];
    let filter = new Filter(names,classes);
    let result = line_filter.bind(null,filter);
    result.interpro_release = names['release'];
    result.glycodomain_release = 'latest';
    delete names['release'];
    return result;
  });
};

const produce_dataset = function() {
  return get_interpro_streams().then(function(interpro_streams) {
    let combined = require('stream-stream')();
    let taxids = interpro_streams.map((str) => str.taxid );
    while( interpro_streams.length > 0 ) {
      combined.write(interpro_streams.shift());
    }
    combined.end();
    return create_glycodomain_filter().then(function(domain_filter) {
      let writer = create_json_writer(domain_filter.interpro_release, domain_filter.glycodomain_release, taxids);
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