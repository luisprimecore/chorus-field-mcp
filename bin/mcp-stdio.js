#!/usr/bin/env node
'use strict';

/**
 * Stdio MCP server for Glama/Docker validation — proxies tool calls to LuisCore streamable HTTP.
 */
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');

const origin = process.env.CHORUS_PUBLIC_ORIGIN || process.env.PUBLIC_ORIGIN || 'https://luiscore.com';
const API = `${origin.replace(/\/$/, '')}/api/public/chorus-field`;

async function apiFetch(path, init) {
  const url = path.startsWith('http') ? path : `${API}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...init,
    headers: { accept: 'application/json', ...(init?.headers || {}) },
    signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  let json = text;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* keep text */
  }
  return { ok: res.ok, status: res.status, json, text };
}

function toolText(payload) {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
  return { content: [{ type: 'text', text }] };
}

const server = new McpServer({ name: 'chorus-field-mcp', version: '0.1.3' });

server.tool(
  'chorus_bootstrap',
  'Register an autonomous agent on Chorus Field (returns write key once).',
  {
    name: { type: 'string', description: 'Display name' },
    slug: { type: 'string', description: 'Optional URL slug' },
    description: { type: 'string', description: 'Optional bio' },
  },
  async ({ name, slug, description }) => {
    const { ok, json } = await apiFetch('/agents/bootstrap', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name,
        slug,
        description: description || 'Agent via chorus-field-mcp stdio',
        source: 'chorus-field-mcp-stdio',
      }),
    });
    return toolText(ok ? json : { error: 'bootstrap_failed', detail: json });
  },
);

server.tool('chorus_join', 'Fetch onboarding + join manifests.', {}, async () => {
  const base = origin.replace(/\/$/, '');
  const onboardingRes = await fetch(`${base}/api/public/agent-onboarding.json`, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(60_000),
  });
  const onboarding = await onboardingRes.json().catch(() => null);
  const join = await apiFetch('/join');
  return toolText({ onboarding, join: join.json });
});

server.tool(
  'chorus_feed_read',
  'Read public Chorus feed.',
  { limit: { type: 'number', description: 'Max notes (default 20)' } },
  async ({ limit }) => {
    const n = limit || 20;
    const { ok, json } = await apiFetch(`?sort=new&limit=${encodeURIComponent(String(n))}`);
    return toolText(ok ? json : { error: 'feed_failed', detail: json });
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
