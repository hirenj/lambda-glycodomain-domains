'use strict';
/*jshint esversion: 6, node:true */

const AWS = require('lambda-helpers').AWS;
const s3 = new AWS.S3();
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

var upload_data_s3 = function upload_data_s3(taxid) {
  var params = {
    'Bucket': bucket_name,
    'Key': 'uploads/glycodomain_'+taxid+'/public',
    'ContentType': 'application/json'
  };
  console.log("Writing domains to ",params.Bucket,params.Key);
  params.Body = (new require('stream').PassThrough());
  var options = {partSize: 5 * 1024 * 1024, queueSize: 1};
  let written_promise = new Promise(function(resolve,reject) {
    s3.upload(params, options,function(err,data) {
      if (err) {
        console.log("Writing error for ",taxid,params.Bucket,params.Key);
        reject(err);
        return;
      }
      resolve(data);
    });
  });
  params.Body.promise = written_promise;
  return params.Body;
};

<<<<<<< HEAD
function Filter(names,classes,groups,options) {
  if (!(this instanceof Filter)) {
    return new Filter(names,classes,groups,options);
=======
function TaxFilter(taxid, options) {
  if (!(this instanceof TaxFilter)) {
    return new TaxFilter(taxid, options);
  }

  if (!options) options = {};
  options.objectMode = true;
  Transform.call(this, options);
  this.taxid = taxid;
}

util.inherits(TaxFilter, Transform);

TaxFilter.prototype._transform = function (obj, enc, cb) {
  if (this.taxid == obj[2]) {
    this.push(obj);
  }
  cb();
};


function DomainTransform(names,classes, options) {
  if (!(this instanceof DomainTransform)) {
    return new DomainTransform(taxid, options);
>>>>>>> merge_membrane
  }

  if (!options) options = {};
  options.objectMode = true;
  Transform.call(this, options);
  this.names = names;
  this.classes = classes;
  this.groups = groups;
  this.lastid = null;
  this.domains = [];
}

util.inherits(DomainTransform, Transform);

DomainTransform.prototype._transform = function (obj,enc,cb) {
  if (this.lastid != null && this.lastid !== obj[0]) {
<<<<<<< HEAD
    if (this.domains.length > 0) {
      this.push([this.lastid.toLowerCase(),[].concat(this.domains)]);
    }
    this.domains = [];
  }
  let interpro = obj[1];
  let entry_type = this.groups[interpro];
  if (! entry_type) {
    this.lastid = obj[0];
    cb();
    return;
=======
    this.push([this.lastid.toLowerCase(),JSON.stringify([].concat(this.domains)),this.lasttax]);
    this.domains = [];
  }
  let data = {'dom' : this.names[obj[1]], 'interpro' : obj[1], 'start' : parseInt(obj[2]), 'end' : parseInt(obj[3])};
  if (this.classes[obj[1]]) {
    data.class = this.classes[obj[1]];
>>>>>>> merge_membrane
  }
  let data = {'dom' : this.names[interpro], 'interpro' : interpro, 'start' : parseInt(obj[2]), 'end' : parseInt(obj[3]) };
  let glycodomain = this.classes[interpro];
  data.class = glycodomain ? glycodomain.filter(dom => dom !== 'Skipped' && dom !== 'REMOVE' && dom !== 'Skipped?').concat(entry_type) : [entry_type];
  this.domains.push(data);
  this.lastid = obj[0];
  this.lasttax = obj[4];
  cb();
};

function TabSplitter(options) {
  if (!(this instanceof TabSplitter)) {
    return new TabSplitter(options);
  }

  if (!options) options = {};
  options.objectMode = true;
  Transform.call(this, options);
}

util.inherits(TabSplitter, Transform);

TabSplitter.prototype._transform = function (obj,enc,cb) {
  this.push(obj.toString().split('\t'));
  cb();
};

TabSplitter.prototype._flush = function (cb) {
  this.push([null,null,null,null]);
  cb();
};

function CheapJSON(meta,options) {
  if (!(this instanceof CheapJSON)) {
    return new CheapJSON(meta,options);
  }

  if (!options) options = {};
  options.objectMode = true;
  this.meta = meta;
  this.first = false;
  Transform.call(this, options);
}

util.inherits(CheapJSON, Transform);

CheapJSON.prototype._transform = function (obj,enc,cb) {
  let sep = ',';
  if (! this.first) {
    sep = '{\n"data":{';
  }
  this.first = this.first || true;
  this.push(sep+'\n\t"'+obj[0]+'":'+obj[1]);//JSON.stringify(obj[1]));
  cb();
};

CheapJSON.prototype._flush = function(cb) {
  this.push('\n},\n"meta":'+JSON.stringify(this.meta)+'\n}\n');
  cb();
};

function StreamInterleaver(stream, taxid,options) {
  if (!(this instanceof StreamInterleaver)) {
    return new StreamInterleaver(stream, taxid,options);
  }

  if (!options) options = {};
  options.objectMode = true;
  Transform.call(this, options);
  this.stream = stream;
  this.taxid = taxid;
  let self = this;
  this.stream.on('end',function() {
    delete self.stream;
  });
}

util.inherits(StreamInterleaver, Transform);

StreamInterleaver.prototype._transform = function (obj,enc,cb) {
  let ref_id = obj[0];
  let self = this;
  if ( this.stream && ( ! this.first_row || this.first_row[0] <= ref_id ) ) {
    if (this.first_row) {
      this.push(this.first_row.concat(self.taxid));
      this.first_row = null;
    }
    this.stream.on('data',function(row) {
      self.stream.pause();
      let id = row[0];
      if (id <= ref_id) {
        self.push(row.concat(self.taxid));
        self.stream.resume();
      } else {
        self.first_row = row;
        self.push(obj.concat(self.taxid));
        self.stream.removeAllListeners('data');
        self.stream.removeListener('end',self.stream.end_cb);
        cb();
      }
    });
    this.stream.end_cb = function() {
      cb();
    };
    this.stream.on('end',this.stream.end_cb);
    self.stream.resume();
  } else {
    self.push(obj.concat(self.taxid));
    cb();
  }
};

StreamInterleaver.prototype._flush = function(cb) {
  var self = this;
  if (this.stream) {
    if (this.first_row) {
      this.push(this.first_row.concat(self.taxid));
    }
    this.stream.on('data',function(row) {
      self.push(row.concat(self.taxid));
    });
    this.stream.on('end',function() { console.log("Completed StreamInterleaver",self.taxid); cb(); });
    this.stream.resume();
  } else {
    console.log("Completed StreamInterleaver",self.taxid);
    cb();
  }
};

const line_filter = function(stream) {
  let byline = require('byline');
  let line_splitter = byline.createStream();
  return stream.pipe(line_splitter).pipe(new TabSplitter());
}

const line_filter_old = function(filter,stream) {
  var lineReader = require('readline').createInterface({
    input: stream
  });
  let line_count = 0;
  lineReader.on('line',function(dat) {
    let row = dat.toString().split('\t');
    line_count += 1;
    filter.write(row);
  });

  lineReader.on('close',function() {
    console.log("Done reading ",stream.source," read ",line_count," lines ");
    filter.write([null,null,null,null]);
    filter.end();
  });

  lineReader.on('error',function(err) {
    console.log(err);
  });
  filter.source = stream.source;
  return filter;
};

const retrieve_file_s3 = function retrieve_file_s3(bucket,filekey) {
  var params = {
    'Key' : filekey,
    'Bucket' : bucket
  };
  let stream = s3.getObject(params).createReadStream();
  stream.source = params.Key;
  return stream;
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

const upload_data_file = function(filename) {
  let outstream = fs.createWriteStream(filename);
  outstream.promise = new Promise(function(resolve,reject) {
    console.log("Binding events for writing");
    outstream.on('close', function() {
      console.log("Finished writing file");
      resolve();
    });
    outstream.on('error',function(err) {
      console.log(err);
      reject(err);
    });
  });
  return outstream;
};

const create_json_writer = function(interpro_release,glycodomain_release,taxonomies) {
  let out = (new require('stream').PassThrough({objectMode: true}));
  let write_promises = [];
  taxonomies.forEach(function(tax) {
    let meta = { "mimetype" : "application/json+glycodomain",
                 "title" : "GlycoDomain "+tax,
                 "version" : { interpro: interpro_release,
                                glycodomain: glycodomain_release,
                                taxonomy: tax } };
    let json_stream = out.pipe(new TaxFilter(tax)).pipe(new CheapJSON(meta));
    //upload_data_file('/tmp/foo_'+tax+'.json')
    let outstream = upload_data_s3(tax);
    json_stream.pipe(outstream);
    write_promises.push(outstream.promise);
  });
  out.promise = Promise.all(write_promises);
  return out;
};

const get_uniprot_membrane_stream_s3 = function(taxid) {
  let s3_stream = retrieve_file_s3('node-lambda','interpro/membrane-'+taxid);
  let result = line_filter(s3_stream);
  return result;
};

const get_interpro_streams_s3 = function() {
  return get_interpro_set_keys('node-lambda').then(function(interpros) {
    // interpros = ['interpro/InterPro-10029.tsv','interpro/InterPro-6239.tsv'];
    // interpros = ['interpro/InterPro-9606.tsv','interpro/InterPro-10116.tsv','interpro/InterPro-10090.tsv','interpro/InterPro-559292.tsv','interpro/InterPro-7227.tsv'];
    console.log("Merging ",interpros.join(','));
    return (interpros.map(retrieve_file_s3.bind(null,'node-lambda'))).map(function(stream,idx) {
      let lines = line_filter(stream);
      let taxid = interpros[idx].replace(/.*InterPro-/,'').replace(/\.tsv/,'');
      lines.taxid = taxid;
      let result = new StreamInterleaver(get_uniprot_membrane_stream_s3(taxid));
      result.taxid = taxid;
      return lines.pipe(result);
    });
  });
};

const get_interpro_streams = function() {
  return get_interpro_streams_s3();
  // let stream = fs.createReadStream('InterPro-559292.tsv');
  // stream.taxid = '559292';
  // return Promise.resolve([ stream ]);
};

let classes_promise = null;
let names_promise = null;

const download_glycodomain_classes = function() {
  if ( classes_promise ) {
    return classes_promise;
  }
  classes_promise = download_file_s3('node-lambda','glycodomain/Glycodomain-latest-InterPro-latest-class.tsv').then(function(data) {
    let classes = {};
    (data.Body || '').toString().split('\n').forEach(function(line) {
      let bits = line.split('\t');
      classes[bits[0]] = classes[bits[0]] || [];
      classes[bits[0]].push(bits[1]);
    });
    return classes;
  });
  return classes_promise;
};

const download_interpro_names = function() {
  if (names_promise) {
    return names_promise;
  }
  names_promise = download_file_s3('node-lambda','interpro/meta-InterPro.tsv').then(function(data) {
    let names = {'TMhelix':'TMhelix', 'SIGNAL' : 'SIGNAL'};
    names['release'] = data.Metadata.interpro;
    (data.Body || '').toString().split('\n').forEach(function(line) {
      let bits = line.split('\t');
      names[bits[0]] = bits[1];
    });
    return names;
  });
  return names_promise;
};

const download_interpro_classes = function() {
  return download_file_s3('node-lambda','interpro/class-InterPro.tsv').then(function(data) {
    let groups = {};
    (data.Body || '').toString().split(/(?!\nIPR.*\n)\n/).forEach(function(group) {
      let lines = group.split(/\n/);
      let clazz = lines.shift().trim();
      if (clazz == 'Domain' || clazz == 'Repeat') {
        lines.map(line => line.split(/\s/)[0]).forEach(interpro => groups[interpro] = clazz);
      }
    });
    return groups;
  });
};


const create_glycodomain_filter = function() {
  let classes = {};
  let names = {};
  return Promise.all([ download_glycodomain_classes(), download_interpro_names(), download_interpro_classes() ]).then(function(results) {
    let classes = results[0];
    let names = results[1];
<<<<<<< HEAD
    let groups = results[2];
    let filter = new Filter(names,classes,groups);
    let result = line_filter.bind(null,filter);
    result.interpro_release = names['release'];
    result.glycodomain_release = 'latest';
    delete names['release'];
    return result;
=======
    let filter = new DomainTransform(names,classes);
    filter.interpro_release = names['release'];
    filter.glycodomain_release = 'latest';
    // delete names['release'];
    return filter;
>>>>>>> merge_membrane
  });
};

const produce_dataset = function() {
  return get_interpro_streams().then(function(interpro_streams) {
    let taxids = interpro_streams.map((str) => str.taxid );
    let write_promises = interpro_streams.map(function(interpro_stream) {
      return create_glycodomain_filter().then(function(domain_filter) {
        let writer = create_json_writer(domain_filter.interpro_release, domain_filter.glycodomain_release, [interpro_stream.taxid]);
        let stream = interpro_stream.pipe(domain_filter);
        stream.pipe(writer);
        return new Promise(function(resolve,reject) {
          stream.on('end',function() {
            console.log("Done reading data for ",interpro_stream.taxid);
            resolve(writer);
          });
          stream.on('error',function(err) {
            console.log(err);
            reject();
          });
        });
      }).then(function(writer) {
        if (writer.promise) {
          return writer.promise;
        }
      });
    });
    return Promise.all(write_promises);
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