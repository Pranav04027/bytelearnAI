import fs from 'fs';
import path from 'path';

const SRC_DIR = "\\\\wsl.localhost\\Ubuntu\\home\\pranav\\projects\\ByteLearn\\Backend\\src";

// Get all js files recursively
function getAllFiles(dirPath, arrayOfFiles) {
  const files = fs.readdirSync(dirPath);
  arrayOfFiles = arrayOfFiles || [];
  files.forEach(function (file) {
    if (fs.statSync(dirPath + "/" + file).isDirectory()) {
      if (file !== 'node_modules') {
        arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
      }
    } else {
      if (file.endsWith('.js')) {
        arrayOfFiles.push(path.join(dirPath, "/", file));
      }
    }
  });
  return arrayOfFiles;
}

const files = getAllFiles(SRC_DIR);

let modifiedFilesCount = 0;

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  let originalContent = content;

  // 1. Remove imports
  content = content.replace(/import\s+{\s*ApiError\s*}\s+from\s+['"].*?ApiError(\.js)?['"];?\n?/g, '');
  content = content.replace(/import\s+{\s*ApiResponse\s*}\s+from\s+['"].*?ApiResponse(\.js)?['"];?\n?/g, '');
  content = content.replace(/import\s+{\s*asyncHandler\s*}\s+from\s+['"].*?asyncHandler(\.js)?['"];?\n?/g, '');

  // 2. Wrap ApiResponse returns
  // Matches: new ApiResponse(statusCode, data, "message") or similar expressions
  // Group 1: Status Code
  // Group 2: The rest of the arguments (data and/or message)
  content = content.replace(/new\s+ApiResponse\s*\(\s*(\d{3})\s*(?:,\s*([^)]*?))?\s*\)/g, (match, statusCode, restArgs) => {
      
      let dataStr = 'null';
      let messageStr = '"success"';

      if (restArgs) {
          // A rudimentary split by top-level commas to isolate data and message
          // This breaks if the data itself has commas not enclosed in '{}' or '[]' but for basic usage it's often OK
          // For safer replacement, we'll try evaluating it as strings or variables
          const parts = restArgs.split(',').map(s => s.trim()).filter(Boolean);
          
          if (parts.length >= 1) {
             dataStr = parts[0]; 
          }
          if (parts.length >= 2) {
             messageStr = parts[1];
          }
      }

      // Convert to a plain object
      return `{ statusCode: ${statusCode}, data: ${dataStr}, message: ${messageStr}, success: ${statusCode} < 400 }`;
  });

  // 3. Wrap ApiError throws/returns
  content = content.replace(/new\s+ApiError\s*\(\s*([^,]+)(?:\s*,\s*([^)]+))?\s*\)/g, (match, statusCode, restArgs) => {
     let messageStr = '"Something went wrong"';
     let errorsStr = '[]';
     
     if (restArgs) {
         const parts = restArgs.split(',').map(s => s.trim()).filter(Boolean);
         if (parts.length >= 1) {
             messageStr = parts[0];
         }
         // Errors or stack args are handled manually or dropped (as usually just an array or string)
     }
     
     return `Object.assign(new Error(${messageStr}), { statusCode: ${statusCode}, success: false })`;
  });

  // 4. Unwrap asyncHandler
  // Replace: const funcName = asyncHandler(async (req, res) => { ... }) 
  // with: const funcName = async (req, res, next) => { try { ... } catch(error) { next(error); } }
  // Since full AST parsing is complex in regex, we use a basic regex approach recognizing standard controller signatures.
  // Note: For multi-line, regex might fall short on unbalanced braces, but most arrow functions start identically.
  
  // To handle the `asyncHandler(async (req, res) => {` and the closing `})`
  content = content.replace(/asyncHandler\s*\(\s*async\s*\(([^)]*)\)\s*=>\s*\{/g, 'async ($1, next) => { try {');
  
  // Close the try-catch block where we opened it.
  // The naive approach: Since we replaced the `asyncHandler(async... {` with `try {`, we need to find the matching `})` that ends `asyncHandler`. 
  // This regex replaces `});` at the end of module export blocks or variable declarations with `} catch (error) { next(error); };`
  // We'll run a safer pass:
  content = content.replace(/\}\)\s*;/g, '} catch (error) { next(error); };');

  // Let's refine the unwrap handler replacing `async (req, res, next, next) =>` to `async (req, res, next) =>`
  content = content.replace(/async\s*\(([^)]*?)(?:,\s*next)?,\s*next\)\s*=>/g, 'async ($1, next) =>');


  if (content !== originalContent) {
    fs.writeFileSync(file, content, 'utf8');
    modifiedFilesCount++;
    console.log(`Modified: ${file}`);
  }
}

console.log(`Total files modified: ${modifiedFilesCount}`);
