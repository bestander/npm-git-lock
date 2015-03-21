# npm-git-lock

A CLI tool to lock all node_modules dependencies to a separate git repository.


## Features

- Tracks changes in package.json file
- When a change is found makes a clean install of all dependencies and commits and pushes to a remote repository
- Works independently from npm and can be used only on CI server keepind dev environment simpler

## Usage

```
sudo npm install -g npm-git-lock
cd <your work directory>
npm-git-lock --repo <git@bitbucket.org:your/git/repository.git> -v
```

## Options

