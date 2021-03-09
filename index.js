'use strict';
/*jshint esversion: 6, node:true */

const AWS = require('lambda-helpers').AWS;
const fs = require('fs');

const stream = require('stream');
const util = require('util');

const Transform = stream.Transform;

var bucket_name = 'test-gator';

let interpro_bucket = 'node-lambda';
let glycodomain_bucket = 'node-lambda';
let interpro_bucket_prefix = '/interpro';

let config = {};

try {
    config = require('./resources.conf.json');
    bucket_name = config.buckets.dataBucket;
} catch (e) {
}

if (config.region) {
  require('lambda-helpers').AWS.setRegion(config.region);
}

const s3 = new AWS.S3();

const LOCAL_FILES = process.env.LOCAL_FILES ? process.env['LOCAL_FILES'] : null;

const LOCAL_RELEASE = process.env.LOCAL_RELEASE;

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


function DomainTransform(names,classes,groups,options) {
  if (!(this instanceof DomainTransform)) {
    return new DomainTransform(names,classes,groups,options);
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
    if (this.domains.length > 0) {
      this.push([this.lastid.toLowerCase(),JSON.stringify([].concat(this.domains)),this.lasttax]);
    }
    this.domains = [];
  }
  let interpro = obj[1];
  let entry_type = this.groups[interpro];
  if ( ! entry_type )  {
    this.lastid = obj[0];
    this.lasttax = obj[4];
    cb();
    return;
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
  this.push('\n},\n"metadata":'+JSON.stringify(this.meta)+'\n}\n');
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

const get_interpro_set_keys = function(bucket,release) {
  var params = {
    Bucket: bucket,
    Prefix: interpro_bucket_prefix+"/InterPro"+(release ? ("-"+release) : "")
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

const create_json_writer = function(interpro_release,glycodomain_release,taxonomies,file) {
  let out = (new require('stream').PassThrough({objectMode: true}));
  let write_promises = [];
  taxonomies.forEach(function(tax) {
    let meta = { "mimetype" : "application/json+glycodomain",
                 "title" : "GlycoDomain "+tax,
                 "version" : { interpro: interpro_release,
                                glycodomain: glycodomain_release,
                                taxonomy: tax } };
    let json_stream = out.pipe(new TaxFilter(tax)).pipe(new CheapJSON(meta));
    let outstream;
    if (file) {
      outstream = upload_data_file(file+'/glycodomain_'+tax+'.json');
    } else {
      outstream = upload_data_s3(tax);
    }
    json_stream.pipe(outstream);
    write_promises.push(outstream.promise);
  });
  out.promise = Promise.all(write_promises);
  return out;
};

const get_uniprot_membrane_stream_s3 = function(taxid) {
  let s3_stream = retrieve_file_s3(interpro_bucket,interpro_bucket_prefix+'/membrane-'+taxid);
  let result = line_filter(s3_stream);
  return result;
};

const get_interpro_streams_s3 = function(release) {
  return get_interpro_set_keys(interpro_bucket,release).then(function(interpros) {
    // interpros = ['interpro/InterPro-10029.tsv','interpro/InterPro-6239.tsv'];
    // interpros = ['interpro/InterPro-9606.tsv','interpro/InterPro-10116.tsv','interpro/InterPro-10090.tsv','interpro/InterPro-559292.tsv','interpro/InterPro-7227.tsv'];
    console.log("Merging ",interpros.join(','));
    return (interpros.map(retrieve_file_s3.bind(null,interpro_bucket))).map(function(stream,idx) {
      let lines = line_filter(stream);
      let taxid = interpros[idx].replace(/.*InterPro-(?:[\d+\.]+-)?/,'').replace(/\.tsv/,'');
      lines.taxid = taxid;
      let result = new StreamInterleaver(get_uniprot_membrane_stream_s3(taxid));
      result.taxid = taxid;
      return lines.pipe(result);
    });
  });
};

const get_interpro_streams = function(release) {
  if (LOCAL_FILES) {
    return get_interpro_streams_local(release,LOCAL_FILES);
  } else {
    return get_interpro_streams_s3(release);    
  }
};

const get_interpro_streams_local = function(release,folder) {
  let files = fs.readdirSync(folder);
  let taxids = files.filter( file => file.indexOf(`InterPro-${release}`) == 0 ).map( file => file.replace('.tsv','').split('-')[2]);
  let streams = taxids.map( taxid => {
    let stream = line_filter(fs.createReadStream(`${folder}/InterPro-${release}-${taxid}.tsv`));
    let membrane_stream = line_filter(fs.createReadStream(`${folder}/membrane-${taxid}`));
    let result = new StreamInterleaver(membrane_stream);
    stream.taxid = taxid;
    result.taxid = taxid;
    return stream.pipe(result);
  });
  return Promise.resolve(streams);
}

let classes_promise = null;
let names_promise = null;
let groups_promise = null;

const parse_glycodomain_classes = function(data) {
  let classes = {};
  (data.Body || '').toString().split('\n').forEach(function(line) {
    let bits = line.split('\t');
    classes[bits[0]] = classes[bits[0]] || [];
    classes[bits[0]].push(bits[1]);
  });
  return classes;
};

const download_glycodomain_classes = function() {
  if ( classes_promise ) {
    return classes_promise;
  }
  classes_promise = download_file_s3(glycodomain_bucket,'glycodomain/Glycodomain-latest-InterPro-latest-class.tsv').then(parse_glycodomain_classes);
  return classes_promise;
};

const parse_interpro_names = function(data) {
  let names = {'TMhelix':'TMhelix', 'SIGNAL' : 'SIGNAL'};
  names['release'] = data.Metadata.interpro;
  (data.Body || '').toString().split('\n').forEach(function(line) {
    let bits = line.split('\t');
    names[bits[0]] = bits[1];
  });
  return names;
};

const download_interpro_names = function() {
  if (names_promise) {
    return names_promise;
  }
  names_promise = download_file_s3(interpro_bucket,interpro_bucket_prefix+'/meta-InterPro.tsv').then(parse_interpro_names);
  return names_promise;
};

const parse_interpro_classes = function(data) {
  let groups = {'TMhelix' : 'topo', 'SIGNAL' : 'topo'};
  (data.Body || '').toString().split(/\n/).forEach(function(entry) {
    let fields = entry.split('\t');
    let clazz = fields[1];
    let interpro = fields[0];
    groups[interpro] = clazz;
  });
  return groups;  
};

const download_interpro_classes = function() {
  if (groups_promise) {
    return groups_promise;
  }
  groups_promise = download_file_s3(interpro_bucket,interpro_bucket_prefix+'/class-InterPro.tsv').then(parse_interpro_classes);
  return groups_promise;
};

const read_interpro_classes_local = function() {
  if (groups_promise) {
    return groups_promise;
  }
  groups_promise = Promise.resolve({Body: fs.readFileSync(LOCAL_FILES+'/class-InterPro.tsv')}).then(parse_interpro_classes);
  return groups_promise;
};

const read_interpro_names_local = function(release) {
  if (names_promise) {
    return names_promise;
  }
  names_promise = Promise.resolve({Body: fs.readFileSync(LOCAL_FILES+'/meta-InterPro.tsv'), Metadata: { interpro: release }}).then(parse_interpro_names);
  return names_promise;
};

const read_glycodomain_classes_local = function() {
  if ( classes_promise ) {
    return classes_promise;
  }
  classes_promise = Promise.resolve({Body: fs.readFileSync(LOCAL_FILES+'/Glycodomain-latest-InterPro-latest-class.tsv')}).then(parse_glycodomain_classes);
  return classes_promise;
};

const create_glycodomain_filter = function() {
  let classes = {};
  let names = {};
  let data_promises;
  if (LOCAL_FILES) {
    data_promises = [ read_glycodomain_classes_local(), read_interpro_names_local(LOCAL_RELEASE), read_interpro_classes_local() ];  
  } else {
    data_promises = [ download_glycodomain_classes(), download_interpro_names(), download_interpro_classes() ];
  }
  return Promise.all(data_promises).then(function(results) {
    let classes = results[0];
    let names = results[1];
    let groups = results[2];
    let filter = new DomainTransform(names,classes,groups);
    filter.interpro_release = names['release'];
    filter.glycodomain_release = 'latest';
    // delete names['release'];
    return filter;
  });
};

const produce_dataset = function(release,file_output) {
  return get_interpro_streams(release).then(function(interpro_streams) {
    let taxids = interpro_streams.map((str) => str.taxid );
    let write_promises = interpro_streams.map(function(interpro_stream) {
      return create_glycodomain_filter().then(function(domain_filter) {
        let writer = create_json_writer(domain_filter.interpro_release, domain_filter.glycodomain_release, [interpro_stream.taxid],file_output);
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
  if (event.interpro_bucket) {
    interpro_bucket = event.interpro_bucket;
  }

  if (event.interpro_bucket_prefix) {
    interpro_bucket_prefix = event.interpro_bucket_prefix;
  }
  let result_promise = produce_dataset(event.release,event.file);
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