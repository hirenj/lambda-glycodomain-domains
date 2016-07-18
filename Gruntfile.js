/**
 * Grunt Uploader for Lambda scripts
 * Updated from original by Chris Moyer <cmoyer@aci.info>
 */
'use strict';
module.exports = function(grunt) {
  require('load-grunt-tasks')(grunt);

  var path = require('path');
  var config = {'functions' : {} };
  try {
    config = require('./resources.conf.json');
  } catch (e) {
  }

  grunt.initConfig({
    lambda_invoke: {
      produceDataset: {
        package: 'glycodomains',
        options: {
          file_name: 'index.js',
          handler: 'produceDataset',
          event: 'event.json',
        },
      },
    },
    lambda_deploy: {
      produceDataset: {
        package: 'glycodomains',
        options: {
          file_name: 'index.js',
          handler: 'index.produceDataset',
        },
        function: config.functions['glycodomainDomains'] || 'glycodomainDomains',
        arn: null,
      }
    },
    lambda_package: {
      produceDataset: {
        package: 'glycodomains',
      }
    },
    env: {
      prod: {
        NODE_ENV: 'production',
      },
    },

  });

  grunt.registerTask('deploy:produceDataset', ['env:prod', 'lambda_package:produceDataset', 'lambda_deploy:produceDataset']);
  grunt.registerTask('deploy', ['env:prod', 'lambda_package', 'lambda_deploy']);
  grunt.registerTask('test', ['lambda_invoke']);
};
