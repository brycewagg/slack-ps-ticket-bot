// Thin Jira REST v3 client. Basic auth with email + API token.

interface JiraEnv {
  baseUrl: string;
  email: string;
  token: string;
}

function authHeader(env: JiraEnv): string {
  return "Basic " + btoa(`${env.email}:${env.token}`);
}

function buildEnv(env: Record<string, string>): JiraEnv {
  return {
    baseUrl: env.JIRA_BASE_URL,
    email: env.JIRA_EMAIL,
    token: env.JIRA_API_TOKEN,
  };
}

async function jiraFetch(
  env: Record<string, string>,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const j = buildEnv(env);
  return await fetch(`${j.baseUrl}${path}`, {
    ...init,
    headers: {
      "Authorization": authHeader(j),
      "Accept": "application/json",
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

export async function issueExists(
  env: Record<string, string>,
  key: string,
): Promise<boolean> {
  const res = await jiraFetch(env, `/rest/api/3/issue/${key}?fields=summary`);
  return res.ok;
}

export async function createIssue(
  env: Record<string, string>,
  args: { projectKey: string; issueTypeId: string; summary: string; descriptionText: string },
): Promise<{ key: string; id: string }> {
  const body = {
    fields: {
      project: { key: args.projectKey },
      summary: args.summary,
      issuetype: { id: args.issueTypeId },
      description: {
        type: "doc",
        version: 1,
        content: [{
          type: "paragraph",
          content: [{ type: "text", text: args.descriptionText }],
        }],
      },
    },
  };
  const res = await jiraFetch(env, `/rest/api/3/issue`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Jira createIssue failed (${res.status}): ${await res.text()}`);
  }
  return await res.json();
}

export async function addRemoteSlackLink(
  env: Record<string, string>,
  key: string,
  args: { url: string; title: string },
): Promise<void> {
  const body = {
    object: {
      url: args.url,
      title: args.title,
      icon: { url16x16: "https://slack.com/favicon.ico", title: "Slack" },
    },
  };
  const res = await jiraFetch(env, `/rest/api/3/issue/${key}/remotelink`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Jira addRemoteLink failed (${res.status}): ${await res.text()}`);
  }
}

export async function addComment(
  env: Record<string, string>,
  key: string,
  text: string,
): Promise<void> {
  const body = {
    body: {
      type: "doc",
      version: 1,
      content: [{
        type: "paragraph",
        content: [{ type: "text", text }],
      }],
    },
  };
  const res = await jiraFetch(env, `/rest/api/3/issue/${key}/comment`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Jira addComment failed (${res.status}): ${await res.text()}`);
  }
}

export async function createIssueWithFields(
  env: Record<string, string>,
  fields: Record<string, unknown>,
): Promise<{ key: string; id: string }> {
  const res = await jiraFetch(env, `/rest/api/3/issue`, {
    method: "POST",
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) {
    throw new Error(`Jira createIssueWithFields failed (${res.status}): ${await res.text()}`);
  }
  return await res.json();
}

export async function transitionIssue(
  env: Record<string, string>,
  key: string,
  transitionName: string,
): Promise<{ transitioned: boolean; reason?: string }> {
  const tRes = await jiraFetch(env, `/rest/api/3/issue/${key}/transitions`);
  if (!tRes.ok) {
    return { transitioned: false, reason: `lookup failed (${tRes.status})` };
  }
  const { transitions } = await tRes.json() as {
    transitions: Array<{ id: string; name: string; to: { name: string } }>;
  };
  // Prefer exact name match (more predictable; avoids ambiguity with screened
  // transitions like "Resolve Issue" that share a destination status). Only
  // fall back to destination-status match if the name match misses.
  const want = transitionName.toLowerCase();
  const match =
    transitions.find((t) => t.name.toLowerCase() === want) ??
    transitions.find((t) => t.to.name.toLowerCase() === want);
  if (!match) {
    return {
      transitioned: false,
      reason: `no transition named "${transitionName}" available from current status`,
    };
  }
  const doRes = await jiraFetch(env, `/rest/api/3/issue/${key}/transitions`, {
    method: "POST",
    body: JSON.stringify({ transition: { id: match.id } }),
  });
  if (!doRes.ok) {
    return { transitioned: false, reason: `transition POST failed (${doRes.status})` };
  }
  return { transitioned: true };
}
