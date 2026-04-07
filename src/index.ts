import { Hono } from 'hono';
import { ControlPlaneRuntime } from '../runtime';
import { CommandRequest } from '../runtime/types';

type Bindings = {
  GITHUB_TOKEN: string;
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  GITHUB_BRANCH?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.get('/', (c) => c.text('Cloudflare Control Plane Prototype - Active'));

app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.post('/commands', async (c) => {
  try {
    const body = await c.req.json<CommandRequest>();
    
    // Validate basic structure
    if (!body.commandId || !body.dedupKey || !body.action) {
      return c.json({ error: 'invalid_request_structure' }, 400);
    }

    const runtime = new ControlPlaneRuntime({
      github: {
        owner: c.env.GITHUB_OWNER,
        repo: c.env.GITHUB_REPO,
        token: c.env.GITHUB_TOKEN,
        branch: c.env.GITHUB_BRANCH,
      },
    });

    const result = await runtime.handleCommand(body);
    return c.json(result);
  } catch (err: any) {
    return c.json({ error: 'internal_error', message: err.message }, 500);
  }
});

export default app;
