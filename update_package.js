const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

pkg.bin = {
  'gcr': './gcr-gemini',
  'gemini-local': './bundle/gemini.js',
  'gemini-proxy': './bundle/gemini-proxy',
  'start-gemini-proxy': './bundle/start-gemini-proxy'
};

// Add files field to ensure bundle is included
pkg.files = pkg.files || [];
const filesToInclude = [
  'bundle/',
  'proxy-service/',
  'gcr-gemini',
  'setup-post-install.js',
  'cleanup-pre-uninstall.js',
  'install-gcr-simple.sh',
  'install-gcr.sh',
  'uninstall-gcr.sh',
  'README.md',
  'LOCAL-VERSION-README.md'
];

filesToInclude.forEach(file => {
  if (!pkg.files.includes(file)) {
    pkg.files.push(file);
  }
});

// Add OS-specific scripts
pkg.scripts = pkg.scripts || {};
pkg.scripts.postinstall = pkg.scripts.postinstall || 'node setup-post-install.js';
pkg.scripts.prepare = 'echo "Package prepared for installation"';

// Update engines to support Node.js 16+
pkg.engines = pkg.engines || {};
pkg.engines.node = '>=16.0.0';

fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
console.log('✅ Updated package.json');
