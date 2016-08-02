var foo = require('./index');
foo.produceDataset({},{succeed: function(message) { console.log(message); }});