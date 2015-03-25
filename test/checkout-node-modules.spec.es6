let fs = require('fs');
var execSync = require('child_process').execSync;
let git = require('git-promise');
let crypto = require('crypto');
let expect = require('chai').expect;
let proxyquire = require('proxyquire');
let foo = proxyquire('./foo', { 'path': pathStub });

describe('npm-git-lock', () => {

    let cwd = process.cwd();
    let tempRemoteRepoName = 'remote-repo';

    before(() => {
        process.chdir(`${cwd}/test`);
        // create bare repo
        execSync(`rm -rf node_modules`);
        execSync(`rm -rf ${tempRemoteRepoName}`);
        execSync(`mkdir ${tempRemoteRepoName}`);
        process.chdir(`${cwd}/test/${tempRemoteRepoName}`);
        execSync('git init');
        execSync('touch file1');
        execSync('git add .');
        execSync('git commit -a -m "first commit"');
        execSync('git config --bool core.bare true');
    });

    after(function () {
        process.chdir(`${cwd}/test`);
        execSync(`rm -rf ${tempRemoteRepoName}`);
        execSync('rm -rf package.json');
        execSync('rm -rf node_modules');
    });

    it('should do a fresh npm install and push results to remote repo master branch when node_modules is not present', function(done) {

        process.chdir(`${cwd}/test`);
        let packageJson = JSON.stringify({
            "name": "my-project",
            "version": "1.0.0",
            "dependencies": {
                "fake-module": "file:fixtures/fake-module"
            },
            "devDependencies": {
            },
            "author": "Konstantin Raev",
            "license": "MIT"
        });
        fs.writeFileSync('package.json', packageJson);

        require('../src/checkout-node-modules')(`${cwd}/test`, `${cwd}/test/${tempRemoteRepoName}`, true)
        .then(() => {
            process.chdir(`${cwd}/test/${tempRemoteRepoName}`);
            return git('show-ref --tags', (output) => {
                return output.trim().split("\n");
            });
        })
        .then((refTags) => {
            // there is a tag in tempRemoteRepoName with tagged with package.json hash
            let packageJsonSha1 = crypto.createHash('sha1').update(packageJson).digest('base64');
            expect(refTags.filter((refTag) => refTag.indexOf(`refs/tags/${packageJsonSha1}`) !== -1).length).to.equal(1);
        })
        .then(() => {
            process.chdir(`${cwd}/test/node_modules`);
            return git('git describe --tags');
        })
        .then((tag) => {
            // current tag in node_modules repo is package.json hash
            let packageJsonSha1 = crypto.createHash('sha1').update(packageJson).digest('base64');
            expect(packageJsonSha1).to.equal(tag.trim());
        })
        .then(() => {
            // module has been installed in node_modules
            expect(fs.readdirSync(`${cwd}/test/node_modules`)).to.contain('fake-module');
            let packageInstalled = JSON.parse(fs.readFileSync(`${cwd}/test/node_modules/fake-module/package.json`, 'utf-8'));
            let packageInRepo = JSON.parse(fs.readFileSync(`${cwd}/test/fixtures/fake-module/package.json`, 'utf-8'));
            expect(packageInstalled.name).to.equal(packageInRepo.name);
        })
        .then(() => {
        })
        .then(done, (error) => done(error));
    })
});