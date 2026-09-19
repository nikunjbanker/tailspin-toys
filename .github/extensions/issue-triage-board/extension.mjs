import { createServer } from "node:http";
import { joinSession, createCanvas } from "@github/copilot-sdk/extension";

const repository = "nikunjbanker/tailspin-toys";
const servers = new Map();
const issueCache = new Map();

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function issueDescription(issue) {
    const body = (issue.body ?? "").replace(/\s+/g, " ").trim();
    return body || "No description provided.";
}

function scoreIssue(issue) {
    const ageDays = Math.max(0, (Date.now() - Date.parse(issue.created_at)) / 86400000);
    const updatedDays = Math.max(0, (Date.now() - Date.parse(issue.updated_at)) / 86400000);
    const labels = issue.labels.map((label) => label.name.toLowerCase());
    let score = 0;
    const reasons = [];

    if (labels.some((label) => /bug|blocker|critical|security|regression/.test(label))) {
        score += 8;
        reasons.push("has a high-signal bug or risk label");
    }
    if (labels.some((label) => /help wanted|good first issue|needs triage/.test(label))) {
        score += 3;
        reasons.push("is explicitly marked for triage or contribution");
    }
    if (issue.comments > 0) {
        score += Math.min(issue.comments, 6);
        reasons.push(`${issue.comments} comment${issue.comments === 1 ? "" : "s"} indicate active discussion`);
    }
    if (updatedDays <= 14) {
        score += 4;
        reasons.push("was updated recently");
    } else if (updatedDays > 90 && ageDays > 90) {
        score += 2;
        reasons.push("is aging without resolution");
    }
    if (issue.assignee) {
        score += 1;
        reasons.push(`is assigned to ${issue.assignee.login}`);
    }

    if (reasons.length === 0) reasons.push("is an open issue with no stronger urgency signal");
    return { score, reasons };
}

async function fetchIssues() {
    const response = await fetch(`https://api.github.com/repos/${repository}/issues?state=open&per_page=100`, {
        headers: { Accept: "application/vnd.github+json", "User-Agent": "issue-triage-board-canvas" },
    });
    if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
    return (await response.json())
        .filter((issue) => !issue.pull_request)
        .map((issue) => {
            const ranking = scoreIssue(issue);
            return {
                number: issue.number,
                title: issue.title,
                url: issue.html_url,
                body: issueDescription(issue),
                labels: issue.labels.map((label) => label.name),
                comments: issue.comments,
                updatedAt: issue.updated_at,
                score: ranking.score,
                justification: ranking.reasons.join(", "),
            };
        })
        .sort((a, b) => b.score - a.score || Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

function formatDate(value) {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

function renderCard(issue, featured) {
    const labels = issue.labels.map((label) => `<span class="label">${escapeHtml(label)}</span>`).join("");
    return `<article class="card ${featured ? "featured" : ""}">
      <div class="card-header"><span class="issue-number">#${issue.number}</span><span class="score">Priority ${issue.score}</span></div>
      <h3><a href="${escapeHtml(issue.url)}" target="_blank" rel="noreferrer">${escapeHtml(issue.title)}</a></h3>
      <p>${escapeHtml(issue.body)}</p>
      <div class="labels">${labels || '<span class="muted">No labels</span>'}</div>
      ${featured ? `<p class="why"><strong>Why it is here:</strong> ${escapeHtml(issue.justification)}.</p>` : ""}
      <div class="card-footer"><span class="muted">Updated ${escapeHtml(formatDate(issue.updatedAt))} · ${issue.comments} comments</span><button data-issue="${issue.number}">Add to current context</button></div>
    </article>`;
}

function renderHtml(instanceId, initialIssues = [], error = "") {
    const top = initialIssues.slice(0, 3);
    const remainder = initialIssues.slice(3);
    return `<!doctype html>
<html data-color-mode="light">
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Issue triage board</title>
  <style>
    :root { color-scheme: light dark; }
    * { box-sizing: border-box; } body { margin: 0; padding: 24px; background: var(--background-color-default, #fff); color: var(--text-color-default, #1f2328); font: 14px/1.5 var(--font-sans, system-ui, sans-serif); }
    h1 { margin: 0 0 6px; font-size: 24px; } h2 { margin: 28px 0 12px; font-size: 16px; } h3 { margin: 8px 0; font-size: 16px; line-height: 1.3; }
    h3 a { color: var(--text-color-default, #1f2328); text-decoration: none; } h3 a:hover { text-decoration: underline; }
    .intro, .muted { color: var(--text-color-muted, #656d76); } .intro { margin: 0; } .error { padding: 12px; border: 1px solid var(--true-color-red, #cf222e); border-radius: 8px; color: var(--true-color-red, #cf222e); }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; } .card { display: flex; flex-direction: column; gap: 2px; padding: 16px; border: 1px solid var(--border-color-default, #d0d7de); border-radius: 10px; min-height: 220px; }
    .featured { border-color: var(--true-color-blue, #0969da); box-shadow: 0 0 0 1px var(--true-color-blue-muted, #ddf4ff); } .card-header, .card-footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; } .issue-number, .score { font-weight: 600; } .score { color: var(--true-color-blue, #0969da); font-size: 12px; }
    .card p { margin: 4px 0; } .labels { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 5px; } .label { padding: 2px 7px; border-radius: 999px; background: var(--true-color-blue-muted, #ddf4ff); color: var(--true-color-blue, #0969da); font-size: 12px; }
    .why { padding: 8px; border-left: 3px solid var(--true-color-blue, #0969da); background: var(--background-color-secondary, #f6f8fa); font-size: 13px; } .card-footer { margin-top: auto; padding-top: 12px; font-size: 12px; }
    button { border: 1px solid var(--true-color-blue, #0969da); border-radius: 6px; padding: 6px 9px; background: var(--true-color-blue, #0969da); color: var(--color-white, #fff); cursor: pointer; font: inherit; font-size: 12px; } button:disabled { opacity: .6; cursor: wait; } .toast { position: fixed; right: 20px; bottom: 20px; padding: 10px 14px; border-radius: 8px; background: var(--text-color-default, #1f2328); color: var(--background-color-default, #fff); }
  </style></head>
  <body data-instance="${escapeHtml(instanceId)}">
    <h1>Issue triage board</h1><p class="intro">Open issues ranked by signals that suggest they need attention now.</p>
    ${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}
    ${top.length ? `<h2>Top three to review now</h2><section class="grid">${top.map((issue) => renderCard(issue, true)).join("")}</section>` : '<p class="muted">No open issues found.</p>'}
    ${remainder.length ? `<h2>Remaining open issues</h2><section class="grid">${remainder.map((issue) => renderCard(issue, false)).join("")}</section>` : ""}
    <script>
      document.querySelectorAll("button[data-issue]").forEach((button) => button.addEventListener("click", async () => {
        button.disabled = true;
        const response = await fetch("/api/add-context", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ number: button.dataset.issue }) });
        const result = await response.json();
        button.disabled = false;
        const toast = document.createElement("div"); toast.className = "toast"; toast.textContent = result.message || result.error || "Done"; document.body.append(toast); setTimeout(() => toast.remove(), 3500);
      }));
    </script>
  </body>
</html>`;
}

async function startServer(instanceId) {
    const server = createServer((req, res) => {
        if (req.method === "GET" && req.url === "/") {
            const cached = issueCache.get(instanceId);
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.end(renderHtml(instanceId, cached?.issues ?? [], cached?.error ?? ""));
            return;
        }
        if (req.method === "POST" && req.url === "/api/add-context") {
            let body = "";
            req.on("data", (chunk) => { body += chunk; });
            req.on("end", async () => {
                try {
                    const { number } = JSON.parse(body);
                    const issue = issueCache.get(instanceId)?.issues.find((item) => String(item.number) === String(number));
                    if (!issue) throw new Error("Issue is no longer available on this board.");
                    await session.send(`Add GitHub issue #${issue.number} to the current context. Title: ${issue.title}. URL: ${issue.url}. Description: ${issue.body}`);
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ message: `Issue #${issue.number} added to the current context.` }));
                } catch (error) {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Unable to add issue to context." }));
                }
            });
            return;
        }
        res.writeHead(404);
        res.end("Not found");
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    return { server, url: `http://127.0.0.1:${port}/` };
}

const session = await joinSession({
    canvases: [
        createCanvas({
            id: "issue-triage-board",
            displayName: "Issue triage board",
            description: "Kanban board that ranks open repository issues and adds selected issues to the current session context.",
            actions: [{
                name: "refresh",
                description: "Refresh the issue ranking and return the current top three issues.",
                handler: async (ctx) => {
                    const issues = await fetchIssues();
                    issueCache.set(ctx.instanceId, { issues });
                    return { topIssues: issues.slice(0, 3).map(({ number, title, score }) => ({ number, title, score })) };
                },
            }],
            open: async (ctx) => {
                let entry = servers.get(ctx.instanceId);
                if (!entry) {
                    entry = await startServer(ctx.instanceId);
                    servers.set(ctx.instanceId, entry);
                }
                try {
                    issueCache.set(ctx.instanceId, { issues: await fetchIssues() });
                } catch (error) {
                    issueCache.set(ctx.instanceId, { issues: [], error: error instanceof Error ? error.message : "Unable to load GitHub issues." });
                }
                return { title: "Issue triage board", url: entry.url };
            },
            onClose: async (ctx) => {
                const entry = servers.get(ctx.instanceId);
                if (entry) {
                    servers.delete(ctx.instanceId);
                    issueCache.delete(ctx.instanceId);
                    await new Promise((resolve) => entry.server.close(() => resolve()));
                }
            },
        }),
    ],
});
