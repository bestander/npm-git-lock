#!/usr/bin/env node
'use strict';

var argv = require('optimist')
.usage('Usage: $0 --repo [git@bitbucket.org:your/dedicated/node_modules/git/repository.git] --verbose --cross-platform')
.describe('verbose', '[-v] Print progress log messages')
.describe('repo', 'git url to repository with node_modules content')
.describe('cross-platform', 'do not archive platform-specific files in node_modules')
.alias('v', 'verbose')
.demand(['repo']).argv;

var checkoutNodeModules = require('./lib/checkout-node-modules');

checkoutNodeModules(process.cwd(), {repo: argv.repo, verbose: argv.verbose, crossPlatform: argv['cross-platform']})
.then(function () {
    process.exit(0);
})
.catch(function (error) {
    process.exit(1);
});
