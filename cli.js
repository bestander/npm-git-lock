#!/usr/bin/env node
"use strict";

// enabling automatic ES6-ES5 compilation for the whole application
require("babel/register");

var argv = require('optimist')
.usage('Usage: $0 --repo [git@bitbucket.org:your/dedicated/node_modules/git/repository.git] --verbose')
.describe('verbose', '[-v] Print progress log messages')
.describe('repo', 'git url to repository with node_modules content')
.alias('v', 'verbose')
.demand(['repo']).argv;

var checkoutNodeModules = require('./src/checkout-node-modules');

checkoutNodeModules(argv.repo, argv.verbose)
.then(function () {
    process.exit(0);
})
.catch(function (error) {
    process.exit(1);
});
