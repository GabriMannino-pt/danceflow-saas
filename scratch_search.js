const fs = require('fs');
const path = require('path');

const walk = (dir) => {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      if (!file.includes('node_modules') && !file.includes('.git') && !file.includes('dist')) {
        results = results.concat(walk(file));
      }
    } else {
      if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js') || file.endsWith('.json')) {
        results.push(file);
      }
    }
  });
  return results;
};

const query = process.argv[2] || '';
console.log(`Searching for: ${query}`);

const files = walk('./src');
files.forEach((file) => {
  const content = fs.readFileSync(file, 'utf8');
  if (content.toLowerCase().includes(query.toLowerCase())) {
    console.log(`Found in: ${file}`);
  }
});
