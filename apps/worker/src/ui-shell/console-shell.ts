import type { ConsoleSnapshot } from "../../../../packages/contracts/src";

export function createEmptyConsoleSnapshot(now = new Date().toISOString()): ConsoleSnapshot {
  return {
    summary: {
      generatedAt: now,
      sessions: { active: 0, expired: 0, revoked: 0 },
      leases: { active: 0, expired: 0, revoked: 0, released: 0 },
      commands: { queued: 0, emitted: 0, completed: 0, rejected: 0, failed: 0, cancelled: 0 },
      requests: { queuedForOrchestrator: 0, claimed: 0, awaitingApproval: 0, browserActionPending: 0 },
      yoloMode: {
        enabled: false,
        updatedAt: "1970-01-01T00:00:00.000Z",
        updatedBy: "system",
      },
    },
    recentEvents: [],
    requests: [],
    sessions: [],
    leases: [],
    missions: [],
  };
}

export function renderConsoleShell(snapshot: ConsoleSnapshot): string {
  const bootstrap = JSON.stringify(snapshot).replace(/</g, "\\u003c");

  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Control Plane Director Mesh</title>
      <style>
        :root {
          --bg: #f4f2eb;
          --panel: rgba(255, 255, 255, 0.92);
          --text: #1b2318;
          --muted: #5d6854;
          --line: #d5d7ca;
          --accent: #276749;
          --warn: #d97706;
          --danger: #b91c1c;
          --shadow: 0 18px 40px rgba(20, 28, 19, 0.08);
        }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          background:
            radial-gradient(circle at top left, rgba(39, 103, 73, 0.12), transparent 28%),
            radial-gradient(circle at top right, rgba(217, 119, 6, 0.10), transparent 26%),
            var(--bg);
          color: var(--text);
          font-family: "Segoe UI", "Noto Sans KR", sans-serif;
        }
        .shell {
          max-width: 1440px;
          margin: 0 auto;
          padding: 28px 18px 40px;
          display: grid;
          gap: 18px;
        }
        .hero, .panel {
          background: var(--panel);
          border: 1px solid var(--line);
          border-radius: 24px;
          box-shadow: var(--shadow);
          backdrop-filter: blur(14px);
        }
        .hero {
          padding: 24px;
          display: grid;
          gap: 14px;
        }
        .eyebrow {
          color: var(--muted);
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.12em;
        }
        .hero h1 {
          margin: 0;
          font-size: clamp(32px, 5vw, 56px);
          line-height: 0.95;
        }
        .hero p {
          margin: 0;
          color: var(--muted);
          max-width: 900px;
        }
        .toolbar {
          display: grid;
          gap: 10px;
          grid-template-columns: minmax(220px, 320px) repeat(5, max-content) 1fr;
          align-items: center;
        }
        .toolbar select, .toolbar button, .toolbar input, .toolbar textarea {
          border: 1px solid var(--line);
          border-radius: 14px;
          background: white;
          padding: 10px 12px;
          font: inherit;
          color: var(--text);
        }
        .toolbar button, .action {
          cursor: pointer;
          background: linear-gradient(135deg, #1f4f3b, #2f7d56);
          color: white;
          border: none;
        }
        .ghost {
          background: #edf2ea;
          color: var(--text);
          border: 1px solid var(--line);
        }
        .grid {
          display: grid;
          gap: 18px;
          grid-template-columns: 320px minmax(0, 1.2fr) minmax(0, 1fr);
        }
        .stack {
          display: grid;
          gap: 18px;
          min-width: 0;
        }
        .panel {
          padding: 18px;
          display: grid;
          gap: 14px;
        }
        .panel h2, .panel h3 {
          margin: 0;
          font-size: 18px;
        }
        .card-grid {
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(auto-fit, minmax(155px, 1fr));
        }
        .metric {
          border: 1px solid var(--line);
          border-radius: 18px;
          padding: 14px;
          background: rgba(255, 255, 255, 0.88);
        }
        .metric .label {
          color: var(--muted);
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .metric .value {
          margin-top: 8px;
          font-size: 28px;
          font-weight: 700;
        }
        .muted { color: var(--muted); }
        .list, .timeline, .signals, .bundles {
          display: grid;
          gap: 10px;
        }
        .item, .signal, .worker, .bundle {
          border: 1px solid var(--line);
          border-radius: 16px;
          padding: 12px;
          background: rgba(255, 255, 255, 0.88);
        }
        .worker-grid {
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        }
        .graph-shell {
          display: grid;
          gap: 14px;
          grid-template-columns: minmax(0, 1.2fr) 320px;
        }
        .graph-stage {
          border: 1px solid var(--line);
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.88);
          padding: 12px;
          overflow: auto;
        }
        .graph-stage svg {
          width: 100%;
          height: auto;
          min-width: 680px;
        }
        .summary-lane {
          display: grid;
          gap: 10px;
        }
        .tabs, .saved-views, .filter-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .tab, .saved-views button, .mini-action {
          border: 1px solid var(--line);
          border-radius: 999px;
          background: white;
          color: var(--text);
          padding: 8px 12px;
          cursor: pointer;
          font: inherit;
        }
        .tab.active {
          background: linear-gradient(135deg, #1f4f3b, #2f7d56);
          color: white;
          border: none;
        }
        .filter-grid input, .filter-grid select {
          border: 1px solid var(--line);
          border-radius: 12px;
          background: white;
          color: var(--text);
          padding: 8px 10px;
          font: inherit;
        }
        .split {
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .worker header, .item header, .signal header {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          align-items: center;
          margin-bottom: 6px;
        }
        .badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border-radius: 999px;
          padding: 4px 9px;
          font-size: 12px;
          background: #eef3ec;
          color: var(--text);
        }
        .badge.warn { background: #fff2dd; color: #9a5a00; }
        .badge.danger { background: #fee7e7; color: var(--danger); }
        .badge.ok { background: #e7f6ec; color: var(--accent); }
        .actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .actions button {
          cursor: pointer;
          border: none;
          border-radius: 12px;
          padding: 8px 10px;
          font: inherit;
        }
        .actions .read { background: #edf2ea; color: var(--text); }
        .actions .dismiss { background: #fee7e7; color: var(--danger); }
        .learning-form {
          display: grid;
          gap: 10px;
        }
        .learning-form input, .learning-form textarea, .learning-form select {
          width: 100%;
          border: 1px solid var(--line);
          border-radius: 14px;
          padding: 10px 12px;
          font: inherit;
          resize: vertical;
        }
        .learning-form .row {
          display: grid;
          gap: 10px;
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .statusline {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          color: var(--muted);
          font-size: 14px;
        }
        .empty {
          border: 1px dashed var(--line);
          border-radius: 16px;
          padding: 16px;
          color: var(--muted);
          text-align: center;
        }
        pre {
          margin: 0;
          white-space: pre-wrap;
          word-break: break-word;
          font-family: "Cascadia Code", "SFMono-Regular", monospace;
          font-size: 12px;
        }
        @media (max-width: 1150px) {
          .grid { grid-template-columns: 1fr; }
          .toolbar { grid-template-columns: 1fr 1fr; }
          .graph-shell { grid-template-columns: 1fr; }
        }
        @media (max-width: 720px) {
          .toolbar, .learning-form .row, .split { grid-template-columns: 1fr; }
        }
      </style>
    </head>
    <body>
      <div id="app" class="shell"></div>
      <script id="bootstrap" type="application/json">${bootstrap}</script>
      <script type="module">
        const bootstrap = JSON.parse(document.getElementById('bootstrap')?.textContent || '{}');
        const state = {
          dashboard: {
            summary: bootstrap.summary,
            quality: bootstrap.quality,
            observability: bootstrap.observability,
            releaseGate: bootstrap.releaseGate,
            retro: bootstrap.retro,
            alerts: bootstrap.alerts || [],
            commands: bootstrap.commands || [],
            deadLetters: bootstrap.deadLetters || [],
            learnings: bootstrap.learnings || [],
            recentEvents: bootstrap.recentEvents || [],
            missions: bootstrap.missions || [],
            requests: bootstrap.requests || [],
            scopedApprovals: bootstrap.scopedApprovals || [],
            sessions: bootstrap.sessions || [],
            leases: bootstrap.leases || [],
          },
          selectedMissionId: bootstrap.missions?.[0]?.missionId || null,
          connectedMissionId: null,
          mission: {
            liveGraph: null,
            playback: [],
            learnings: [],
            retro: null,
            handoffs: [],
            evidence: null,
            completedWorkers: [],
            requests: [],
          },
          workerFilters: { status: '', phase: '', q: '' },
          missionViewMode: 'live',
          evidenceTab: 'events',
          savedViews: loadSavedViews(),
          liveSocketState: 'idle',
          lastDeltaType: null,
        };

        let refreshTimer = null;
        let missionSocket = null;
        const root = document.getElementById('app');

        document.addEventListener('click', async (event) => {
          const target = event.target;
          if (!(target instanceof HTMLElement)) return;

          if (target.matches("[data-action='refresh']")) {
            await refreshAll();
            return;
          }

          if (target.matches("[data-action='alert-read']")) {
            await postJson('/api/alerts/' + target.dataset.id + '/read', {});
            await refreshAll();
            return;
          }

          if (target.matches("[data-action='alert-dismiss']")) {
            await postJson('/api/alerts/' + target.dataset.id + '/dismiss', {});
            await refreshAll();
            return;
          }

          if (target.matches("[data-action='yolo-toggle']")) {
            await postJson('/api/approvals/yolo', {
              enabled: !state.dashboard.summary?.yoloMode?.enabled,
              updatedBy: 'console-operator',
              note: 'console_toggle',
            });
            await refreshAll();
            return;
          }

          if (target.matches("[data-command-action]")) {
            const action = target.dataset.commandAction;
            const commandId = target.dataset.id;
            if (!action || !commandId) return;
            await postJson('/api/commands/' + commandId + '/' + action, action === 'reject'
              ? { reason: 'rejected_in_console' }
              : action === 'cancel'
                ? { reason: 'cancelled_in_console' }
                : {});
            await refreshAll();
            return;
          }

          if (target.matches("[data-dlq-action='requeue']")) {
            await postJson('/api/queue/dlq/' + target.dataset.id + '/requeue', {});
            await refreshAll();
            return;
          }

          if (target.matches("[data-dlq-action='dismiss']")) {
            await postJson('/api/queue/dlq/' + target.dataset.id + '/dismiss', {});
            await refreshAll();
            return;
          }

          if (target.matches('[data-approval-delete]')) {
            await deleteRequest('/api/approvals/scoped/' + target.dataset.approvalDelete);
            await refreshAll();
            return;
          }

          if (target.matches('[data-request-claim]')) {
            await postJson('/api/requests/' + target.dataset.requestClaim + '/claim', { owner: 'console-orchestrator' });
            await refreshAll();
            return;
          }

          if (target.matches('[data-request-status]')) {
            await postJson('/api/requests/' + target.dataset.id + '/status', {
              status: target.dataset.requestStatus,
              owner: 'console-orchestrator',
              resultSummary: target.dataset.requestStatus === 'completed' ? 'completed_from_console' : undefined,
            });
            await refreshAll();
            return;
          }

          if (target.matches('[data-evidence-tab]')) {
            state.evidenceTab = target.dataset.evidenceTab || 'events';
            render();
            return;
          }

          if (target.matches('[data-load-view]')) {
            const saved = state.savedViews.find((item) => item.name === target.dataset.loadView);
            if (saved) {
              state.workerFilters = { ...saved.filters };
              state.missionViewMode = saved.mode;
              render();
            }
            return;
          }

          if (target.matches('[data-remove-view]')) {
            state.savedViews = state.savedViews.filter((item) => item.name !== target.dataset.removeView);
            persistSavedViews(state.savedViews);
            render();
            return;
          }

          if (target.matches("[data-action='save-view']")) {
            const name = window.prompt('저장할 보기 이름');
            if (!name) return;
            state.savedViews = upsertSavedView(state.savedViews, {
              name,
              filters: { ...state.workerFilters },
              mode: state.missionViewMode,
            });
            persistSavedViews(state.savedViews);
            render();
            return;
          }

          if (target.matches("[data-action='logout']")) {
            await fetch('/logout', { method: 'POST' });
            window.location.assign('/login');
            return;
          }

          if (target.matches('[data-open]')) {
            window.open(target.dataset.open, '_blank', 'noopener');
          }
        });

        document.addEventListener('change', async (event) => {
          const target = event.target;
          if (!(target instanceof HTMLElement)) return;
          if (target instanceof HTMLSelectElement && target.id === 'mission-select') {
            state.selectedMissionId = target.value || null;
            await refreshMissionPanels();
            connectMissionSocket(true);
            render();
            return;
          }
          if (target instanceof HTMLSelectElement && target.id === 'mission-view-mode') {
            state.missionViewMode = target.value || 'live';
            render();
            return;
          }
          if (target instanceof HTMLSelectElement && target.id === 'worker-status-filter') {
            state.workerFilters.status = target.value || '';
            render();
            return;
          }
          if (target instanceof HTMLSelectElement && target.id === 'worker-phase-filter') {
            state.workerFilters.phase = target.value || '';
            render();
          }
        });

        document.addEventListener('submit', async (event) => {
          const form = event.target;
          if (!(form instanceof HTMLFormElement)) return;
          event.preventDefault();

          if (form.id === 'learning-form') {
            const data = new FormData(form);
            const mission = state.dashboard.missions.find((item) => item.missionId === state.selectedMissionId);
            await postJson('/api/learnings', {
              learningId: 'learning-' + Date.now(),
              scope: mission ? 'mission' : 'system',
              kind: String(data.get('kind') || 'note'),
              title: String(data.get('title') || ''),
              summary: String(data.get('summary') || ''),
              createdBy: 'console-operator',
              missionId: mission?.missionId,
              repoKey: mission?.repoKey,
              tags: String(data.get('tags') || '')
                .split(',')
                .map((tag) => tag.trim())
                .filter(Boolean),
            });
          }

          if (form.id === 'approval-form') {
            const data = new FormData(form);
            await postJson('/api/approvals/scoped', {
              approvalId: String(data.get('approvalId') || ('approval-' + Date.now())),
              actorId: String(data.get('actorId') || 'console-operator'),
              action: String(data.get('action') || 'deploy_live'),
              reason: String(data.get('reason') || '') || undefined,
              ttlMinutes: Number(data.get('ttlMinutes') || 60),
              resource: {
                repo: String(data.get('repo') || ''),
                branch: String(data.get('branch') || '') || undefined,
                path: String(data.get('path') || '') || undefined,
              },
            });
          }

          if (form.id === 'request-form') {
            const data = new FormData(form);
            await postJson('/api/requests', {
              requestId: 'request-' + Date.now(),
              actorId: 'console-operator',
              source: 'console',
              queue: String(data.get('queue') || 'llm'),
              locale: 'ko',
              title: String(data.get('title') || ''),
              prompt: String(data.get('prompt') || ''),
              missionId: state.selectedMissionId || undefined,
              relatedCommandId: String(data.get('relatedCommandId') || '') || undefined,
              targetUrl: String(data.get('targetUrl') || '') || undefined,
              selector: String(data.get('selector') || '') || undefined,
              expectedText: String(data.get('expectedText') || '') || undefined,
            });
          }

          if (form.id === 'worker-filter-form') {
            const data = new FormData(form);
            state.workerFilters = {
              status: String(data.get('status') || ''),
              phase: String(data.get('phase') || ''),
              q: String(data.get('q') || ''),
            };
          }

          form.reset();
          if (form.id === 'approval-form') {
            const actorInput = form.querySelector("[name='actorId']");
            const ttlInput = form.querySelector("[name='ttlMinutes']");
            if (actorInput instanceof HTMLInputElement) actorInput.value = 'console-operator';
            if (ttlInput instanceof HTMLInputElement) ttlInput.value = '60';
          }
          if (form.id === 'worker-filter-form') {
            const queryInput = form.querySelector("[name='q']");
            const statusInput = form.querySelector("[name='status']");
            const phaseInput = form.querySelector("[name='phase']");
            if (queryInput instanceof HTMLInputElement) queryInput.value = state.workerFilters.q;
            if (statusInput instanceof HTMLSelectElement) statusInput.value = state.workerFilters.status;
            if (phaseInput instanceof HTMLSelectElement) phaseInput.value = state.workerFilters.phase;
          }
          await refreshAll();
        });

        async function refreshAll() {
          await refreshDashboard();
          await refreshMissionPanels();
          connectMissionSocket();
          render();
        }

        async function refreshDashboard() {
          const [summary, quality, observability, releaseGate, retro, alerts, commands, deadLetters, learnings, recentEvents, missions, scopedApprovals, requests, sessions, leases] = await Promise.all([
            fetchJson('/api/state/summary'),
            fetchJson('/api/quality'),
            fetchJson('/api/observability'),
            fetchJson('/api/release-gate'),
            fetchJson('/api/retro'),
            fetchJson('/api/alerts'),
            fetchJson('/api/commands'),
            fetchJson('/api/queue/dlq'),
            fetchJson('/api/learnings'),
            fetchJson('/api/events'),
            fetchJson('/api/missions'),
            fetchJson('/api/approvals/scoped'),
            fetchJson('/api/requests'),
            fetchJson('/api/sessions'),
            fetchJson('/api/leases'),
          ]);

          state.dashboard = {
            summary,
            quality,
            observability,
            releaseGate,
            retro,
            alerts,
            commands,
            deadLetters,
            learnings,
            recentEvents,
            missions,
            requests,
            scopedApprovals,
            sessions,
            leases,
          };

          if (state.selectedMissionId && !missions.some((item) => item.missionId === state.selectedMissionId)) {
            state.selectedMissionId = missions[0]?.missionId || null;
          } else if (!state.selectedMissionId && missions[0]) {
            state.selectedMissionId = missions[0].missionId;
          }
        }

        async function refreshMissionPanels() {
          if (!state.selectedMissionId) {
            state.mission = { liveGraph: null, playback: [], learnings: [], retro: null, handoffs: [], evidence: null, completedWorkers: [], requests: [] };
            return;
          }

          const missionId = encodeURIComponent(state.selectedMissionId);
          const [liveGraph, playback, learnings, retro, handoffs, evidence, completedWorkers, requests] = await Promise.all([
            fetchJson('/api/missions/' + missionId + '/graph/live'),
            fetchJson('/api/missions/' + missionId + '/playback'),
            fetchJson('/api/missions/' + missionId + '/learnings'),
            fetchJson('/api/missions/' + missionId + '/retro'),
            fetchJson('/api/missions/' + missionId + '/handoffs'),
            fetchJson('/api/missions/' + missionId + '/evidence'),
            fetchJson('/api/missions/' + missionId + '/workers?status=completed'),
            fetchJson('/api/requests?missionId=' + missionId),
          ]);

          state.mission = { liveGraph, playback, learnings, retro, handoffs, evidence, completedWorkers, requests };
        }

        function closeMissionSocket() {
          if (!missionSocket) return;
          const socket = missionSocket;
          missionSocket = null;
          state.connectedMissionId = null;
          socket.close();
        }

        function connectMissionSocket(force = false) {
          if (!state.selectedMissionId) {
            closeMissionSocket();
            state.liveSocketState = 'idle';
            return;
          }

          if (
            !force &&
            missionSocket &&
            state.connectedMissionId === state.selectedMissionId &&
            [WebSocket.CONNECTING, WebSocket.OPEN].includes(missionSocket.readyState)
          ) {
            return;
          }

          closeMissionSocket();

          const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
          const url = protocol + '//' + location.host + '/api/missions/' + encodeURIComponent(state.selectedMissionId) + '/live';
          const socket = new WebSocket(url);
          missionSocket = socket;
          state.connectedMissionId = state.selectedMissionId;
          state.liveSocketState = 'connecting';

          socket.addEventListener('open', () => {
            if (missionSocket !== socket) return;
            state.liveSocketState = 'connected';
            render();
          });

          socket.addEventListener('message', async (event) => {
            if (missionSocket !== socket) return;
            const delta = JSON.parse(String(event.data));
            state.lastDeltaType = delta.type || 'unknown';
            await refreshMissionPanels();
            render();
          });

          socket.addEventListener('close', () => {
            if (missionSocket !== socket) return;
            missionSocket = null;
            state.connectedMissionId = null;
            state.liveSocketState = 'disconnected';
            render();
          });

          socket.addEventListener('error', () => {
            if (missionSocket !== socket) return;
            state.liveSocketState = 'error';
            render();
          });
        }

        function render() {
          if (!root) return;

          const dashboard = state.dashboard;
          const mission = dashboard.missions.find((item) => item.missionId === state.selectedMissionId) || null;
          const liveGraph = state.mission.liveGraph;
          const playback = state.mission.playback || [];
          const learnings = state.mission.learnings || [];
          const retro = state.mission.retro || dashboard.retro;
          const handoffs = state.mission.handoffs || [];
          const evidence = state.mission.evidence;
          const completedWorkers = applyWorkerFilters(state.mission.completedWorkers || []);
          const visibleWorkers = applyWorkerFilters(liveGraph?.visibleWorkers || []);
          const requests = state.mission.requests?.length ? state.mission.requests : (dashboard.requests || []);

          root.innerHTML = \`
            <section class="hero">
              <div class="eyebrow">Cloudflare Worker / Control API / MCP / Live Console</div>
              <h1>Control Plane Director Mesh</h1>
              <p>운영 요청, 실시간 mission, 승인, 브라우저 QA, release gate, playback, evidences를 한 화면에서 다루는 오퍼레이터 콘솔입니다.</p>
              <div class="statusline">
                <span>YOLO: <strong>\${dashboard.summary?.yoloMode?.enabled ? 'enabled' : 'disabled'}</strong></span>
                <span>Quality: <strong>\${dashboard.quality?.status || 'unknown'}</strong></span>
                <span>Release gate: <strong>\${dashboard.releaseGate?.status || 'unknown'}</strong></span>
                <span>Dead letters: <strong>\${(dashboard.deadLetters || []).length}</strong></span>
                <span>Live socket: <strong>\${state.liveSocketState}</strong></span>
                <span>Last live delta: <strong>\${state.lastDeltaType || 'none'}</strong></span>
              </div>
              <div class="toolbar">
                <select id="mission-select">
                  <option value="">Select mission</option>
                  \${(dashboard.missions || []).map((item) => \`<option value="\${escapeHtml(item.missionId)}" \${item.missionId === state.selectedMissionId ? 'selected' : ''}>\${escapeHtml(item.title)} (\${escapeHtml(item.phase)})</option>\`).join('')}
                </select>
                <button type="button" data-action="refresh">Refresh</button>
                <button type="button" class="ghost" data-open="/api/missions">Open API</button>
                <button type="button" class="ghost" data-open="/mcp">Open MCP</button>
                <button type="button" data-action="yolo-toggle">\${dashboard.summary?.yoloMode?.enabled ? 'Disable YOLO' : 'Enable YOLO'}</button>
                <button type="button" class="ghost" data-action="logout">Logout</button>
              </div>
            </section>
            <section class="panel">
              <div class="card-grid">
                \${metric('Active Sessions', dashboard.summary?.sessions?.active ?? 0)}
                \${metric('Active Leases', dashboard.summary?.leases?.active ?? 0)}
                \${metric('Queued Commands', dashboard.summary?.commands?.queued ?? 0)}
                \${metric('Dead Letters', (dashboard.deadLetters || []).length)}
                \${metric('Orchestrator Queue', dashboard.summary?.requests?.queuedForOrchestrator ?? 0)}
                \${metric('Unread Alerts', (dashboard.alerts || []).filter((item) => item.unread).length)}
                \${metric('Learnings', dashboard.retro?.learningsCount ?? 0)}
                \${metric('Approval Wait(ms)', dashboard.observability?.metrics?.approvalWaitDurationMs ?? 0)}
                \${metric('Browser QA(ms)', dashboard.observability?.metrics?.browserQaDurationMs ?? 0)}
                \${metric('Scoped Approvals', (dashboard.scopedApprovals || []).length)}
                \${metric('Missions', (dashboard.missions || []).length)}
              </div>
            </section>
            <section class="grid">
              <div class="stack">
                <article class="panel">
                  <h2>Active Missions</h2>
                  <div class="list">\${renderMissionList(dashboard.missions || [])}</div>
                </article>
                <article class="panel">
                  <h2>Sessions / Leases</h2>
                  <div class="list">\${renderSessions(dashboard.sessions || [], dashboard.leases || [])}</div>
                </article>
                <article class="panel">
                  <h2>Command Lifecycle</h2>
                  <div class="list">\${renderCommands(dashboard.commands || [])}</div>
                </article>
                <article class="panel">
                  <h2>Operator Requests</h2>
                  <div class="list">\${renderRequests(requests)}</div>
                </article>
                <article class="panel">
                  <h2>Alerts</h2>
                  <div class="list">\${renderAlerts(dashboard.alerts || [])}</div>
                </article>
                <article class="panel">
                  <h2>Recent Events</h2>
                  <div class="timeline">\${renderEvents(dashboard.recentEvents || [])}</div>
                </article>
              </div>
              <div class="stack">
                <article class="panel">
                  <h2>Mission Live View</h2>
                  \${mission ? \`<div class="muted">\${escapeHtml(mission.title)} / \${escapeHtml(mission.phase)} / \${escapeHtml(mission.status)}</div>\` : '<div class="empty">Select a mission to inspect the live graph.</div>'}
                  \${mission ? renderMissionControls() : ''}
                  \${mission && state.missionViewMode === 'live' && liveGraph ? renderLiveGraph({ ...liveGraph, visibleWorkers }) : ''}
                  \${mission && state.missionViewMode === 'completed' ? renderCompletedWorkers(completedWorkers) : ''}
                  \${mission && state.missionViewMode === 'playback' ? '<div class="timeline">' + renderPlayback(playback) + '</div>' : ''}
                </article>
                <article class="panel">
                  <h2>Handoff Inspector</h2>
                  <div class="list">\${renderHandoffs(handoffs)}</div>
                </article>
                <article class="panel">
                  <h2>Evidence Drawer</h2>
                  \${renderEvidenceDrawer(evidence, state.evidenceTab)}
                </article>
              </div>
              <div class="stack">
                <article class="panel">
                  <h2>Release Checks</h2>
                  <div class="signals">\${renderSignals(dashboard.releaseGate?.checks || [], dashboard.quality?.signals || [])}</div>
                </article>
                <article class="panel">
                  <h2>Observability</h2>
                  <div class="signals">\${renderSignals(dashboard.observability?.alerts || [], dashboard.observability?.signals || [])}</div>
                </article>
                <article class="panel">
                  <h2>Scoped Approvals</h2>
                  <div class="list">\${renderScopedApprovals(dashboard.scopedApprovals || [])}</div>
                </article>
                <article class="panel">
                  <h2>Learn / Retro</h2>
                  <div class="list">\${renderLearnings(learnings.length ? learnings : (dashboard.learnings || []))}</div>
                  \${renderRetro(retro)}
                </article>
                <article class="panel">
                  <h2>Submit Request</h2>
                  <form id="request-form" class="learning-form">
                    <div class="row">
                      <select name="queue">
                        <option value="llm">llm</option>
                        <option value="browser">browser</option>
                        <option value="approval">approval</option>
                      </select>
                      <input type="text" name="relatedCommandId" placeholder="related command id" />
                    </div>
                    <input type="text" name="title" placeholder="요청 제목" required />
                    <textarea name="prompt" rows="4" placeholder="main orchestrator 또는 GPT에게 전달할 요청사항" required></textarea>
                    <div class="row">
                      <input type="text" name="targetUrl" placeholder="target url (browser queue)" />
                      <input type="text" name="selector" placeholder="selector (browser queue)" />
                    </div>
                    <input type="text" name="expectedText" placeholder="expected text (browser queue)" />
                    <button type="submit" class="action">요청 큐 적재</button>
                  </form>
                </article>
                <article class="panel">
                  <h2>Capture Learning</h2>
                  <form id="learning-form" class="learning-form">
                    <div class="row">
                      <select name="kind">
                        <option value="improvement">improvement</option>
                        <option value="incident">incident</option>
                        <option value="guardrail">guardrail</option>
                        <option value="note">note</option>
                      </select>
                      <input type="text" name="tags" placeholder="tags, comma,separated" />
                    </div>
                    <input type="text" name="title" placeholder="Learning title" required />
                    <textarea name="summary" rows="4" placeholder="What should the team remember next time?" required></textarea>
                    <button type="submit" class="action">Capture Learning</button>
                  </form>
                </article>
                <article class="panel">
                  <h2>Create Scoped Approval</h2>
                  <form id="approval-form" class="learning-form">
                    <div class="row">
                      <input type="text" name="approvalId" placeholder="approval id (optional)" />
                      <input type="text" name="actorId" placeholder="actor id" value="console-operator" required />
                    </div>
                    <div class="row">
                      <select name="action">
                        <option value="deploy_live">deploy_live</option>
                        <option value="deploy_mirror">deploy_mirror</option>
                        <option value="github_write">github_write</option>
                        <option value="github_pr_create">github_pr_create</option>
                      </select>
                      <input type="number" name="ttlMinutes" min="1" value="60" />
                    </div>
                    <input type="text" name="repo" placeholder="repo" required />
                    <div class="row">
                      <input type="text" name="branch" placeholder="branch" />
                      <input type="text" name="path" placeholder="path" />
                    </div>
                    <textarea name="reason" rows="3" placeholder="Why is this approval safe?"></textarea>
                    <button type="submit" class="action">Create Approval</button>
                  </form>
                </article>
              </div>
            </section>
          \`;
        }

        function renderMissionList(missions) {
          if (!missions.length) return '<div class="empty">No missions yet.</div>';
          return missions.map((mission) => \`
            <div class="item">
              <header>
                <strong>\${escapeHtml(mission.title)}</strong>
                <span class="badge \${badgeTone(mission.status)}">\${escapeHtml(mission.status)}</span>
              </header>
              <div class="muted">\${escapeHtml(mission.phase)} / \${escapeHtml(mission.repoKey)}</div>
            </div>
          \`).join('');
        }

        function renderSessions(sessions, leases) {
          if (!sessions.length && !leases.length) return '<div class="empty">No active sessions or leases.</div>';
          return [
            ...sessions.slice(0, 6).map((session) => \`
              <div class="item">
                <header>
                  <strong>\${escapeHtml(session.sessionId)}</strong>
                  <span class="badge \${badgeTone(session.status)}">\${escapeHtml(session.status)}</span>
                </header>
                <div class="muted">\${escapeHtml(session.actorId)} / \${escapeHtml(session.role)}</div>
                <div class="muted">expires \${escapeHtml(session.expiresAt)}</div>
              </div>
            \`),
            ...leases.slice(0, 6).map((lease) => \`
              <div class="item">
                <header>
                  <strong>\${escapeHtml(lease.leaseId)}</strong>
                  <span class="badge \${badgeTone(lease.status)}">\${escapeHtml(lease.status)}</span>
                </header>
                <div class="muted">\${escapeHtml(lease.resource?.repo || '-')} / \${escapeHtml(lease.resource?.path || '*')}</div>
                <div class="muted">session \${escapeHtml(lease.sessionId)}</div>
              </div>
            \`),
          ].join('');
        }

        function renderAlerts(alerts) {
          if (!alerts.length) return '<div class="empty">No active alerts.</div>';
          return alerts.map((alert) => \`
            <div class="item">
              <header>
                <strong>\${escapeHtml(alert.summary)}</strong>
                <span class="badge \${badgeTone(alert.severity === 'high' ? 'fail' : alert.status)}">\${escapeHtml(alert.severity)}</span>
              </header>
              <div class="muted">\${escapeHtml(alert.commandId)} / \${alert.unread ? 'unread' : 'read'}</div>
              <div class="actions">
                <button class="read" data-action="alert-read" data-id="\${escapeHtml(alert.alertId)}">읽음</button>
                <button class="dismiss" data-action="alert-dismiss" data-id="\${escapeHtml(alert.alertId)}">숨김</button>
              </div>
            </div>
          \`).join('');
        }

        function renderRequests(requests) {
          if (!requests.length) return '<div class="empty">No operator requests.</div>';
          return requests.slice(0, 10).map((request) => \`
            <div class="item">
              <header>
                <strong>\${escapeHtml(request.title)}</strong>
                <span class="badge \${badgeTone(request.status)}">\${escapeHtml(request.status)}</span>
              </header>
              <div class="muted">\${escapeHtml(request.queue)} / \${escapeHtml(request.source)} / \${escapeHtml(request.locale)}</div>
              <div>\${escapeHtml(request.prompt)}</div>
              <div class="muted">\${escapeHtml(request.claimOwner || 'unclaimed')}</div>
              <div class="actions">
                \${request.status === 'queued_for_orchestrator' ? \`<button class="read" data-request-claim="\${escapeHtml(request.requestId)}">Claim</button>\` : ''}
                \${['claimed', 'planning', 'awaiting_approval', 'browser_action_pending', 'executing'].includes(request.status) ? \`<button class="read" data-request-status="completed" data-id="\${escapeHtml(request.requestId)}">완료</button>\` : ''}
                \${['claimed', 'planning', 'awaiting_approval', 'browser_action_pending', 'executing'].includes(request.status) ? \`<button class="dismiss" data-request-status="failed" data-id="\${escapeHtml(request.requestId)}">실패</button>\` : ''}
              </div>
            </div>
          \`).join('');
        }

        function renderCommands(commands) {
          if (!commands.length) return '<div class="empty">No commands recorded.</div>';
          return commands.slice(0, 10).map((command) => \`
            <div class="item">
              <header>
                <strong>\${escapeHtml(command.commandId)}</strong>
                <span class="badge \${badgeTone(command.status)}">\${escapeHtml(command.status)}</span>
              </header>
              <div class="muted">\${escapeHtml(command.action)} / \${escapeHtml(command.resource?.repo || '-')}</div>
              <div class="muted">\${escapeHtml(command.latestReason || 'no latest reason')}</div>
              \${command.result ? \`<pre>\${escapeHtml(JSON.stringify(command.result, null, 2))}</pre>\` : ''}
              <div class="actions">
                \${renderCommandAction(command, 'approve', '승인')}
                \${renderCommandAction(command, 'retry', '재시도')}
                \${renderCommandAction(command, 'reject', '거부')}
                \${renderCommandAction(command, 'cancel', '취소')}
              </div>
            </div>
          \`).join('');
        }

        function renderDeadLetters(commands) {
          if (!commands.length) return '<div class="empty">No dead-lettered commands.</div>';
          return commands.map((command) => \`
            <div class="item">
              <header>
                <strong>\${escapeHtml(command.commandId)}</strong>
                <span class="badge danger">failed</span>
              </header>
              <div class="muted">\${escapeHtml(command.action)} / \${escapeHtml(command.resource?.repo || '-')}</div>
              <div>\${escapeHtml(command.latestReason || 'retry_exhausted')}</div>
              <div class="actions">
                <button class="read" data-dlq-action="requeue" data-id="\${escapeHtml(command.commandId)}">재큐잉</button>
                <button class="dismiss" data-dlq-action="dismiss" data-id="\${escapeHtml(command.commandId)}">폐기</button>
              </div>
            </div>
          \`).join('');
        }

        function renderScopedApprovals(approvals) {
          if (!approvals.length) return '<div class="empty">No scoped approvals.</div>';
          return approvals.map((approval) => \`
            <div class="item">
              <header>
                <strong>\${escapeHtml(approval.approvalId)}</strong>
                <span class="badge">\${escapeHtml(approval.action)}</span>
              </header>
              <div class="muted">\${escapeHtml(approval.resource?.repo || '-')} / \${escapeHtml(approval.resource?.branch || '*')} / \${escapeHtml(approval.resource?.path || '*')}</div>
              <div>\${escapeHtml(approval.reason || 'no reason provided')}</div>
              <div class="muted">expires \${escapeHtml(approval.expiresAt)}</div>
              <div class="actions">
                <button class="dismiss" data-approval-delete="\${escapeHtml(approval.approvalId)}">삭제</button>
              </div>
            </div>
          \`).join('');
        }

        function renderEvents(events) {
          if (!events.length) return '<div class="empty">No events recorded.</div>';
          return events.slice(0, 12).map((event) => \`
            <div class="item">
              <header>
                <strong>\${escapeHtml(event.action)}</strong>
                <span class="badge \${badgeTone(event.status)}">\${escapeHtml(event.status)}</span>
              </header>
              <div class="muted">\${escapeHtml(event.createdAt)}</div>
              <div>\${escapeHtml(event.reason || '-')}</div>
            </div>
          \`).join('');
        }

        function renderLiveGraph(liveGraph) {
          const workers = liveGraph.visibleWorkers.length
            ? liveGraph.visibleWorkers.map((worker) => \`
                <div class="worker">
                  <header>
                    <strong>\${escapeHtml(worker.title)}</strong>
                    <span class="badge \${badgeTone(worker.status)}">\${escapeHtml(worker.status)}</span>
                  </header>
                  <div class="muted">\${escapeHtml(worker.role)} / \${escapeHtml(worker.phase)}</div>
                  <div>\${escapeHtml(worker.summary)}</div>
                  <div class="muted">progress \${escapeHtml(String(worker.progress ?? 0))}% / parent \${escapeHtml(worker.parentWorkerId || '-')}</div>
                  <div class="muted">blocker \${escapeHtml(worker.blockerReason || '-')}</div>
                  <div class="muted">heartbeat \${escapeHtml(worker.lastHeartbeatAt)}</div>
                </div>
              \`).join('')
            : '<div class="empty">No visible workers in the live graph.</div>';

          const bundles = liveGraph.collapsedBundles.length
            ? liveGraph.collapsedBundles.map((bundle) => \`
                <div class="bundle">
                  <header>
                    <strong>\${escapeHtml(bundle.phase)} bundle</strong>
                    <span class="badge">\${bundle.count} completed</span>
                  </header>
                  <div class="muted">\${escapeHtml(bundle.workerIds.join(', '))}</div>
                </div>
              \`).join('')
            : '<div class="empty">No collapsed bundles.</div>';

          return \`
            <div class="statusline">
              <span>Visible workers: <strong>\${liveGraph.visibleWorkers.length}</strong></span>
              <span>Collapsed bundles: <strong>\${liveGraph.collapsedBundles.length}</strong></span>
              <span>Archived workers: <strong>\${liveGraph.archivedWorkers}</strong></span>
            </div>
            <div class="graph-shell">
              <div class="graph-stage">\${renderGraphCanvas(liveGraph)}</div>
              <div class="summary-lane">\${workers}</div>
            </div>
            <div class="bundles">\${bundles}</div>
          \`;
        }

        function renderCompletedWorkers(workers) {
          if (!workers.length) return '<div class="empty">완료된 worker가 없습니다.</div>';
          return '<div class="worker-grid">' + workers.map((worker) => \`
            <div class="worker">
              <header>
                <strong>\${escapeHtml(worker.title)}</strong>
                <span class="badge ok">\${escapeHtml(worker.status)}</span>
              </header>
              <div class="muted">\${escapeHtml(worker.role)} / \${escapeHtml(worker.phase)}</div>
              <div>\${escapeHtml(worker.summary)}</div>
              <div class="muted">completed \${escapeHtml(worker.completedAt || worker.updatedAt)}</div>
            </div>
          \`).join('') + '</div>';
        }

        function renderHandoffs(handoffs) {
          if (!handoffs.length) return '<div class="empty">No handoffs recorded.</div>';
          return handoffs.map((handoff) => \`
            <div class="item">
              <header>
                <strong>\${escapeHtml(handoff.title)}</strong>
                <span class="badge">\${escapeHtml(handoff.handoffType)}</span>
              </header>
              <div class="muted">\${escapeHtml(handoff.fromWorkerId)} → \${escapeHtml(handoff.toWorkerId)}</div>
              <div>\${escapeHtml(handoff.summary)}</div>
              <div class="muted">\${escapeHtml((handoff.artifactRefs || []).join(', ') || '-')}</div>
            </div>
          \`).join('');
        }

        function renderEvidenceDrawer(evidence, activeTab) {
          if (!evidence) return '<div class="empty">Evidence is unavailable.</div>';
          const tabs = [
            ['events', 'Events'],
            ['browser', 'Browser Evidence'],
            ['findings', 'Review Findings'],
            ['release', 'Release Checks'],
            ['learnings', 'Learnings'],
          ];
          return \`
            <div class="tabs">\${tabs.map(([id, label]) => \`<button type="button" class="tab \${activeTab === id ? 'active' : ''}" data-evidence-tab="\${id}">\${label}</button>\`).join('')}</div>
            \${activeTab === 'events' ? '<div class="list">' + renderEvidenceEvents(evidence.events || []) + '</div>' : ''}
            \${activeTab === 'browser' ? '<div class="list">' + renderBrowserEvidence(evidence.browserEvidence || []) + '</div>' : ''}
            \${activeTab === 'findings' ? '<div class="list">' + renderReviewFindings(evidence.reviewFindings || []) + '</div>' : ''}
            \${activeTab === 'release' ? '<div class="signals">' + renderSignals(evidence.releaseChecks || [], []) + '</div>' : ''}
            \${activeTab === 'learnings' ? '<div class="list">' + renderEvidenceLearnings(evidence.learnings || []) + '</div>' : ''}
          \`;
        }

        function renderPlayback(playback) {
          if (!playback.length) return '<div class="empty">No playback events yet.</div>';
          return playback.slice(-12).reverse().map((entry) => \`
            <div class="item">
              <header>
                <strong>\${escapeHtml(entry.type)}</strong>
                <span class="badge">\${escapeHtml(playbackTime(entry))}</span>
              </header>
              <pre>\${escapeHtml(JSON.stringify(entry, null, 2))}</pre>
            </div>
          \`).join('');
        }

        function renderSignals(checks, signals) {
          const merged = [...checks, ...signals];
          if (!merged.length) return '<div class="empty">No release or quality signals yet.</div>';
          return merged.map((signal) => \`
            <div class="signal">
              <header>
                <strong>\${escapeHtml(signal.code)}</strong>
                <span class="badge \${badgeTone(signal.status)}">\${escapeHtml(signal.status)}</span>
              </header>
              <div>\${escapeHtml(signal.summary)}</div>
              <div class="muted">metric: \${escapeHtml(String(signal.metric))}</div>
            </div>
          \`).join('');
        }

        function renderLearnings(learnings) {
          if (!learnings.length) return '<div class="empty">No learnings captured.</div>';
          return learnings.map((learning) => \`
            <div class="item">
              <header>
                <strong>\${escapeHtml(learning.title)}</strong>
                <span class="badge">\${escapeHtml(learning.kind)}</span>
              </header>
              <div>\${escapeHtml(learning.summary)}</div>
              <div class="muted">\${escapeHtml((learning.tags || []).join(', ') || '-')}</div>
            </div>
          \`).join('');
        }

        function renderRetro(retro) {
          if (!retro) return '<div class="empty">Retro summary unavailable.</div>';
          return \`
            <div class="list">
              <div class="item">
              <header><strong>Retro Summary</strong><span class="badge">\${retro.learningsCount} learnings</span></header>
              <div class="muted">\${retro.completedMissions} / \${retro.missionCount} missions completed</div>
            </div>
            <div class="item">
              <strong>Recommended Focus</strong>
              <div>\${retro.recommendedFocus.map((item) => \`<div class="muted">\${escapeHtml(item)}</div>\`).join('')}</div>
            </div>
          </div>
          \`;
        }

        function renderMissionControls() {
          return \`
            <form id="worker-filter-form" class="learning-form">
              <div class="row">
                <select id="mission-view-mode" name="mode">
                  <option value="live" \${state.missionViewMode === 'live' ? 'selected' : ''}>Live</option>
                  <option value="completed" \${state.missionViewMode === 'completed' ? 'selected' : ''}>Completed</option>
                  <option value="playback" \${state.missionViewMode === 'playback' ? 'selected' : ''}>Playback</option>
                </select>
                <input type="text" name="q" value="\${escapeHtml(state.workerFilters.q)}" placeholder="worker search" />
              </div>
              <div class="row">
                <select id="worker-status-filter" name="status">
                  \${statusOptions(state.workerFilters.status)}
                </select>
                <select id="worker-phase-filter" name="phase">
                  \${phaseOptions(state.workerFilters.phase)}
                </select>
              </div>
              <div class="actions">
                <button type="submit" class="read">필터 적용</button>
                <button type="button" class="ghost mini-action" data-action="save-view">보기 저장</button>
              </div>
            </form>
            <div class="saved-views">\${renderSavedViews(state.savedViews)}</div>
          \`;
        }

        function renderSavedViews(savedViews) {
          if (!savedViews.length) return '<span class="muted">saved views 없음</span>';
          return savedViews.map((view) => \`
            <span>
              <button type="button" data-load-view="\${escapeHtml(view.name)}">\${escapeHtml(view.name)}</button>
              <button type="button" class="dismiss mini-action" data-remove-view="\${escapeHtml(view.name)}">x</button>
            </span>
          \`).join('');
        }

        function renderGraphCanvas(liveGraph) {
          const phases = ['think', 'plan', 'build', 'review', 'qa', 'ship', 'learn'];
          const grouped = phases.map((phase) => ({
            phase,
            workers: liveGraph.visibleWorkers.filter((worker) => worker.phase === phase),
          }));
          const nodeWidth = 160;
          const nodeHeight = 72;
          const laneWidth = 190;
          const laneGap = 24;
          const rowGap = 28;
          const maxRows = Math.max(1, ...grouped.map((lane) => lane.workers.length));
          const width = phases.length * laneWidth + (phases.length - 1) * laneGap;
          const height = 96 + maxRows * (nodeHeight + rowGap);
          const positions = {};

          const nodes = grouped.map((lane, laneIndex) => {
            const x = laneIndex * (laneWidth + laneGap);
            const laneTitle = \`<text x="\${x + 8}" y="20" font-size="14" font-weight="700" fill="#1b2318">\${escapeHtml(lane.phase)}</text>\`;
            const laneNodes = lane.workers.map((worker, rowIndex) => {
              const y = 36 + rowIndex * (nodeHeight + rowGap);
              positions[worker.workerId] = { x, y };
              return \`
                <g>
                  <rect x="\${x}" y="\${y}" rx="16" ry="16" width="\${nodeWidth}" height="\${nodeHeight}" fill="#ffffff" stroke="#d5d7ca"></rect>
                  <text x="\${x + 10}" y="\${y + 20}" font-size="12" font-weight="700" fill="#1b2318">\${escapeHtml(worker.title.slice(0, 20))}</text>
                  <text x="\${x + 10}" y="\${y + 38}" font-size="11" fill="#5d6854">\${escapeHtml(worker.role.slice(0, 22))}</text>
                  <text x="\${x + 10}" y="\${y + 56}" font-size="11" fill="#5d6854">\${escapeHtml(worker.status)}</text>
                </g>
              \`;
            }).join('');
            return laneTitle + laneNodes;
          }).join('');

          const edges = (liveGraph.edges || []).map((edge) => {
            const from = positions[edge.from];
            const to = positions[edge.to];
            if (!from || !to) return '';
            const x1 = from.x + nodeWidth;
            const y1 = from.y + nodeHeight / 2;
            const x2 = to.x;
            const y2 = to.y + nodeHeight / 2;
            return \`<line x1="\${x1}" y1="\${y1}" x2="\${x2}" y2="\${y2}" stroke="#7f8c72" stroke-width="2" marker-end="url(#arrow)"></line>\`;
          }).join('');

          return \`
            <svg viewBox="0 0 \${width} \${height}" role="img" aria-label="mission worker graph canvas">
              <defs>
                <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3.5" orient="auto">
                  <polygon points="0 0, 8 3.5, 0 7" fill="#7f8c72"></polygon>
                </marker>
              </defs>
              \${edges}
              \${nodes}
            </svg>
          \`;
        }

        function renderEvidenceEvents(events) {
          if (!events.length) return '<div class="empty">No evidence events.</div>';
          return events.map((event) => \`
            <div class="item">
              <header>
                <strong>\${escapeHtml(event.commandId)}</strong>
                <span class="badge \${badgeTone(event.status)}">\${escapeHtml(event.status)}</span>
              </header>
              <div>\${escapeHtml(event.reason || '-')}</div>
              <div class="muted">\${escapeHtml(event.createdAt)}</div>
            </div>
          \`).join('');
        }

        function renderBrowserEvidence(items) {
          if (!items.length) return '<div class="empty">No browser evidence.</div>';
          return items.map((item) => \`
            <div class="item">
              <header>
                <strong>\${escapeHtml(item.commandId)}</strong>
                <span class="badge \${badgeTone(item.status)}">\${escapeHtml(item.status)}</span>
              </header>
              <div>\${escapeHtml(item.summary)}</div>
              <div class="muted">\${escapeHtml(item.url || '-')} / \${escapeHtml(item.selector || '-')}</div>
              <div class="muted">\${escapeHtml(item.checkedAt)}</div>
            </div>
          \`).join('');
        }

        function renderReviewFindings(items) {
          if (!items.length) return '<div class="empty">No review findings.</div>';
          return items.map((item) => \`
            <div class="item">
              <header>
                <strong>\${escapeHtml(item.title)}</strong>
                <span class="badge">\${escapeHtml(item.source)}</span>
              </header>
              <div>\${escapeHtml(item.summary)}</div>
              <div class="muted">\${escapeHtml(item.createdAt)}</div>
            </div>
          \`).join('');
        }

        function renderEvidenceLearnings(items) {
          if (!items.length) return '<div class="empty">No evidence learnings.</div>';
          return items.map((item) => \`
            <div class="item">
              <header>
                <strong>\${escapeHtml(item.title)}</strong>
                <span class="badge">\${escapeHtml(item.kind)}</span>
              </header>
              <div>\${escapeHtml(item.summary)}</div>
              <div class="muted">\${escapeHtml(item.createdAt)}</div>
            </div>
          \`).join('');
        }

        function metric(label, value) {
          return \`<article class="metric"><div class="label">\${escapeHtml(label)}</div><div class="value">\${escapeHtml(String(value))}</div></article>\`;
        }

        function renderCommandAction(command, action, label) {
          if (action === 'approve' && command.action !== 'deploy_live') {
            return '';
          }
          if (['completed', 'cancelled'].includes(command.status) && ['approve', 'retry'].includes(action)) {
            return '';
          }
          if (command.status === 'cancelled' && ['reject', 'cancel'].includes(action)) {
            return '';
          }
          return \`<button class="\${action === 'cancel' || action === 'reject' ? 'dismiss' : 'read'}" data-command-action="\${action}" data-id="\${escapeHtml(command.commandId)}">\${label}</button>\`;
        }

        function badgeTone(status) {
          if (['failed', 'blocked', 'danger', 'high', 'fail'].includes(status)) return 'danger';
          if (['queued', 'warn', 'waiting_approval', 'medium'].includes(status)) return 'warn';
          return 'ok';
        }

        function playbackTime(entry) {
          if (entry.graph?.mission?.updatedAt) return entry.graph.mission.updatedAt;
          if (entry.worker?.updatedAt) return entry.worker.updatedAt;
          if (entry.handoff?.createdAt) return entry.handoff.createdAt;
          if (entry.edge?.createdAt) return entry.edge.createdAt;
          return 'n/a';
        }

        function applyWorkerFilters(workers) {
          return (workers || []).filter((worker) => {
            if (state.workerFilters.status && worker.status !== state.workerFilters.status) {
              return false;
            }
            if (state.workerFilters.phase && worker.phase !== state.workerFilters.phase) {
              return false;
            }
            if (state.workerFilters.q) {
              const haystack = [worker.workerId, worker.role, worker.title, worker.summary, worker.blockerReason || ''].join(' ').toLowerCase();
              return haystack.includes(state.workerFilters.q.toLowerCase());
            }
            return true;
          });
        }

        function statusOptions(selected) {
          const values = ['', 'created', 'running', 'blocked', 'waiting_approval', 'retrying', 'completed', 'failed', 'cancelled'];
          return values.map((value) => \`<option value="\${value}" \${selected === value ? 'selected' : ''}>\${value || 'all status'}</option>\`).join('');
        }

        function phaseOptions(selected) {
          const values = ['', 'think', 'plan', 'build', 'review', 'qa', 'ship', 'learn'];
          return values.map((value) => \`<option value="\${value}" \${selected === value ? 'selected' : ''}>\${value || 'all phase'}</option>\`).join('');
        }

        function loadSavedViews() {
          try {
            const raw = window.localStorage.getItem('control-plane-saved-views');
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        }

        function persistSavedViews(savedViews) {
          window.localStorage.setItem('control-plane-saved-views', JSON.stringify(savedViews));
        }

        function upsertSavedView(savedViews, nextView) {
          const filtered = savedViews.filter((item) => item.name !== nextView.name);
          filtered.unshift(nextView);
          return filtered.slice(0, 8);
        }

        async function fetchJson(url) {
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(url + ' -> ' + response.status);
          }
          return response.json();
        }

        async function postJson(url, body) {
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (!response.ok) {
            throw new Error(url + ' -> ' + response.status);
          }
          if (response.status === 204) {
            return null;
          }
          return response.json();
        }

        async function deleteRequest(url) {
          const response = await fetch(url, { method: 'DELETE' });
          if (!response.ok) {
            throw new Error(url + ' -> ' + response.status);
          }
        }

        function escapeHtml(value) {
          return String(value).replace(/[&<>"']/g, (char) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
          })[char] || char);
        }

        render();
        refreshAll().catch((error) => console.error(error));
        refreshTimer = setInterval(() => refreshAll().catch((error) => console.error(error)), 10000);
        window.addEventListener('beforeunload', () => {
          clearInterval(refreshTimer);
          closeMissionSocket();
        });
      </script>
    </body>
  </html>`;
}
