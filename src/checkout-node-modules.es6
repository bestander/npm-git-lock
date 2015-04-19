'use strict';
let git = require('git-promise');
let npmi = require('npmi');
var del = require('del');
let fs = require('fs');
let promisify = require('es6-promisify');
let log = require('loglevel');
let crypto = require('crypto');

let readFilePromise = promisify(fs.readFile);
let npmiPromise = promisify(npmi);
let delPromise = promisify(del);
let statPromise = promisify(fs.stat);


module.exports = (cwd, repo, verbose) => {
    let packageJsonSha1;
    let packageJsonVersion;
    log.setLevel(verbose ? 'debug': 'info');
    return readFilePromise(`${cwd}/package.json`, 'utf-8')
    .then((packageJsonContent) => {
        packageJsonSha1 = crypto.createHash('sha1').update(packageJsonContent).digest('base64');
        packageJsonVersion = packageJsonContent.version;
        log.debug(`Sha1 of package.json is ${packageJsonSha1}`);
        return packageJsonSha1;
    })
    .then(() => {
        return statPromise(`${cwd}/node_modules`)
        .then(() => {
            log.debug(`Checking if remote ${repo} exists`);
            process.chdir(`${cwd}/node_modules`);
            return git('git remote -v')
            .then((remoteCommandOutput) => {
                if (remoteCommandOutput.indexOf(repo) !== -1) {
                    // repo is in remotes, let's pull the required version
                    log.debug('Remote exists, fetching from it');
                    return git(`git fetch -t ${repo}`);
                }
                return cloneRepo();
            });
        })
        .catch(cloneRepo)
    })
    .then(() => {
        log.debug(`${repo} is in node_modules cwd, checking out ${packageJsonSha1} tag`);
        process.chdir(`${cwd}/node_modules`);
        return git(`checkout tags/${packageJsonSha1}`)
        .then(() => {
            log.debug(`Cleanup checked out commit`);
            return git('clean -df');
        })
        .catch(installPackagesTagAndPustToRemote);
    })
    .then(() => {
        process.chdir(`${cwd}`);
        log.info(`Node_modules are in sync with ${repo} ${packageJsonSha1}`);
    })
    .catch((error) => {
        process.chdir(`${cwd}`);
        log.info(`Failed to synchronise node_modules with ${repo}: ${error}`);
        throw error;
    });

    function cloneRepo() {
        log.debug(`Remote ${repo} is not present in ${cwd}/node_modules/.git repo`);
        log.debug(`Removing ${cwd}/node_modules cwd`);
        process.chdir(`${cwd}`);
        return delPromise([`node_modules/`])
        .then(() => {
            log.debug(`cloning ${repo}`);
            return git(`clone ${repo} node_modules`);
        })
    }

    function installPackagesTagAndPustToRemote() {
        log.debug('Requested tag does not exist, remove everything from node_modules and do npm install');
        return git(`checkout master`)
        .then(() => {
            return delPromise(['**', '!.git/'])
        })
        .then(() => {
            let options = {
                forceInstall: false,
                npmLoad: {
                    loglevel: verbose ? 'warn' : 'silent'
                }
            };
            process.chdir(`${cwd}`);
            return npmiPromise(options);
        })
        .then(() => {
            log.debug('All packages installed');
            process.chdir(`${cwd}/node_modules`);
            return git(`add .`);
        })
        .then(() => {
            return git(`commit --author="npm-git-lock <bob@example.com>" -a -m 'sealing package.json dependencies of version ${packageJsonVersion}, using npm ${npmi.NPM_VERSION}'`);
        })
        .then(() => {
            log.debug('Committed, adding tag');
            return git(`tag ${packageJsonSha1}`);
        })
        .then(() => {
            log.debug(`Pushing tag ${packageJsonSha1} to ${repo}`);
            return git(`push ${repo} master --tags`);
        })
    }
};



