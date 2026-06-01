const fs = require('fs');
const path = require('path');

const dirs = ['app', 'src'];
const ext = ['.tsx', '.ts'];

const replaceInFile = (filePath) => {
    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;

    const replacements = [
        { from: /bg-\[#1A237E\]/g, to: 'bg-primary' },
        { from: /text-\[#1A237E\]/g, to: 'text-primary' },
        { from: /border-\[#1A237E\]/g, to: 'border-primary' },
        { from: /fill-\[#1A237E\]/g, to: 'fill-primary' },
    ];

    replacements.forEach(({ from, to }) => {
        if (from.test(content)) {
            content = content.replace(from, to);
            changed = true;
        }
    });

    if (changed) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated: ${filePath}`);
    }
};

const walkSync = (dir) => {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            walkSync(filePath);
        } else if (ext.includes(path.extname(filePath))) {
            replaceInFile(filePath);
        }
    }
};

dirs.forEach((dir) => {
    const targetDir = path.join(__dirname, '..', dir);
    if (fs.existsSync(targetDir)) {
        walkSync(targetDir);
    }
});
