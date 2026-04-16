export interface GithubLabel {
  name: string;
}

export interface GithubIssueMilestone {
  number: number;
  title: string;
}

export interface GithubIssueAssignee {
  login: string;
}

export interface GithubIssue {
  node_id?: string;
  number: number;
  title: string;
  body?: string | null;
  state: string;
  html_url: string;
  labels: GithubLabel[];
  assignees: GithubIssueAssignee[];
  milestone?: GithubIssueMilestone | null;
  created_at?: string | null;
  updated_at?: string | null;
  closed_at?: string | null;
  pull_request?: Record<string, unknown> | null;
}

export interface GithubMilestone {
  number: number;
  title: string;
  description?: string | null;
  state: string;
  due_on?: string | null;
  html_url?: string | null;
  open_issues: number;
  closed_issues: number;
  updated_at?: string | null;
}

export class GithubApiClient {
  constructor(private readonly token: string) {}

  async getIssues(repo: string): Promise<GithubIssue[]> {
    let page = 1;
    const issues: GithubIssue[] = [];
    while (true) {
      const batch = await this.getJson<GithubIssue[]>(
        `https://api.github.com/repos/${repo}/issues?state=all&per_page=100&page=${page}`,
      );
      issues.push(...batch.filter((issue) => !issue.pull_request));
      if (batch.length < 100) break;
      page += 1;
    }
    return issues;
  }

  async getMilestones(repo: string): Promise<GithubMilestone[]> {
    return this.getJson<GithubMilestone[]>(
      `https://api.github.com/repos/${repo}/milestones?state=all&per_page=100`,
    );
  }

  async createIssue(
    repo: string,
    payload: { title: string; body?: string; labels?: string[]; milestone?: number },
  ): Promise<GithubIssue> {
    return this.sendJson<GithubIssue>(`https://api.github.com/repos/${repo}/issues`, "POST", payload);
  }

  private async getJson<T>(url: string): Promise<T> {
    return this.sendJson<T>(url, "GET");
  }

  private async sendJson<T>(url: string, method: string, body?: unknown): Promise<T> {
    const response = await fetch(url, {
      method,
      headers: {
        authorization: `Bearer ${this.token.trim()}`,
        accept: "application/vnd.github+json",
        "user-agent": "TeamForge",
        "x-github-api-version": "2022-11-28",
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`GitHub returned ${response.status}: ${text.slice(0, 500)}`);
    }
    return JSON.parse(text) as T;
  }
}
