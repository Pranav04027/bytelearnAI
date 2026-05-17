const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

const replacements = {
  '#fcf8f8': '#FFF6F6',
  '#1b0e0e': '#2C687B',
  '#994d51': '#8CC7C4',
  '#f3e7e8': '#8CC7C4',
  
  // Also catch cases without # if they exist (though usually they have # in tailwind arbitrary)
  'bg-indigo-600': 'bg-[#DB1A1A]',
  'text-indigo-600': 'text-[#DB1A1A]',
  'ring-indigo-600': 'ring-[#DB1A1A]',
  'border-indigo-600': 'border-[#DB1A1A]',
  
  'bg-indigo-700': 'bg-[#DB1A1A] opacity-90', // simulate hover darken
  'text-indigo-700': 'text-[#DB1A1A] opacity-90',
  
  'bg-indigo-100': 'bg-[#FFF6F6]',
  'text-indigo-100': 'text-[#FFF6F6]',
  'ring-indigo-200': 'ring-[#8CC7C4]',
  'bg-indigo-200': 'bg-[#8CC7C4]',
  'border-indigo-100': 'border-[#8CC7C4]',
  'bg-indigo-50/50': 'bg-[#FFF6F6]',
  
  'bg-blue-600': 'bg-[#DB1A1A]',
  'bg-blue-700': 'bg-[#DB1A1A] opacity-90',
  'text-blue-600': 'text-[#DB1A1A]',
  
  'bg-emerald-100': 'bg-[#8CC7C4]',
  'text-emerald-700': 'text-[#2C687B]',
  'ring-emerald-200': 'ring-[#8CC7C4]',
  
  'bg-purple-50/50': 'bg-[#FFF6F6]',
  'border-purple-100': 'border-[#8CC7C4]',
  'border-purple-600': 'border-[#2C687B]',
  'text-purple-800': 'text-[#2C687B]',
  
  'bg-red-50/50': 'bg-[#FFF6F6]',
  'border-red-100': 'border-[#DB1A1A]',
  'text-red-600': 'text-[#DB1A1A]',
  'bg-red-600': 'bg-[#DB1A1A]',
  'bg-red-700': 'bg-[#DB1A1A] opacity-90',
  
  'bg-gray-50': 'bg-[#FFF6F6]',
  'bg-gray-100': 'bg-[#FFF6F6]',
  'bg-gray-200': 'bg-[#8CC7C4]',
  'bg-gray-300': 'bg-[#8CC7C4] opacity-80',
  'text-gray-500': 'text-[#8CC7C4]',
  'text-gray-600': 'text-[#2C687B] opacity-80',
  'text-gray-700': 'text-[#2C687B]',
  'text-gray-800': 'text-[#2C687B]',
  'text-gray-900': 'text-[#2C687B]',
  'bg-gray-800': 'bg-[#2C687B]',
  'bg-gray-900': 'bg-[#2C687B] opacity-90',
};

function processDirectory(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      processDirectory(fullPath);
    } else if (fullPath.endsWith('.jsx') || fullPath.endsWith('.css') || fullPath.endsWith('.js') || fullPath.endsWith('.html')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let changed = false;
      for (const [oldVal, newVal] of Object.entries(replacements)) {
        if (content.includes(oldVal)) {
          content = content.split(oldVal).join(newVal);
          changed = true;
        }
      }
      if (changed) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log(`Updated ${fullPath}`);
      }
    }
  }
}

processDirectory(srcDir);
console.log('Done replacing colors.');
