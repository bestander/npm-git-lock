"use strict";
let git = require("git-promise");
let npmi = require('npmi');
let path = require('path');
var del = require('del');
let fs = require('fs');
let promisify = require("es6-promisify");

let repo = "git@bitbucket.org:booktrackjsteam/mandrill-packages.git";
let folder = "test";

let packageJson;
let cwd = process.cwd();
let readFilePromise = promisify(fs.readFile);
let npmiPromise = promisify(npmi);
let delPromise = promisify(del);

readFilePromise(`${folder}/package.json`, "utf-8")
.then(function (packageJsonContent) {
    packageJson = JSON.parse(packageJsonContent);
    console.log("read package.json", packageJson.version);
    return packageJson;
})
.then(function () {
    console.log("checking if remote exists");
    process.chdir(`${cwd}/${folder}/node_modules`);
    return git('git remote -v');
})
.then(function (output) {
    if (output.indexOf(repo) !== -1) {
        // repo is in remotes, let's pull the required version
        console.log("pulling master");
        return git(`git pull ${repo} master`);
    }
    throw "needed remote not present";
})
.then(null,  function () {
    console.log("no remote, removing node_modules and cloning repo");
    process.chdir(`${cwd}/${folder}`);
    return delPromise([`node_modules/`])
    .then(function () {
        console.log("removed node_modules, cloning");
        return git(`clone ${repo} node_modules`);
    })
})
.then(function () {
    console.log("repo is there, need to check out by tag clean");
    process.chdir(`${cwd}/${folder}/node_modules`);
    return git(`reset --hard ${packageJson.version}`)
})
.then(function () {
    console.log("requested tag exists, successful finish");
}, function() {
    console.log("requested tag does not exist, remove everything and do npm install");
    return delPromise(['**', '!.git/'])
    .then(function () {
        let options = {
            forceInstall: false
        };
        process.chdir(`${cwd}/${folder}`);
        return npmiPromise(options);
    })
    .then(function () {
        process.chdir(`${cwd}/${folder}/node_modules`);
        console.log("installed packages");
        return git(`add .`);
    })
    .then(function () {
        return git(`commit -a -m "updated package.json, freezing changes"`);
    })
    .then(function () {
        console.log("committed, adding tag");
        return git(`tag ${packageJson.version}`);
    })
    .then(function () {
        console.log("pushing to remote");
        return git(`push ${repo} master --tags`);
    })
})
.then(function () {
    process.chdir(`${cwd}`);
    console.log("ALL GOOD!");
})
.catch(function (error) {
    process.chdir(`${cwd}`);
    console.log("ERROR", error);
});

