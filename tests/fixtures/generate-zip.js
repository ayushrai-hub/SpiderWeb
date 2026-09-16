#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const fixturesDir = path.join(__dirname, 'linkedin');
const outputDir = path.join(__dirname, 'linkedin');

// Create ZIP archives from fixture directories
const variants = ['complete'];

for (const variant of variants) {
  const sourceDir = path.join(fixturesDir, variant);
  const zipFile = path.join(outputDir, `${variant}.zip`);
  
  if (!fs.existsSync(sourceDir)) {
    console.log(`Skipping ${variant} - directory not found`);
    continue;
  }
  
  try {
    // Use ditto on macOS (no zip dependency needed)
    execSync(`ditto -c -k --sequesterRsrc --keepParent "${sourceDir}" "${zipFile}"`, {
      stdio: 'inherit',
    });
    console.log(`Created ${zipFile}`);
  } catch (e) {
    console.error(`Failed to create ${zipFile}: ${e.message}`);
  }
}

console.log('Done. Fixture archives created.');
