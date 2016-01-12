'use strict';

let gitPromise = require(`git-promise`);
let del = require(`del`);
let fs = require(`fs`);
let promisify = require(`es6-promisify`);
let log = require(`loglevel`);
let crypto = require(`crypto`);
let shell = require(`shelljs`);
let uniq = require(`lodash/array/uniq`);

require('es6-promise').polyfill();

let readFilePromise = promisify(fs.readFile);
let delPromise = promisify(del);
let statPromise = promisify(fs.stat);

module.exports = (cwd, {repo, verbose, crossPlatform}) => {

    let packageJsonSha1;
    let packageJsonVersion;
    let leaveAsIs = false;
    log.setLevel(verbose ? `debug`: `info`);
    return readFilePromise(`${cwd}/package.json`, `utf-8`)
    .then((packageJsonContent) => {
        // replace / in hash with _ because git does not allow leading / in tags
        let packageJson = JSON.parse(packageJsonContent);
        packageJsonSha1 = crypto.createHash(`sha1`).update(packageJsonContent).digest(`base64`).replace(/\//g, "_");
        packageJsonVersion = packageJson.version;
        log.debug(`Sha1 of package.json (version ${packageJsonVersion}) is ${packageJsonSha1}`);
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
                    // repo is in remotes
                    return git(`tag -l --points-at HEAD`)
                    .then((tags) => {
                        if (tags.split('\n').indexOf(packageJsonSha1) >= 0) {
                            // if the current HEAD is at the right commit, don't change anything
                            log.debug(`${repo} is already at tag ${packageJsonSha1}, leaving as is`);
                            leaveAsIs = true;
                        } else {
                            log.debug(`Remote exists, fetching from it`);
                            return git(`git fetch -t ${repo}`);
                        }
                    });
                }
                return cloneRepo();
            });
        })
        .catch(cloneRepo)
    })
    .then((tags) => {
        if (leaveAsIs) {
            return;
        }
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

    function git(cmd) {
        return gitPromise(cmd).catch((error) => {
            // report any Git errors immediately
            log.info(`Git command '${cmd}' failed:\n${error.stdout}`);
            throw error;
        });
    }

    function gitGetUntracked() {
        return git(`status --porcelain --untracked-files=all`)
        .then(result => {
            return result.split('\n').filter(line => line && line.startsWith('??')).map(line => line.substr(3));
        })
    }

    function npmRunCommand(npmCommand, args, {silent}={}) {
        let logLevel = [`--log-level=${verbose ? 'warn' : 'silent'}`];
        let command = ['npm', npmCommand].concat(logLevel).concat(args || []);
        return new Promise((resolve, reject) => {
            let result = shell.exec(command.join(' '), {silent});
            if (result.code !== 0) {
                log.info(`npm command '${npmCommand}' failed:\n${result.output}`);
                reject(new Error(`Running npm returned error code ${result.code}`));
            } else {
                resolve(result.output.split('\n'));
            }
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
            return npmRunCommand(`--version`, [], {silent: true});
        })
        .then((npmVersion) => {
            log.debug(`Ran npm ${npmVersion[0]}, committing`);
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



