/**
 * Minimal Huly REST client — mirrors the Rust HulyClient.
 * Uses the same connect → selectWorkspace → transactor pattern.
 */

const DEFAULT_BASE = "https://huly.app";

function currentMillis() {
  return Date.now();
}

let _counter = 0;
const _randomSeg = Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0") +
  Math.floor(Math.random() * 0xffff).toString(16).padStart(4, "0");

export function generateHulyId() {
  const secs = Math.floor(Date.now() / 1000).toString(16).padStart(8, "0");
  const count = (_counter++ & 0xffffff).toString(16).padStart(6, "0");
  return `${secs}${_randomSeg}${count}`;
}

export class HulyClient {
  constructor({ endpoint, workspaceId, token }) {
    this.endpoint = endpoint;
    this.workspaceId = workspaceId;
    this.token = token;
  }

  static async connect(userToken, baseUrl = DEFAULT_BASE) {
    // 1. Fetch config
    const config = await fetch(`${baseUrl}/config.json`).then((r) => r.json());
    const accountsUrl = config.ACCOUNTS_URL ?? "https://accounts.huly.app";

    // 2. Extract workspace from JWT
    const payload = JSON.parse(Buffer.from(userToken.split(".")[1], "base64url").toString());
    const workspaceSlug = payload.workspace;
    if (!workspaceSlug) throw new Error("Could not extract workspace from JWT");

    // 3. selectWorkspace RPC
    const rpc = await fetch(accountsUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${userToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ method: "selectWorkspace", params: { workspaceUrl: workspaceSlug, kind: "external" } }),
    }).then((r) => r.json());

    if (rpc.error) throw new Error(`selectWorkspace error: ${JSON.stringify(rpc.error)}`);
    const info = rpc.result;

    const endpoint = info.endpoint.replace("wss://", "https://").replace("ws://", "http://");
    console.log(`[huly] connected: endpoint=${endpoint} workspace=${info.workspace}`);

    return new HulyClient({ endpoint, workspaceId: info.workspace, token: info.token });
  }

  get _headers() {
    return { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" };
  }

  async findAll(cls, query = {}, limit = 500) {
    const url = `${this.endpoint}/api/v1/find-all/${this.workspaceId}`;
    const qs = new URLSearchParams({
      class: cls,
      query: JSON.stringify(query),
      options: JSON.stringify({ limit }),
    });
    const res = await fetch(`${url}?${qs}`, { headers: this._headers });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`findAll ${cls} → ${res.status}: ${text.slice(0, 300)}`);
    }
    const data = await res.json();
    return Array.isArray(data) ? data : (data.value ?? []);
  }

  async postTx(tx) {
    const url = `${this.endpoint}/api/v1/tx/${this.workspaceId}`;
    const res = await fetch(url, {
      method: "POST",
      headers: this._headers,
      body: JSON.stringify(tx),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`tx → ${res.status}: ${text.slice(0, 500)}`);
    }
    return res.json();
  }

  async createDoc(actorSocialId, cls, space, attributes, objectId) {
    const id = objectId ?? generateHulyId();
    await this.postTx({
      _id: generateHulyId(),
      _class: "core:class:TxCreateDoc",
      space: "core:space:Tx",
      objectId: id,
      objectClass: cls,
      objectSpace: space,
      modifiedOn: currentMillis(),
      modifiedBy: actorSocialId,
      createdBy: actorSocialId,
      attributes,
    });
    return id;
  }

  async updateDoc(actorSocialId, cls, space, objectId, operations) {
    return this.postTx({
      _id: generateHulyId(),
      _class: "core:class:TxUpdateDoc",
      space: "core:space:Tx",
      modifiedBy: actorSocialId,
      modifiedOn: currentMillis(),
      objectId,
      objectClass: cls,
      objectSpace: space,
      operations,
    });
  }

  async removeDoc(actorSocialId, cls, space, objectId) {
    return this.postTx({
      _id: generateHulyId(),
      _class: "core:class:TxRemoveDoc",
      space: "core:space:Tx",
      modifiedBy: actorSocialId,
      modifiedOn: currentMillis(),
      objectId,
      objectClass: cls,
      objectSpace: space,
    });
  }

  async getAccountInfo() {
    const res = await fetch(`${this.endpoint}/api/v1/account/${this.workspaceId}`, { headers: this._headers });
    if (!res.ok) throw new Error(`account info → ${res.status}`);
    return res.json();
  }
}
