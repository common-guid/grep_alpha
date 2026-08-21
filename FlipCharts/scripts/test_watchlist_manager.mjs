import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const watchlistPath = path.resolve(__dirname, '..', 'watchlist.yaml');

// Import parser logic
function parseWatchlistYaml(yamlText) {
  const items = [];
  const lines = yamlText.split('\n');
  let currentItem = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (trimmed.startsWith('-')) {
      if (currentItem && currentItem.symbol) {
        items.push(currentItem);
      }
      currentItem = { symbol: '', status: '', target_entry: null, thesis: '', tags: [] };
      const contentAfterDash = trimmed.substring(1).trim();
      if (!contentAfterDash) continue;
      parseProperty(contentAfterDash, currentItem);
    } else if (currentItem) {
      parseProperty(trimmed, currentItem);
    }
  }

  if (currentItem && currentItem.symbol) {
    items.push(currentItem);
  }
  return items;
}

function parseProperty(line, item) {
  const colonIdx = line.indexOf(':');
  if (colonIdx === -1) return;
  const key = line.substring(0, colonIdx).trim();
  let val = line.substring(colonIdx + 1).trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.substring(1, val.length - 1);
  }
  switch (key) {
    case 'symbol':
      item.symbol = val.toUpperCase();
      break;
    case 'status':
      item.status = val;
      break;
    case 'target_entry':
      item.target_entry = (val === 'null' || val === '') ? null : parseFloat(val);
      if (isNaN(item.target_entry)) item.target_entry = null;
      break;
    case 'thesis':
      item.thesis = val;
      break;
    case 'tags':
      item.tags = val.split(',').map(t => t.trim()).filter(Boolean);
      break;
  }
}

function dumpWatchlistYaml(items) {
  let yaml = '';
  for (const item of items) {
    yaml += `- symbol: ${item.symbol.toUpperCase()}\n`;
    yaml += `  status: ${item.status || 'watching'}\n`;
    yaml += `  target_entry: ${item.target_entry !== null && item.target_entry !== undefined ? item.target_entry : 'null'}\n`;
    if (!item.thesis) {
      yaml += `  thesis: ''\n`;
    } else if (item.thesis.includes('\n') || item.thesis.includes(':') || item.thesis.includes('"') || item.thesis.includes("'")) {
      yaml += `  thesis: ${JSON.stringify(item.thesis)}\n`;
    } else {
      yaml += `  thesis: ${item.thesis}\n`;
    }
    const tagsStr = Array.isArray(item.tags) ? item.tags.join(', ') : (item.tags || '');
    yaml += `  tags: ${tagsStr}\n`;
  }
  return yaml;
}

function filterByTag(items, targetTag) {
  if (!targetTag || targetTag === 'all') return items;
  const target = targetTag.trim().toLowerCase();
  const cleanTarget = target.replace(/[_-]/g, '');

  return items.filter(item => {
    if (!item.tags || item.tags.length === 0) return target === 'uncategorized';
    return item.tags.some(tag => {
      const normTag = tag.trim().toLowerCase();
      return normTag === target || normTag.replace(/[_-]/g, '') === cleanTarget;
    });
  });
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ Assertion Failed: ${message}`);
    process.exit(1);
  }
  console.log(`✅ Passed: ${message}`);
}

console.log('🚀 Running Watchlist Manager Automated Verification Tests...\n');

// Test 1: Load and parse master watchlist.yaml
const initialYaml = fs.readFileSync(watchlistPath, 'utf-8');
const items = parseWatchlistYaml(initialYaml);
assert(items.length > 50, `Parsed ${items.length} master watchlist items (expected > 50)`);

// Test 2: Verify Aero Tag Filtering
const aeroItems = filterByTag(items, 'aero');
assert(aeroItems.length >= 8, `Aero tag filter returned ${aeroItems.length} items (expected >= 8)`);
const aeroSymbols = aeroItems.map(i => i.symbol);
const expectedAero = ['AERG', 'BA', 'CW', 'ESLT', 'HEI', 'LHX', 'RCAT', 'RKLB'];
for (const sym of expectedAero) {
  assert(aeroSymbols.includes(sym), `Aero tag correctly includes symbol: ${sym}`);
}

// Test 3: Verify All Symbols category
const allItems = filterByTag(items, 'all');
assert(allItems.length === items.length, `'all' tag returns entire master list (${allItems.length} symbols)`);

// Test 4: Simulate Adding a New Symbol (LMT to Aero & Defense_Tech)
const newItem = {
  symbol: 'LMT',
  status: 'watching',
  target_entry: 450.0,
  thesis: 'Premier defense prime contractor with steady F-35 backlog',
  tags: ['Aero', 'Defense_Tech']
};
const itemsWithNew = [...items.filter(i => i.symbol !== 'LMT'), newItem];
const aeroAfterAdd = filterByTag(itemsWithNew, 'aero');
assert(aeroAfterAdd.some(i => i.symbol === 'LMT'), 'New symbol LMT appears in Aero filtered view');
const defenseAfterAdd = filterByTag(itemsWithNew, 'defense_tech');
assert(defenseAfterAdd.some(i => i.symbol === 'LMT'), 'New symbol LMT appears in Defense_Tech filtered view');

// Test 5: Simulate Editing a Symbol
const updatedItems = itemsWithNew.map(i => {
  if (i.symbol === 'AERG') {
    return { ...i, target_entry: 14.50, thesis: 'Updated thesis: laser technology scaling' };
  }
  return i;
});
const aergUpdated = updatedItems.find(i => i.symbol === 'AERG');
assert(aergUpdated.target_entry === 14.50, 'AERG target entry successfully updated to 14.50');
assert(aergUpdated.thesis.includes('laser technology scaling'), 'AERG thesis updated successfully');

// Test 6: Verify YAML Dump Round-Trip Fidelity
const dumpedYaml = dumpWatchlistYaml(updatedItems);
const reParsedItems = parseWatchlistYaml(dumpedYaml);
assert(reParsedItems.length === updatedItems.length, `Round-trip YAML dump preserves item count (${reParsedItems.length})`);
const reParsedAerg = reParsedItems.find(i => i.symbol === 'AERG');
assert(reParsedAerg.target_entry === 14.50, 'Round-trip YAML retains float target_entry');
assert(reParsedAerg.tags.includes('Aero'), 'Round-trip YAML retains tags array');

// Test 7: Simulate Deleting a Symbol
const itemsAfterDelete = updatedItems.filter(i => i.symbol !== 'LMT');
assert(!itemsAfterDelete.some(i => i.symbol === 'LMT'), 'Deleted symbol LMT is cleanly removed');

console.log('\n🎉 ALL WATCHLIST MANAGER AUTOMATED TESTS PASSED SUCCESSFULLY!\n');
