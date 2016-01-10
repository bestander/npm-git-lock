'use strict';
let git = require(`git-promise`);
let exec = require(`exec-then`);
let del = require(`del`);
let fs = require(`fs`);
let promisify = require(`es6-promisify`);
let log = require(`loglevel`);
let crypto = require(`crypto`);
let uniq = require(`lodash/array/uniq`);

let readFilePromise = promisify(fs.readFile);
let delPromise = promisify(del);
let statPromise = promisify(fs.stat);

module.exports = (cwd, {repo, verbose, crossPlatform}) => {

    let packageJsonSha1;
    let packageJsonVersion;
    log.setLevel(verbose ? `debug`: `info`);
    return readFilePromise(`${cwd}/package.json`, `utf-8`)
    .then((packageJsonContent) => {
        // replace / in hash with _ because git does not allow leading / in tags
        packageJsonSha1 = crypto.createHash(`sha1`).update(packageJsonContent).digest(`base64`).replace(/\//g, "_");
        packageJsonVersion = packageJsonContent.version;
        log.debug(`Sha1 of package.json is ${packageJsonSha1}`);
        return packageJsonSha1;
    })
    .then(() => {
        return statPromise(`${cwd}/node_modules`)
        .then(() => {
            log.debug(`Checking if remote ${repo} exists`);
            process.chdir(`${cwd}/node_modules`);
            return git(`git remote -v`)
            .then((remoteCommandOutput) => {
                if (remoteCommandOutput.indexOf(repo) !== -1) {
                    // repo is in remotes, let`s pull the required version
                    log.debug(`Remote exists, fetching from it`);
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
            return git(`clean -df`);
        })
        .then(() => {
            if (crossPlatform) {
                return rebuildAndIgnorePlatformSpecific();
            }
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

    function gitGetUntracked() {
        return git(`status --porcelain --untracked-files=all`)
        .then(result => {
            return result.split('\n').filter(line => line && line.startsWith('??')).map(line => line.substr(3));
        })
    }

    function npmRunCommand(cmd, args) {
        let loglevel = [`--log-level=${verbose ? 'warn' : 'silent'}`];
        return exec(['npm', cmd].concat(loglevel).concat(args), {verbose}, (std, deferred) => {
            deferred.resolve(std.stdout.split('\n'));
        });
    }

    function rebuildAndIgnorePlatformSpecific() {
        log.debug(`Rebuilding package in ${cwd}`);
        process.chdir(`${cwd}`);
        return npmRunCommand('rebuild')
        .then(() => {
            process.chdir(`${cwd}/node_modules`);
            return gitGetUntracked();
        })
        .then((files) => {
            let ignored = [];
            try {
                ignored = fs.readFileSync('.gitignore', {encoding: 'utf8'}).split('\n');
            } catch (e) {
                // ignore errors while reading .gitignore
            }
            ignored = ignored.concat(files);
            ignored.sort();
            ignored = uniq(ignored);
            fs.writeFileSync('.gitignore', ignored.join('\n'), {encoding: 'utf8'});
            return git(`add .gitignore`);
        })
    }

    function installPackagesTagAndPustToRemote() {
        log.debug(`Requested tag does not exist, remove everything from node_modules and do npm install`);
        process.chdir(`${cwd}/node_modules`);
        return git(`checkout master`)
        .then(() => {
            return delPromise([`**`, `!.git/`])
        })
        .then(() => {
            process.chdir(`${cwd}`);
            return npmRunCommand(`install`, crossPlatform ? ['--ignore-scripts'] : []);
        })
        .then(() => {
            log.debug(`All packages installed`);
            process.chdir(`${cwd}/node_modules`);
            return git(`add .`);
        })
        .then(() => {
            if (crossPlatform) {
                return rebuildAndIgnorePlatformSpecific();
            }
        })
        .then(() => {
            return npmRunCommand(`--version`);
        })
        .then((npmVersion) => {
            process.chdir(`${cwd}/node_modules`);
            return git(`commit -a -m "sealing package.json dependencies of version ${packageJsonVersion}, using npm ${npmVersion[0]}"`);
        })
        .then(() => {
            log.debug(`Committed, adding tag`);
            return git(`tag ${packageJsonSha1}`);
        })
        .then(() => {
            log.debug(`Pushing tag ${packageJsonSha1} to ${repo}`);
            return git(`push ${repo} master --tags`);
        })
    }
};



