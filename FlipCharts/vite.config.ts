import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');

  // Share a single global SQLite connection to prevent connection invalidation/locking issues
  let sharedDb: any = null;
  async function getDb(dbPath: string) {
    if (!sharedDb) {
      const { DatabaseSync } = await import('node:sqlite');
      sharedDb = new DatabaseSync(dbPath);
      sharedDb.exec('PRAGMA busy_timeout = 10000;');
      sharedDb.exec('PRAGMA journal_mode = WAL;');
    }
    return sharedDb;
  }

  // Helper to dynamically build the Alpaca API url and parse its response for stocks and crypto
  function getAlpacaUrlAndParser(symbol: string, startDateStr: string, endDateStr: string) {
    const cryptoMatch = symbol.toUpperCase().match(/^(BTC|ETH|SOL|ADA|DOGE|LTC|DOT|XRP)(USD|USDT)$/);
    if (cryptoMatch) {
      const cryptoSym = `${cryptoMatch[1]}/${cryptoMatch[2]}`;
      const url = `https://data.alpaca.markets/v1beta3/crypto/us/bars?symbols=${cryptoSym}&timeframe=1Day&start=${startDateStr}&end=${endDateStr}`;
      const parse = (resJson: any) => {
        return (resJson.bars && resJson.bars[cryptoSym]) || [];
      };
      return { url, parse };
    } else {
      const url = `https://data.alpaca.markets/v2/stocks/${symbol.toUpperCase()}/bars?timeframe=1Day&start=${startDateStr}&end=${endDateStr}&adjustment=all&feed=iex`;
      const parse = (resJson: any) => resJson.bars || [];
      return { url, parse };
    }
  }

  // Sync historical EOD data for a ticker from Alpaca API to SQLite db if missing or out of date
  async function syncTickerData(dbPath: string, symbol: string, apiKey: string | undefined, apiSecret: string | undefined) {
    const db = await getDb(dbPath);

    try {
      const maxDateStmt = db.prepare('SELECT MAX(date) as maxd FROM daily_prices WHERE ticker = ?');
      const row = maxDateStmt.get(symbol.toUpperCase()) as { maxd: string | null } | undefined;
      const lastDateStr = row ? row.maxd : null;

      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const endDateStr = yesterday.toISOString().split('T')[0];

      let startDateStr: string;
      if (lastDateStr) {
        const lastDate = new Date(lastDateStr + 'T00:00:00Z');
        lastDate.setUTCDate(lastDate.getUTCDate() + 1);
        startDateStr = lastDate.toISOString().split('T')[0];
      } else {
        const oneYearAgo = new Date(today);
        oneYearAgo.setDate(oneYearAgo.getDate() - 365);
        startDateStr = oneYearAgo.toISOString().split('T')[0];
      }

      if (startDateStr > endDateStr) {
        console.log(`Ticker ${symbol} is already up to date in database (last date: ${lastDateStr}).`);
        return;
      }

      console.log(`Syncing ${symbol} from ${startDateStr} to ${endDateStr} via Alpaca API...`);
      if (!apiKey || !apiSecret) {
        console.warn(`No Alpaca API credentials available. Cannot sync ${symbol} from API.`);
        return;
      }

      const { url, parse } = getAlpacaUrlAndParser(symbol, startDateStr, endDateStr);
      const response = await fetch(url, {
        headers: {
          'APCA-API-KEY-ID': apiKey,
          'APCA-API-SECRET-KEY': apiSecret,
        },
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Alpaca API error: ${response.statusText} - ${errText}`);
      }

      const resJson = await response.json();
      const bars = parse(resJson);

      if (bars.length > 0) {
        console.log(`Inserting ${bars.length} new bars for ${symbol} into database...`);
        db.exec('BEGIN TRANSACTION');
        const insertQuery = db.prepare(`
          INSERT OR REPLACE INTO daily_prices (date, ticker, open, high, low, close, volume)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        for (const bar of bars) {
          const dateStr = bar.t.split('T')[0];
          insertQuery.run(dateStr, symbol.toUpperCase(), bar.o, bar.h, bar.l, bar.c, bar.v);
        }
        db.exec('COMMIT');
        console.log(`Database updated for ${symbol}.`);
      } else {
        console.log(`No new data found from API for ${symbol} for the range ${startDateStr} to ${endDateStr}.`);
      }
    } catch (err) {
      console.error(`Error syncing ticker data for ${symbol}:`, err);
    }
  }

  return {
    plugins: [
      react(), 
      tailwindcss(),
      {
        name: 'copy-watchlist-yaml',
        generateBundle() {
          try {
            const watchlistPath = path.resolve(__dirname, 'watchlist.yaml');
            if (fs.existsSync(watchlistPath)) {
              this.emitFile({
                type: 'asset',
                fileName: 'watchlist.yaml',
                source: fs.readFileSync(watchlistPath, 'utf-8')
              });
            }
          } catch (err) {
            console.error('Error copying watchlist.yaml during build:', err);
          }
        }
      },
      {
        name: 'prices-api',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            try {
              fs.appendFileSync(path.resolve(__dirname, 'middleware.log'), `Incoming: ${req.method} ${req.url}\n`);
            } catch (e) {}

            if (req.url === '/watchlist.yaml') {
              try {
                const watchlistPath = path.resolve(__dirname, 'watchlist.yaml');
                if (fs.existsSync(watchlistPath)) {
                  res.setHeader('Content-Type', 'text/yaml');
                  res.end(fs.readFileSync(watchlistPath, 'utf-8'));
                  return;
                }
              } catch (err) {
                console.error('Error serving watchlist.yaml:', err);
              }
            }

            if (req.url && req.url.startsWith('/api/prices')) {
              try {
                const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
                const symbol = urlObj.searchParams.get('symbol');
                const timeframe = urlObj.searchParams.get('timeframe') || '3M';

                if (!symbol) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: 'Symbol parameter is required' }));
                  return;
                }

                // Calculate start date based on timeframe
                let days = 90;
                if (timeframe === '1D') days = 1;
                else if (timeframe === '1W') days = 7;
                else if (timeframe === '3M') days = 90;
                else if (timeframe === '6M') days = 180;
                else if (timeframe === '1Y') days = 365;

                const startDate = new Date();
                startDate.setDate(startDate.getDate() - days);
                const startDateStr = startDate.toISOString().split('T')[0];

                const dbPath = path.resolve(__dirname, '..', 'data.db');
                if (!fs.existsSync(dbPath)) {
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify([]));
                  return;
                }

                // Resolve Alpaca credentials from process env or loaded config env
                let apiKey = process.env.ALPACA_API_KEY || process.env.APCA_API_KEY_ID || env.VITE_ALPACA_KEY_ID;
                let apiSecret = process.env.ALPACA_API_SECRET || process.env.APCA_API_SECRET_KEY || env.VITE_ALPACA_SECRET_KEY;

                // If not found, try loading from sibling grep_alpha/.env
                if (!apiKey || !apiSecret) {
                  try {
                    const dotenv = await import('dotenv');
                    const grepAlphaEnvPath = path.resolve(__dirname, '..', 'grep_alpha', '.env');
                    if (fs.existsSync(grepAlphaEnvPath)) {
                      const parsedEnv = dotenv.parse(fs.readFileSync(grepAlphaEnvPath));
                      apiKey = apiKey || parsedEnv.APCA_API_KEY_ID;
                      apiSecret = apiSecret || parsedEnv.APCA_API_SECRET_KEY;
                    }
                  } catch (dotenvErr) {
                    // Ignore
                  }
                }

                // Resolve bash-style $ variables if any (e.g. $ALPACA_API_KEY)
                if (apiKey && apiKey.startsWith('$')) {
                  apiKey = process.env[apiKey.slice(1)] || apiKey;
                }
                if (apiSecret && apiSecret.startsWith('$')) {
                  apiSecret = process.env[apiSecret.slice(1)] || apiSecret;
                }

                // Sync the ticker data from external API to db before querying
                await syncTickerData(dbPath, symbol, apiKey, apiSecret);

                // Use shared global database connection
                const db = await getDb(dbPath);
                const query = db.prepare(`
                  SELECT date, open, high, low, close, volume 
                  FROM daily_prices 
                  WHERE ticker = ? AND date >= ?
                  ORDER BY date ASC
                `);
                
                const rows = query.all(symbol.toUpperCase(), startDateStr) as {
                  date: string;
                  open: number;
                  high: number;
                  low: number;
                  close: number;
                  volume: number;
                }[];

                const formattedRows = rows.map((row) => ({
                  time: Math.floor(new Date(row.date + 'T00:00:00Z').getTime() / 1000),
                  open: row.open,
                  high: row.high,
                  low: row.low,
                  close: row.close,
                  volume: row.volume,
                }));

                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(formattedRows));
                return;
              } catch (err: any) {
                console.error('Error handling /api/prices:', err);
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: err.message || 'Internal server error' }));
                return;
              }
            }
            next();
          });
        }
      }
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true,
        },
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
