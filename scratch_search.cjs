const fs = require('fs');
const path = require('path');

const query = process.argv[2];
if (!query) {
  console.error('Please specify a search term');
  process.exit(1);
}

const term = new RegExp(query, 'i');

function searchDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (file === 'node_modules' || file === '.git' || file === '.firebase' || file === 'dist' || file === '.env.local') continue;
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      searchDir(fullPath);
    } else if (stat.isFile()) {
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        if (term.test(content)) {
          const lines = content.split('\n');
          lines.forEach((line, idx) => {
            if (term.test(line)) {
              console.log(`${fullPath}:${idx + 1}: ${line.trim()}`);
            }
          });
        }
      } catch (err) {
        // ignore binary files or read errors
      }
    }
  }
}

searchDir('c:/Users/f3d3r/Downloads/files/danceflow/src');
