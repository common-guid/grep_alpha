/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface WatchlistItem {
  symbol: string;
  status: string;
  target_entry: number | null;
  thesis: string;
  tags: string[];
}

export function parseWatchlistYaml(yamlText: string): WatchlistItem[] {
  const items: WatchlistItem[] = [];
  const lines = yamlText.split('\n');
  let currentItem: Partial<WatchlistItem> | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Ignore comments and empty lines
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // Check if we are starting a new list item
    // Matches lines like: "- symbol: RCAT" or just "-" on its own
    if (trimmed.startsWith('-')) {
      if (currentItem && currentItem.symbol) {
        items.push(currentItem as WatchlistItem);
      }
      currentItem = {
        symbol: '',
        status: '',
        target_entry: null,
        thesis: '',
        tags: []
      };
      
      // Strip the leading dash and any trailing/leading whitespace
      const contentAfterDash = trimmed.substring(1).trim();
      if (!contentAfterDash) {
        // Just a bare dash, properties will follow on next lines
        continue;
      }
      
      // Parse key-value on the same line if present (e.g. "- symbol: RCAT")
      parseProperty(contentAfterDash, currentItem);
    } else if (currentItem) {
      // Normal property line (e.g. "status: watching")
      parseProperty(trimmed, currentItem);
    }
  }

  // Push the final item if there is one
  if (currentItem && currentItem.symbol) {
    items.push(currentItem as WatchlistItem);
  }

  return items;
}

function parseProperty(line: string, item: Partial<WatchlistItem>) {
  const colonIdx = line.indexOf(':');
  if (colonIdx === -1) return;

  const key = line.substring(0, colonIdx).trim();
  let val = line.substring(colonIdx + 1).trim();

  // Remove surrounding quotes if they exist
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
      if (isNaN(item.target_entry as number)) {
        item.target_entry = null;
      }
      break;
    case 'thesis':
      item.thesis = val;
      break;
    case 'tags':
      // Split by comma and clean up individual tags
      item.tags = val.split(',')
        .map(t => t.trim())
        .filter(Boolean);
      break;
  }
}
