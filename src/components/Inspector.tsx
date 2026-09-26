import { useEffect, useState } from 'react';
import { CUE_TYPE_META, CUE_TYPES, type CueNodeData, type CueType } from '../types';
import type { NodeSchedule } from '../lib/schedule';
import type { CueFlowNode } from './CueNode';

interface InspectorProps {
  node: CueFlowNode | null;
  schedule: NodeSchedule | null;
  /** 画布中已使用的资源名，供多选与录入联想 */
  resourceOptions: string[];
  onChange: (id: string, patch: Partial<CueNodeData>) => void;
  onDelete: (id: string) => void;
}

function fmt(v: number): string {
  return `${Number(v.toFixed(1))}s`;
}

/** 右侧属性面板：编辑选中节点的名称 / 类型 / 持续时间 / 相对延迟 / 占用资源（多选） */
export function Inspector({ node, schedule, resourceOptions, onChange, onDelete }: InspectorProps) {
  /** 新资源录入草稿；切换节点时清空 */
  const [draft, setDraft] = useState('');
  const nodeId = node?.id ?? null;
  useEffect(() => {
    setDraft('');
  }, [nodeId]);

  if (!node) {
    return (
      <section className="inspector">
        <h2 className="panel-title">节点属性</h2>
        <p className="panel-empty">
          在画布中点击节点进行编辑；拖动节点右下角手柄到另一节点即可建立依赖。
          在「占用资源」中可勾选已有资源或录入新资源（如追光1、麦克风A），
          同一资源上的提示会自动串行；同时占用多项资源的提示须等全部资源释放后才触发。
        </p>
      </section>
    );
  }

  const d = node.data;
  const resources = d.resources;
  const num = (v: string, fallback: number): number => {
    const n = parseFloat(v);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };

  const setResources = (next: string[]) => onChange(node.id, { resources: next });

  /** 勾选 / 取消勾选一个已有资源（成环的修改会被上层拒绝并保留原值） */
  const toggleResource = (name: string) => {
    if (resources.includes(name)) setResources(resources.filter((r) => r !== name));
    else setResources([...resources, name]);
  };

  /** 录入新资源：去空白、去重后追加；已在列表中则仅清空草稿 */
  const addDraft = () => {
    const name = draft.trim();
    if (!name) return;
    if (!resources.includes(name)) setResources([...resources, name]);
    setDraft('');
  };

  return (
    <section className="inspector">
      <h2 className="panel-title">
        节点属性
        {schedule?.critical ? <span className="badge badge-critical">关键路径</span> : null}
      </h2>

      <label className="field">
        <span>名称</span>
        <input
          type="text"
          value={d.label}
          onChange={(e) => onChange(node.id, { label: e.target.value })}
        />
      </label>

      <label className="field">
        <span>类型</span>
        <select
          value={d.cueType}
          onChange={(e) => onChange(node.id, { cueType: e.target.value as CueType })}
        >
          {CUE_TYPES.map((t) => (
            <option key={t} value={t}>
              {CUE_TYPE_META[t].icon} {CUE_TYPE_META[t].label}
            </option>
          ))}
        </select>
      </label>

      <div className="field-row">
        <label className="field">
          <span>持续时间（秒）</span>
          <input
            type="number"
            min={0}
            step={0.5}
            value={d.duration}
            onChange={(e) => onChange(node.id, { duration: num(e.target.value, d.duration) })}
          />
        </label>
        <label className="field">
          <span>相对延迟（秒）</span>
          <input
            type="number"
            min={0}
            step={0.5}
            value={d.delay}
            onChange={(e) => onChange(node.id, { delay: num(e.target.value, d.delay) })}
          />
        </label>
      </div>

      <div className="field">
        <span>占用资源（可多选，不选表示不占用）</span>
        <div className="res-chips">
          {resources.length === 0 ? (
            <span className="res-chips-empty">未占用资源</span>
          ) : (
            resources.map((r) => (
              <span className="res-chip" key={r} title={`占用资源：${r}`}>
                🎚 {r}
                <button
                  type="button"
                  className="res-chip-x"
                  title={`移除资源 ${r}`}
                  onClick={() => setResources(resources.filter((x) => x !== r))}
                >
                  ✕
                </button>
              </span>
            ))
          )}
        </div>
        {resourceOptions.length > 0 ? (
          <div className="res-pick-list">
            {resourceOptions.map((r) => (
              <label className="res-pick-item" key={r}>
                <input
                  type="checkbox"
                  checked={resources.includes(r)}
                  onChange={() => toggleResource(r)}
                />
                <span>🎚 {r}</span>
              </label>
            ))}
          </div>
        ) : null}
        <div className="res-add-row">
          <input
            type="text"
            list="cue-resource-list"
            placeholder="录入新资源名，回车添加"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addDraft();
              }
            }}
          />
          <button type="button" className="btn" onClick={addDraft} disabled={draft.trim() === ''}>
            ＋ 添加
          </button>
          <datalist id="cue-resource-list">
            {resourceOptions.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </div>
      </div>

      {schedule ? (
        <dl className="computed">
          <div>
            <dt>最早触发</dt>
            <dd>{fmt(schedule.earliestStart)}</dd>
          </div>
          <div>
            <dt>最早结束</dt>
            <dd>{fmt(schedule.earliestEnd)}</dd>
          </div>
          <div>
            <dt>最晚触发</dt>
            <dd>{fmt(schedule.latestStart)}</dd>
          </div>
          <div>
            <dt>松弛时间</dt>
            <dd className={schedule.critical ? 'critical-text' : ''}>{fmt(schedule.slack)}</dd>
          </div>
        </dl>
      ) : null}

      <button className="btn btn-danger btn-block" onClick={() => onDelete(node.id)}>
        删除节点（或按 Delete 键）
      </button>
    </section>
  );
}
