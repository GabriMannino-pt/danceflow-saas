const fs = require('fs');
const path = require('path');

const srcDir = 'c:\\Users\\f3d3r\\Downloads\\files\\danceflow';
const destDir = 'd:\\danceflow';

const exclude = [
  'node_modules',
  '.git',
  '.firebase',
  'dist',
  '.env.local',
  'scratch_copy.js',
  'scratch_search.js'
];

function copyFolderRecursiveSync(source, target) {
  let files = [];

  // Check if folder needs to be created or written
  const targetFolder = target;
  if (!fs.existsSync(targetFolder)) {
    fs.mkdirSync(targetFolder, { recursive: true });
  }

  // Copy
  if (fs.lstatSync(source).isDirectory()) {
    files = fs.readdirSync(source);
    files.forEach(function (file) {
      if (exclude.includes(file)) {
        return;
      }
      const curSource = path.join(source, file);
      const curTarget = path.join(targetFolder, file);
      if (fs.lstatSync(curSource).isDirectory()) {
        copyFolderRecursiveSync(curSource, curTarget);
      } else {
        fs.copyFileSync(curSource, curTarget);
      }
    });
  }
}

console.log('Syncing files from C: to D:...');
try {
  copyFolderRecursiveSync(srcDir, destDir);
  console.log('Sync completed successfully!');
} catch (err) {
  console.error('Error during copy:', err);
}
