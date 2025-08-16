import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const projectRoot = path.resolve(process.cwd());

function checkGitStatus() {
  try {
    const gitStatus = execSync('git status --porcelain').toString();
    if (gitStatus) {
      console.error('Git working directory is not clean. Please commit or stash your changes.');
      process.exit(1);
    }
  } catch (error) {
    console.error(`Error checking Git status: ${error.message}`);
    process.exit(1);
  }
}

function checkGitBranch() {
  try {
    const currentBranch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
    if (currentBranch !== 'main' && currentBranch !== 'master') {
      console.warn(`You are not on the main or master branch (current: ${currentBranch}).`);
    }
  } catch (error) {
    console.error(`Error checking Git branch: ${error.message}`);
    process.exit(1);
  }
}

function checkRequiredFiles() {
  const requiredFiles = [
    'package.json',
    'update.json',
    'update-beta.json',
    path.join('.scaffold', 'build', 'zotero-mcp-plugin.xpi'),
  ];

  requiredFiles.forEach((file) => {
    const filePath = path.join(projectRoot, file);
    if (!fs.existsSync(filePath)) {
      console.error(`Required file not found: ${filePath}`);
      process.exit(1);
    }
  });
}

function displayChecklist() {
  console.log('\nAll checks passed. Please review the following before proceeding with the release:');
  console.log('- [ ] Have you updated the version number in package.json?');
  console.log('- [ ] Have you updated the changelog?');
  console.log('- [ ] Have you run all tests?');
}

function main() {
  checkGitStatus();
  checkGitBranch();
  checkRequiredFiles();
  displayChecklist();
}

main();