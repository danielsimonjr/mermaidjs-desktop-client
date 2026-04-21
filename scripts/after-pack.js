// electron-builder afterPack hook.
// Trims release/win-unpacked/locales/ (and equivalent on mac/linux) down to
// en-US.pak. The app UI is English-only, so the other 54 locale pakfiles
// (~41 MB) would just inflate the installer and slow down cold-start file
// scanning.

const fs = require('node:fs');
const path = require('node:path');

const KEEP = new Set(['en-US.pak']);

exports.default = async function afterPack(context) {
  const localesDir = path.join(context.appOutDir, 'locales');
  if (!fs.existsSync(localesDir)) return;

  let removed = 0;
  let freedBytes = 0;
  for (const entry of fs.readdirSync(localesDir)) {
    if (KEEP.has(entry)) continue;
    const full = path.join(localesDir, entry);
    const stat = fs.statSync(full);
    fs.unlinkSync(full);
    removed += 1;
    freedBytes += stat.size;
  }

  if (removed > 0) {
    const freedMb = (freedBytes / (1024 * 1024)).toFixed(1);
    console.log(`afterPack: stripped ${removed} locale pakfile(s), freed ${freedMb} MB`);
  }
};
