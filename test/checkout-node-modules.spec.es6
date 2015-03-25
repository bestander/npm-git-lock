let assert = require('assert');
let fs = require('fs');
let del = require('del');
var execSync = require('child_process').execSync;

describe('npm-git-lock', () => {

    let cwd = process.cwd();

    before(() => {
        process.chdir(`${cwd}/test`);
        // create bare repo
        execSync('rm -rf test-repo');
        execSync('mkdir test-repo');
        process.chdir(`${cwd}/test/test-repo`);
        execSync('git init');
        execSync('touch file1');
        execSync('git add .');
        execSync('git commit -a -m "first commit"');
        execSync('git config --bool core.bare true');
    });

    after(function () {
        process.chdir(`${cwd}/test`);
        execSync('rm -rf test-repo');
        execSync('rm -rf package.json');
        execSync('rm -rf node_modules');
    });

    it('should do a fresh npm install and push results to remote repo master branch when node_modules is not present', function(done) {
        // create test repo with one commit
        process.chdir(`${cwd}/test/test-repo`);
        process.chdir(`${cwd}/test`);

        // test
        var packageJson = JSON.stringify({
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

        require('../src/checkout-node-modules')(`${cwd}/test`, `${cwd}/test/test-repo`, true)
        .then(() => {
            // TODO
            // test commit with sha1 in test-repo
            // test commit with sha1 in node-modules
            done();
        }, (error) => {
            done(error);
        })
    })
});