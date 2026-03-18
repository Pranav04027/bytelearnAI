import fs from 'fs';
import path from 'path';

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

function migrateFile(filePath) {
  if (!filePath.endsWith('.js')) return;
  
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;

  // Replace vitest imports with bun:test
  content = content.replace(/from ["']vitest["']/g, 'from "bun:test"');
  
  // Replace vi.mock with mock.module
  content = content.replace(/vi\.mock\(/g, 'mock.module(');
  
  // Replace vi.fn with mock
  content = content.replace(/vi\.fn\(/g, 'mock(');
  
  // Replace vi.spyOn with spyOn
  content = content.replace(/vi\.spyOn\(/g, 'spyOn(');
  
  // Replace other vi. usages (like vi.resetAllMocks, etc.) 
  content = content.replace(/vi\./g, 'mock.');
  
  // Fix imports if `vi` was imported, change to `mock`
  content = content.replace(/(import\s+{[^}]*)(\bvi\b)([^}]*}\s+from\s+["']bun:test["'])/g, '$1mock$3');
  
  // Since `mock` is the global object/fn in bun, sometimes it replaces `vi` perfectly.
  
  if (content !== original) {
    fs.writeFileSync(filePath, content);
    console.log(`Migrated ${filePath}`);
  }
}

walkDir('./src/test', migrateFile);
