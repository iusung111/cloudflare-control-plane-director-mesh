import { Hono } from 'hono';
import { ControlPlaneRuntime } from '../runtime';
import { CommandRequest } from '../runtime/types';

type Bindings = {
  GITHUB_TOKEN?: string;
  GITHUB_OWNER?: string;
  GITHUB_REPO?: string;
  GITHUB_BRANCH?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.get('/', (c) => c.text('Cloudflare Control Plane Prototype - Active'));

app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.post('/commands', async (c) => {
  // [A-4] Validate environment variables
  const owner = c.env.GITHUB_OWNER;
  const repo = c.env.GITHUB_REPO;
  const token = c.env.GITHUB_TOKEN;
  const branch = c.env.GITHUB_BRANCH;

  if (!owner || !repo || !token || !branch) {
    return c.json({
      error: 'configuration_error',
      message: 'GITHUB_OWNER, GITHUB_REPO, GITHUB_TOKEN, and GITHUB_BRANCH must be explicitly configured',
    }, 500);
  }

  try {
    const body = await c.req.json<CommandRequest>();
    
    // Validate basic structure
    if (!body.commandId || !body.dedupKey || !body.action || !body.resource) {
      return c.json({ error: 'invalid_request_structure' }, 400);
    }

    const runtime = new ControlPlaneRuntime({
      github: {
        owner,
        repo,
        token,
        branch,
      },
    });

    const result = await runtime.handleCommand(body);
    return c.json(result);
  } catch (err: any) {
    if (err.message.includes("mission_kernel: invalid_request")) {
      return c.json({ error: 'invalid_request', message: err.message }, 400);
    }
    return c.json({ error: 'internal_error', message: err.message }, 500);
  }
});

export default app;
