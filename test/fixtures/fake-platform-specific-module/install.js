var fs = require('fs');
var os = require('os');
var path = require('path');

var fileName = path.resolve(__dirname, 'some-platform-specific-file');

fs.writeFile(fileName, os.platform, function(err) {
    if(err) {
        return console.log(err);
    }

    console.log('Wrote platform-specific file: ' + fileName);
});
