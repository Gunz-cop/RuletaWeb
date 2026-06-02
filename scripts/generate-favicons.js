import fs from 'fs';
import path from 'path';

// Base64 of a 32x32 target (🎯) style favicon PNG
// It's a clean, transparent PNG representing a target bullseye
const faviconBase64 = 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABGdBTUEAALGPC/xhBQAAACBjSFJNAAB6JgAAgIQAAPoAAACA6AAAdTAAAOpgAAA6mAAAF3CculE8AAAAmklEQVRYR+2WwQ3AIAwDsf+OfRqh3sc0VlIpUkB6hKewE2xswCqV/tQ3oPScG1B6zg0oPecGlJ5zA0rPuQGl59yA0nNuQOk5N6D0nBtQes4NKD3nBpSecwNKz7kBpefcgNJzbkDpOTeg9JwbUHrODSg95waUnnMDj7kRInL7xRz2E+GgH3DwnBtgK3oBtsIXYCt8AbaivwV2E+GgH3AAgD5tZkZJpAAAAABJRU5ErkJggg==';

const __dirname = path.resolve();
const publicDir = path.join(__dirname, 'public');

// Write favicon.png
fs.writeFileSync(path.join(publicDir, 'favicon.png'), Buffer.from(faviconBase64, 'base64'));

// Write favicon.ico (most browsers accept PNG renamed to .ico)
fs.writeFileSync(path.join(publicDir, 'favicon.ico'), Buffer.from(faviconBase64, 'base64'));

console.log('Favicons generated successfully!');
