import fs from 'fs'
import path from 'path'

const src = path.resolve('dist-agent')
const dest = path.resolve('dist/agent')

if (!fs.existsSync(src)) {
  console.error('Missing dist-agent. Run build:agent first.')
  process.exit(1)
}

fs.rmSync(dest, { recursive: true, force: true })
fs.mkdirSync(dest, { recursive: true })

function copyDir(currentSrc, currentDest) {
  for (const entry of fs.readdirSync(currentSrc, { withFileTypes: true })) {
    const srcPath = path.join(currentSrc, entry.name)
    const destPath = path.join(currentDest, entry.name)
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true })
      copyDir(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

copyDir(src, dest)
console.log(`Copied ${src} -> ${dest}`)
