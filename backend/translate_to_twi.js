const fs = require('fs');
const path = require('path');
const { GoogleTranslator } = require('deep-translator');

const INPUT_PATH = path.join(__dirname, '..', 'frontend', 'src', 'data', 'conversationTree.twi.json');
const OUTPUT_PATH = path.join(__dirname, '..', 'frontend', 'src', 'data', 'conversationTree.twi.json');

const translator = new GoogleTranslator({ source: 'en', target: 'ak' });

function translateText(text) {
  if (!text || typeof text !== 'string') return text;
  const cleaned = text.trim();
  if (!cleaned) return text;
  if (/^\d+$/.test(cleaned) || cleaned.startsWith('REF') || cleaned.startsWith('CASE') || cleaned.startsWith('BILL') || cleaned.startsWith('ESC') || cleaned.startsWith('MOM')) {
    return text;
  }
  try {
    const result = translator.translate(cleaned);
    return result || text;
  } catch (e) {
    console.error(`Error translating '${cleaned.slice(0, 30)}...': ${e.message}`);
    return text;
  }
}

function translateNode(node) {
  if (!node || typeof node !== 'object') return node;
  const result = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === 'agent' && typeof value === 'string') {
      result[key] = translateText(value);
    } else if (key === 'label' && typeof value === 'string') {
      result[key] = translateText(value);
    } else if (Array.isArray(value)) {
      result[key] = value.map(item => translateNode(item));
    } else if (value && typeof value === 'object') {
      result[key] = translateNode(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function translateTree(tree) {
  const result = {};
  for (const [nodeId, node] of Object.entries(tree)) {
    result[nodeId] = translateNode(node);
  }
  return result;
}

async function main() {
  console.log('Reading English tree...');
  const englishTree = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf8'));
  console.log(`Translating ${Object.keys(englishTree).length} nodes to Twi...`);
  const twiTree = translateTree(englishTree);
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(twiTree, null, 2), 'utf8');
  console.log('Saved Twi tree to', OUTPUT_PATH);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
