const fs = require('fs');
const path = require('path');

function walk(dir, callback) {
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walk(dirPath, callback) : callback(dirPath);
  });
}

function processFile(filePath) {
    if (!filePath.endsWith('.tsx') && !filePath.endsWith('.js') && !filePath.endsWith('.jsx')) return;
    let original = fs.readFileSync(filePath, 'utf8');
    let content = original;
    
    // 1. Revert onStartShouldSetResponder global touch interception
    content = content.replace(/(\s*)onStartShouldSetResponder=\{\(\) => true\}/g, '');

    // 2. Revert Admin/Encoder layout overrides
    // Protect the original Collector UI fixes built in Step 51
    const isCollectorFixed = filePath.replace(/\\/g, '/').includes('app/(collector)/index.tsx') || 
                             filePath.replace(/\\/g, '/').includes('app/(collector)/collection-sheet.tsx');
    
    if (!isCollectorFixed) {
        // Clean out flexGrow: 1 injections
        content = content.replace(/,\s*flexGrow:\s*1/g, '');
        content = content.replace(/flexGrow:\s*1\s*,?/g, '');
        content = content.replace(/contentContainerStyle=\{\{\s*\}\}/g, '');
        content = content.replace(/ contentContainerStyle=\{\{\s*\}\}/g, '');
        
        // Restore style={"flex: 1"} strictly back to original className mapping
        content = content.replace(/(<ScrollView[^>]*)style=\{\{\s*flex:\s*1\s*\}\}([^>]*>)/g, (m, p1, p2) => {
            let tag = p1 + p2;
            if (tag.includes('className="')) {
                tag = tag.replace('className="', 'className="flex-1 ');
            } else {
                tag = tag.replace('<ScrollView', '<ScrollView className="flex-1"');
            }
            return tag;
        });
    }

    if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log("Reverted:", filePath);
    }
}

let targetDirs = [
  'd:/LoanBrick2/ReactNative-expo-LoanWaterMelon/app',
  'd:/LoanBrick2/ReactNative-expo-LoanWaterMelon/src'
];

targetDirs.forEach(dir => walk(dir, processFile));
