"use strict";
let git = require("git-promise");
let npmi = require('npmi');
let path = require('path');
let rimraf = require('rimraf');
let fs = require('fs');
let promisify = require("es6-promisify");

let repo = "git@bitbucket.org:booktrackjsteam/mandrill-packages.git";
let folder = "test";

let packageJson;
let cwd = process.cwd();
let readFilePromise = promisify(fs.readFile);
let npmiPromise = promisify(npmi);
let rimrafPromise = promisify(rimraf);

function checkoutByTagOrCreateNewAndPush() {
    return git(`checkout ${packageJson.version}`, {cwd: `${folder}/node_modules`})
    .then(function () {
        console.log("successfully retrieved packages");
    }, function (error) {
        console.log("version does not exist in remote repo", error);
        return git(`checkout master`, {cwd: `${folder}/node_modules`})
        .then(function () {
            console.log("checked out master");
        }, function () {
            console.log("checkout master failed, ignoring this error")
        })
        .then(function () {
            process.chdir(cwd);
            let options = {
                path: folder,              // installation path [default: '.']
                forceInstall: false    // force install if set to true (even if already installed, it will do a reinstall) [default: false]
            };
            return npmiPromise(options);
        })
        .then(function () {
            console.log("installed packages");
            return git(`add .`, {cwd: `${folder}/node_modules`});
        })
        .then(function () {
            return git(`commit -a -m "updated package.json, freezing changes"`, {cwd: `${folder}/node_modules`});
        })
        .then(function () {
            return git(`tag ${packageJson.version}`, {cwd: `${folder}/node_modules`});
        })
        .then(function () {
            return git("push origin master --tags", {cwd: `${folder}/node_modules`});
        })
    })
}

readFilePromise(`${folder}/package.json`, "utf-8")
.then(function (packageJsonContent) {
    packageJson = JSON.parse(packageJsonContent);
    console.log("read package.json", packageJson.version);
    return packageJson;
})
.then(function () {
    console.log("checking if remote exists");
    return git('git remote -v', {cwd: `${folder}/node_modules`});
})
.then(function (output) {
    if (output.indexOf(repo) !== -1) {
        // repo is in remotes, let's pull the required version
        console.log("pulling master");
        return git(`git pull ${repo} master`, {cwd: `${folder}/node_modules`});
    }
    throw "needed remote not present";
})
.then(null,  function () {
    console.log("no remote, removing node_modules and cloning repo");
    return rimrafPromise(`${folder}/node_modules`)
    .then(function () {
        console.log("removed node_modules, cloning");
        return git(`clone ${repo} ${folder}/node_modules`);
    })
})
.then(function () {
    console.log("repo is there, need to check out by tag clean");
    return git(`reset --hard ${packageJson.version}`, {cwd: `${folder}/node_modules`})
})
.then(function () {
    console.log("requested tag exists, successful finish");
}, function() {
    console.log("requested tag does not exist, remove everything and do npm install")
})
.catch(function (error) {
    console.log("ERROR", error);
});


    // TODO check repo exists with proper remote
    // fail -> remove and proceed with cloning
    // success -> fetch -> proceed with cloned path
//.then(function () {
//    return rimrafPromise(`${folder}/node_modules`);
//})
//.then(function () {
//    console.log("removed node_modules");
//    return git(`clone ${repo} ${folder}/node_modules`);
//})
//.then(function () {
//    console.log(`cloned ${repo}`);
//    return checkoutByTagOrCreateNewAndPush();
//})
//.then(function () {
//    process.chdir(cwd);
//    console.log("Final Success!");
//})
//.catch(function (error) {
//    process.chdir(cwd);
//    console.log("ERROR", error);
//});
//
