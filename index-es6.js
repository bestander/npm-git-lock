"use strict";
let git = require("git-promise");
let npmi = require('npmi');
let path = require('path');
var del = require('del');
let fs = require('fs');
let promisify = require("es6-promisify");
let log = require('loglevel');
let readFilePromise = promisify(fs.readFile);
let npmiPromise = promisify(npmi);
let delPromise = promisify(del);
var argv = require('optimist')
.usage('Usage: $0 --repo [git@bitbucket.org:your/git/repository.git] --folder [relative/path/to/folder/with/node_modules] --verbose')
.describe('verbose', 'Print progress log messages')
.demand(['repo','folder']).argv;


let packageJson;
let cwd = process.cwd();
if (argv.verbose) {
    log.setLevel("debug");
}
let repo = argv.repo || "git@bitbucket.org:booktrackjsteam/mandrill-packages.git";
let folder = argv.folder || "test";


readFilePromise(`${folder}/package.json`, "utf-8")
.then(function (packageJsonContent) {
    packageJson = JSON.parse(packageJsonContent);
    log.debug(`Read package.json version ${packageJson.version}`);
    return packageJson;
})
.then(function () {
    log.debug(`Checking if remote ${repo} exists`);
    process.chdir(`${cwd}/${folder}/node_modules`);
    return git('git remote -v');
})
.then(function (output) {
    if (output.indexOf(repo) !== -1) {
        // repo is in remotes, let's pull the required version
        log.debug("Remote existis, pulling master branch");
        return git(`git pull ${repo} master`);
    }
    throw "Remote does not exist in node_modules folder";
})
.then(null,  function () {
    log.debug(`Remote ${repo} is not present in node_modules/.git repo, removing folder and cloning ${repo}`);
    process.chdir(`${cwd}/${folder}`);
    return delPromise([`node_modules/`])
    .then(function () {
        return git(`clone ${repo} node_modules`);
    })
})
.then(function () {
    log.debug(`${repo} is in node_modules folder, checkoing out ${packageJson.version} tag`);
    process.chdir(`${cwd}/${folder}/node_modules`);
    return git(`reset --hard ${packageJson.version}`)
})
.then(function () {
    log.debug("Checked out successfully");
}, function() {
    log.debug("Requested tag does not exist, remove everything from node_modules and do npm install");
    return delPromise(['**', '!.git/'])
    .then(function () {
        let options = {
            forceInstall: false
        };
        process.chdir(`${cwd}/${folder}`);
        return npmiPromise(options);
    })
    .then(function () {
        log.debug("All packages installed");
        process.chdir(`${cwd}/${folder}/node_modules`);
        return git(`add .`);
    })
    .then(function () {
        return git(`commit -a -m "updated package.json, freezing changes"`);
    })
    .then(function () {
        log.debug("Committed, adding tag");
        return git(`tag ${packageJson.version}`);
    })
    .then(function () {
        log.debug(`Pushing tag ${packageJson.version} to ${repo}`);
        return git(`push ${repo} master --tags`);
    })
})
.then(function () {
    process.chdir(`${cwd}`);
    log.debug(`Node_modules are in sync with ${repo} ${packageJson.version}`);
    process.exit(0);
})
.catch(function (error) {
    process.chdir(`${cwd}`);
    log.debug(`Failed to synchronise node_modules with ${repo} ${packageJson.version}: ${error}`);
    process.exit(1);
});

