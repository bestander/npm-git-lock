let fs = require(`fs`);
var execSync = require(`child_process`).execSync;
let git = require(`git-promise`);
let crypto = require(`crypto`);
let expect = require(`chai`).expect;
let checkoutNodeMoudles = require(`../src/checkout-node-modules`);

/**
 * Those are integration tests that depend on Git and npm being available in CLI.
 * Every test uses a local git repo and local npm repo to let the tests run independent of internet connection
 *
 * I was tempted to use same async-await or promise API for tests code
 * but it was a bit more hassle than just doing a sequence of execSync commands
 * Maybe I should have done the same for the source code but then it would not be as fun.
 *
 */
describe(`npm-git-lock`, function() {
    this.timeout(20000);

    let cwd = process.cwd();
    let nodeModulesRemoteRepo = `remote-repo`;
    let testProjectFolder = `test-project-folder`;

    beforeEach(() => {

        process.chdir(`${cwd}/test`);

        // set up clean folder for testing project
        execSync(`rm -rf ${cwd}/test/${testProjectFolder}`);
        execSync(`mkdir ${testProjectFolder}`);

        // set up clean folder for remote repo for npm modules
        execSync(`rm -rf ${nodeModulesRemoteRepo}`);
        execSync(`mkdir ${nodeModulesRemoteRepo}`);

        // set up git in remote repo for npm moduels
        process.chdir(`${cwd}/test/${nodeModulesRemoteRepo}`);
        execSync(`git init`);
        execSync(`touch file1`);
        execSync(`git add .`);
        execSync(`git commit -a -m "first commit" --author="npm-git-lock <bob@example.com>"`);
        execSync(`git config --bool core.bare true`);
    });

    afterEach(function () {
        process.chdir(`${cwd}/test`);
        execSync(`rm -rf ${nodeModulesRemoteRepo}`);
        execSync(`rm -rf ${testProjectFolder}`);
    });

    it(`should do a fresh npm install and push results to remote repo master branch when get repo in node_modules is not present`, function(done) {

        process.chdir(`${cwd}/test/${testProjectFolder}`);
        let packageJson = JSON.stringify({
            "name": "my-project",
            "version": "1.0.0",
            "dependencies": {
                "fake-module": "file:../fixtures/fake-module"
            },
            "devDependencies": {
            },
            "author": "Konstantin Raev",
            "license": "MIT"
        });
        fs.writeFileSync(`package.json`, packageJson);

        checkoutNodeMoudles(`${cwd}/test/${testProjectFolder}`, `${cwd}/test/${nodeModulesRemoteRepo}`, true)
        .then(() => {
            process.chdir(`${cwd}/test/${nodeModulesRemoteRepo}`);
            return git(`show-ref --tags`, (output) => {
                return output.trim().split("\n");
            });
        })
        .then((refTags) => {
            // there is a tag in nodeModulesRemoteRepo with tagged with package.json hash
            let packageJsonSha1 = crypto.createHash(`sha1`).update(packageJson).digest(`base64`);
            expect(refTags.filter((refTag) => refTag.indexOf(`refs/tags/${packageJsonSha1}`) !== -1).length).to.equal(1);
        })
        .then(() => {
            // there is the same tag in project`s node_modules
            process.chdir(`${cwd}/test/${testProjectFolder}/node_modules`);
            return git(`git describe --tags`);
        })
        .then((tag) => {
            // current tag in node_modules repo is package.json hash
            let packageJsonSha1 = crypto.createHash(`sha1`).update(packageJson).digest(`base64`);
            expect(packageJsonSha1).to.equal(tag.trim());
        })
        .then(() => {
            // module has been installed in node_modules
            expect(fs.readdirSync(`${cwd}/test/${testProjectFolder}/node_modules`)).to.contain(`fake-module`);
            let packageInstalled = JSON.parse(fs.readFileSync(`${cwd}/test/${testProjectFolder}/node_modules/fake-module/package.json`, `utf-8`));
            let packageInRepo = JSON.parse(fs.readFileSync(`${cwd}/test/fixtures/fake-module/package.json`, `utf-8`));
            expect(packageInstalled.name).to.equal(packageInRepo.name);
        })
        .then(() => done(), done);
    });

    it(`should checkout node_modules from remote repo resetting all local changes`, function(done) {

        process.chdir(`${cwd}/test/${testProjectFolder}`);
        let packageJson = JSON.stringify({
            "name": "my-project",
            "version": "1.0.0",
            "dependencies": {
                "fake-module": "file:../fixtures/fake-module"
            },
            "devDependencies": {
            },
            "author": "Konstantin Raev",
            "license": "MIT"
        });

        fs.writeFileSync(`package.json`, packageJson);

        // set up git in node_modules folder
        execSync(`git clone ${cwd}/test/${nodeModulesRemoteRepo} node_modules`);
        process.chdir(`${cwd}/test/${testProjectFolder}/node_modules`);
        execSync(`touch file2`);
        execSync(`git add .`);
        execSync(`git commit -a -m "node_modules is cached"`);
        let packageJsonSha1 = crypto.createHash(`sha1`).update(packageJson).digest(`base64`);
        execSync(`git tag ${packageJsonSha1}`);
        execSync(`git push origin master --tags`);

        // add some change new to local node_modules repo
        execSync(`touch file3`);
        execSync(`git add .`);
        execSync(`git commit -a -m "another commit that should be ignored" --author="npm-git-lock <bob@example.com>"`);
        execSync(`git tag SOMERANDOMTAG`);

        checkoutNodeMoudles(`${cwd}/test/${testProjectFolder}`, `${cwd}/test/${nodeModulesRemoteRepo}`, true)
        .then(() => {
            // there is the same tag in project`s node_modules
            process.chdir(`${cwd}/test/${testProjectFolder}/node_modules`);
            return git(`git describe --tags`);
        })
        .then((tag) => {
            // current tag in node_modules repo is package.json hash
            let packageJsonSha1 = crypto.createHash(`sha1`).update(packageJson).digest(`base64`);
            expect(packageJsonSha1).to.equal(tag.trim());
        })
        .then(() => {
            // we don`t expect npm install was called
            expect(fs.readdirSync(`${cwd}/test/${testProjectFolder}/node_modules`)).not.to.contain(`fake-module`);
            // commit with file 3 is to be reverted
            expect(fs.readdirSync(`${cwd}/test/${testProjectFolder}/node_modules`)).not.to.contain(`file3`);
            // commit with file 2 should be present
            expect(fs.readdirSync(`${cwd}/test/${testProjectFolder}/node_modules`)).to.contain(`file2`);
        })
        .then(() => done(), done);
    });

    it(`should not do an npm install if remote repo master branch already has a tag with package.json hash`, function(done) {

        process.chdir(`${cwd}/test/${testProjectFolder}`);
        let packageJson = JSON.stringify({
            "name": "my-project",
            "version": "2.0.0",
            "dependencies": {
                "fake-module": "file:../fixtures/fake-module"
            },
            "devDependencies": {
            },
            "author": "Konstantin Raev",
            "license": "MIT"
        });
        fs.writeFileSync(`package.json`, packageJson);
        // just add a tag to master branch then no npm innstallation is necessary
        process.chdir(`${cwd}/test/${nodeModulesRemoteRepo}`);
        let packageJsonSha1 = crypto.createHash(`sha1`).update(packageJson).digest(`base64`);
        execSync(`git tag ${packageJsonSha1}`);

        checkoutNodeMoudles(`${cwd}/test/${testProjectFolder}`, `${cwd}/test/${nodeModulesRemoteRepo}`, true)
        .then(() => {
            // there is the same tag in project`s node_modules
            process.chdir(`${cwd}/test/${testProjectFolder}/node_modules`);
            return git(`git describe --tags`);
        })
        .then((tag) => {
            // current tag in node_modules repo is package.json hash
            let packageJsonSha1 = crypto.createHash(`sha1`).update(packageJson).digest(`base64`);
            expect(packageJsonSha1).to.equal(tag.trim());
        })
        .then(() => {
            // we don`t expect npm install was called
            expect(fs.readdirSync(`${cwd}/test/${testProjectFolder}/node_modules`)).not.to.contain(`fake-module`);
        })
        .then(() => done(), done);
    });
});