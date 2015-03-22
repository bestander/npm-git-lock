#!/usr/bin/env node


"use strict";
var git = require("git-promise");
var npmi = require("npmi");
var del = require("del");
var fs = require("fs");
var promisify = require("es6-promisify");
var log = require("loglevel");
var crypto = require("crypto");

var readFilePromise = promisify(fs.readFile);
var npmiPromise = promisify(npmi);
var delPromise = promisify(del);
var statPromise = promisify(fs.stat);

var argv = require("optimist").usage("Usage: $0 --repo [git@bitbucket.org:your/dedicated/node_modules/git/repository.git] --verbose").describe("verbose", "[-v] Print progress log messages").describe("repo", "git url to repository with node_modules content").alias("v", "verbose").demand(["repo"]).argv;

var packageJsonSha1 = undefined;
var cwd = process.cwd();
if (argv.verbose) {
    log.setLevel("debug");
} else {
    log.setLevel("info");
}
var repo = argv.repo;

readFilePromise("" + cwd + "/package.json", "utf-8").then(function (packageJsonContent) {
    packageJsonSha1 = crypto.createHash("sha1").update(packageJsonContent).digest("base64");
    log.debug("Sha1 of package.json is " + packageJsonSha1);
    return packageJsonSha1;
}).then(function () {
    return statPromise("" + cwd + "/node_modules").then(function () {
        log.debug("Checking if remote " + repo + " exists");
        process.chdir("" + cwd + "/node_modules");
        return git("git remote -v").then(function (remoteCommandOutput) {
            if (remoteCommandOutput.indexOf(repo) !== -1) {
                // repo is in remotes, let's pull the required version
                log.debug("Remote exists, fetching from it");
                return git("git fetch -t " + repo);
            }
            return cloneRepo();
        }, cloneRepo);
    }, cloneRepo);
}).then(function () {
    log.debug("" + repo + " is in node_modules cwd, checking out " + packageJsonSha1 + " tag");
    process.chdir("" + cwd + "/node_modules");
    return git("checkout " + packageJsonSha1).then(function () {
        log.debug("Cleanup checked out commit");
        return git("clean -df");
    })["catch"](installPackagesTagAndPustToRemote);
}).then(function () {
    process.chdir("" + cwd);
    log.info("Node_modules are in sync with " + repo + " " + packageJsonSha1);
    process.exit(0);
})["catch"](function (error) {
    try {
        process.chdir("" + cwd);
        log.debug("Failed to synchronise node_modules with " + repo + ": " + error);
        process.exit(1);
    } catch (e) {
        console.error(e);
    }
});

function cloneRepo() {
    log.debug("Remote " + repo + " is not present in " + cwd + "/node_modules/.git repo");
    log.debug("Removing " + cwd + "/node_modules cwd");
    process.chdir("" + cwd);
    return delPromise(["node_modules/"]).then(function () {
        log.debug("cloning " + repo);
        return git("clone " + repo + " node_modules");
    });
}

function installPackagesTagAndPustToRemote() {
    log.debug("Requested tag does not exist, remove everything from node_modules and do npm install");
    return delPromise(["**", "!.git/"]).then(function () {
        var options = {
            forceInstall: false,
            npmLoad: {
                loglevel: argv.verbose ? "warn" : "silent"
            }
        };
        process.chdir("" + cwd);
        return npmiPromise(options);
    }).then(function () {
        log.debug("All packages installed");
        process.chdir("" + cwd + "/node_modules");
        return git("add .");
    }).then(function () {
        return git("commit -a -m \"updated package.json, freezing changes\"");
    }).then(function () {
        log.debug("Committed, adding tag");
        return git("tag " + packageJsonSha1);
    }).then(function () {
        log.debug("Pushing tag " + packageJsonSha1 + " to " + repo);
        return git("push " + repo + " master --tags");
    });
}

