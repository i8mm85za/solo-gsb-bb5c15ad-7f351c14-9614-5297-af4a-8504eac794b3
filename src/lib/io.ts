/**
 * JSON 导入 / 导出：文件格式 v1。
 *
 * 新格式（导出）：
 * {
 *   "version": 1,
 *   "exportedAt": "...",        // 可选
 *   "nodes": [{
 *     "id", "type", "label", "duration", "delay",
 *     "resources": ["追光1", "麦克风A"],  // 资源名数组，可多选；空数组 = 不占用
 *     "position": {x, y}
 *   }],
 *   "edges": [{ "id", "source", "target" }]
 * }
 *
 * 旧格式（导入兼容）：节点上为单个 "resource": "追光1" 字符串字段
 * （缺省 / null / 空串表示不占用）；若新旧字段同时存在则合并去重。
 */
import { CUE_TYPES, type CueType } from '../types';
import { nodeResources, normalizeResources, wouldCreateCycleWithResources } from './schedule';

export const SHOW_FILE_VERSION = 1;

export interface ImportedNode {
  id: string;
  cueType: CueType;
  label: string;
  duration: number;
  delay: number;
  /** 占用的资源名列表（已去重；空数组表示不占用资源） */
  resources: string[];
  position: { x: number; y: number };
}

export interface ImportedEdge {
  id: string;
  source: string;
  target: string;
}

export function serializeShow(
  nodes: Array<{
    id: string;
    position: { x: number; y: number };
    data: {
      label: string;
      cueType: CueType;
      duration: number;
      delay: number;
      resources?: string[];
      /** 旧字段仅在兼容读取时可能出现，导出统一写 resources 数组 */
      resource?: string;
    };
  }>,
  edges: Array<{ id: string; source: string; target: string }>,
): string {
  const file = {
    version: SHOW_FILE_VERSION,
    exportedAt: new Date().toISOString(),
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.data.cueType,
      label: n.data.label,
      duration: n.data.duration,
      delay: n.data.delay,
      // 导出统一改用 resources 数组（空数组表示不占用资源）
      resources: nodeResources(n.data),
      position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
    })),
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
  };
  return JSON.stringify(file, null, 2);
}

export type ParseResult =
  | { ok: true; nodes: ImportedNode[]; edges: ImportedEdge[] }
  | { ok: false; error: string };

function fail(error: string): ParseResult {
  return { ok: false, error };
}

/**
 * 读取节点的资源列表：新字段 resources（字符串数组）与旧字段
 * resource（单个字符串，含缺省 / null / 空串）合并后去重。
 * 类型校验由 parseShow 在调用前完成。
 */
function parseNodeResources(n: Record<string, unknown>): string[] {
  return normalizeResources([
    ...normalizeResources(n.resources),
    ...nodeResources({ resource: n.resource }),
  ]);
}

export function parseShow(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail('文件不是有效的 JSON');
  }
  if (typeof raw !== 'object' || raw === null) return fail('JSON 顶层必须是对象');
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.nodes) || !Array.isArray(obj.edges)) {
    return fail('缺少 nodes / edges 数组');
  }

  const ids = new Set<string>();
  const nodes: ImportedNode[] = [];
  for (const [i, item] of (obj.nodes as unknown[]).entries()) {
    const where = `第 ${i + 1} 个节点`;
    if (typeof item !== 'object' || item === null) return fail(`${where}格式无效`);
    const n = item as Record<string, unknown>;
    if (typeof n.id !== 'string' || n.id.trim() === '') return fail(`${where}缺少有效 id`);
    if (ids.has(n.id)) return fail(`节点 id 重复：${n.id}`);
    ids.add(n.id);
    if (!CUE_TYPES.includes(n.type as CueType)) {
      return fail(`${where}（${n.id}）类型无效，应为 lighting / sound / actor`);
    }
    const duration = Number(n.duration);
    const delay = Number(n.delay ?? 0);
    if (!Number.isFinite(duration) || duration < 0) return fail(`${where}（${n.id}）持续时间无效`);
    if (!Number.isFinite(delay) || delay < 0) return fail(`${where}（${n.id}）延迟无效`);
    // resources 必须是字符串数组（空串项忽略）；旧版 resource 字符串字段合并兼容
    if (n.resources !== undefined && n.resources !== null) {
      if (!Array.isArray(n.resources) || n.resources.some((r) => typeof r !== 'string')) {
        return fail(`${where}（${n.id}）resources 必须是字符串数组`);
      }
    }
    if (
      n.resource !== undefined &&
      n.resource !== null &&
      typeof n.resource !== 'string'
    ) {
      return fail(`${where}（${n.id}）resource 必须是字符串`);
    }
    const resources = parseNodeResources(n);
    const pos = (typeof n.position === 'object' && n.position !== null ? n.position : {}) as Record<string, unknown>;
    const px = Number(pos.x);
    const py = Number(pos.y);
    nodes.push({
      id: n.id,
      cueType: n.type as CueType,
      label: typeof n.label === 'string' && n.label.trim() !== '' ? n.label : n.id,
      duration,
      delay,
      resources,
      position: {
        x: Number.isFinite(px) ? px : 80 + (i % 4) * 280,
        y: Number.isFinite(py) ? py : 80 + Math.floor(i / 4) * 120,
      },
    });
  }

  const edgeIds = new Set<string>();
  const edges: ImportedEdge[] = [];
  for (const [i, item] of (obj.edges as unknown[]).entries()) {
    const where = `第 ${i + 1} 条连线`;
    if (typeof item !== 'object' || item === null) return fail(`${where}格式无效`);
    const e = item as Record<string, unknown>;
    if (typeof e.source !== 'string' || typeof e.target !== 'string') {
      return fail(`${where}缺少 source / target`);
    }
    if (!ids.has(e.source) || !ids.has(e.target)) {
      return fail(`${where}（${e.source} → ${e.target}）引用了不存在的节点`);
    }
    // 逐条校验：显式依赖与「按节点顺序的资源串行（含多项资源）」共同构成的约束图必须无环
    const schedNodes = nodes.map((n) => ({
      id: n.id,
      data: { duration: n.duration, delay: n.delay, resources: n.resources, label: n.label },
    }));
    if (wouldCreateCycleWithResources(schedNodes, edges, e.source, e.target)) {
      return fail(
        `连线 ${e.source} → ${e.target} 会与依赖 / 资源串行顺序形成环路，已拒绝导入`,
      );
    }
    const id = typeof e.id === 'string' && e.id !== '' ? e.id : `e-${e.source}-${e.target}-${i}`;
    if (edgeIds.has(id)) return fail(`连线 id 重复：${id}`);
    edgeIds.add(id);
    edges.push({ id, source: e.source, target: e.target });
  }

  return { ok: true, nodes, edges };
}
