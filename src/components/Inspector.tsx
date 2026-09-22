import { useEffect, useState } from 'react';
import { CUE_TYPE_META, CUE_TYPES, type CueNodeData, type CueType } from '../types';
import type { NodeSchedule } from '../lib/schedule';
import type { CueFlowNode } from './CueNode';

interface InspectorProps {
  node: CueFlowNode | null;
  schedule: NodeSchedule | null;
  /** 画布中已使用的资源名（去重），用于多选与联想 */
  resourceOptions: string[];
  onChange: (id: string, patch: Partial<CueNodeData>) => void;
  onDelete: (id: string) => void;
}

function fmt(v: number): string {
  return `${Number(v.toFixed(1))}s`;
}

/** 输入中的分隔符：回车 / 逗号（中英文）/ 顿号 / 分号，均用于一次录入多个新资源 */
const RESOURCE_DELIMITERS = /[,，、;；\n]/;

/** 右侧属性面板：编辑选中节点的名称 / 类型 / 持续时间 / 相对延迟 / 占用资源（可多选） */
export function Inspector({ node, schedule, resourceOptions, onChange, onDelete }: InspectorProps) {
  // 新资源录入草稿；提交（回车 / 分隔符 / 添加按钮）后才写入节点
  const [draft, setDraft] = useState('');

  // 切换选中节点时清空草稿，避免把上一个节点的录入残留带过来
  useEffect(() => {
    setDraft('');
  }, [node?.id]);

  if (!node) {
    return (
      <section className="inspector">
        <h2 className="panel-title">节点属性</h2>
        <p className="panel-empty">
          在画布中点击节点进行编辑；拖动节点右下角手柄到另一节点即可建立依赖。
          在「占用资源」中可多选已有资源（如追光1、麦克风A），也可录入新资源；
          节点会同时占用所选资源，各资源上的提示分别自动串行。
        </p>
      </section>
    );
  }

  const d = node.data;
  const selected = d.resources ?? [];
  const num = (v: string, fallback: number): number => {
    const n = parseFloat(v);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };

  /** 切换某项已有资源的选中状态（去重由调度层与提交逻辑共同保证） */
  const toggleResource = (name: string) => {
    const set = new Set(selected);
    if (set.has(name)) set.delete(name);
    else set.add(name);
    onChange(node.id, { resources: [...set] });
  };

  const removeResource = (name: string) => {
    onChange(node.id, { resources: selected.filter((r) => r !== name) });
  };

  /** 提交录入框中的新资源（可含多个分隔符），已存在的自动去重 */
  const commitDraft = () => {
    const parts = draft
      .split(RESOURCE_DELIMITERS)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) {
      setDraft('');
      return;
    }
    // 保留节点上已选但不在 options 中的资源（例如刚录入、其它节点尚未使用的）
    onChange(node.id, { resources: [...new Set([...selected, ...parts])] });
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
        <span>占用资源（可多选；节点须等待全部资源释放）</span>
        {selected.length > 0 ? (
          <div className="res-pick-chips">
            {selected.map((r) => (
              <span className="res-pick-chip" key={r} title={`移除资源：${r}`}>
                🎚 {r}
                <button
                  type="button"
                  className="res-pick-chip-x"
                  onClick={() => removeResource(r)}
                  aria-label={`移除资源 ${r}`}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="res-pick-empty">未占用资源</p>
        )}

        <div className="res-pick-existing">
          {resourceOptions.map((r) => {
            const active = selected.includes(r);
            return (
              <button
                type="button"
                key={r}
                className={`res-pick-opt ${active ? 'res-pick-opt-on' : ''}`}
                onClick={() => toggleResource(r)}
                title={active ? `取消占用 ${r}` : `同时占用 ${r}`}
              >
                {active ? '✓ ' : '＋ '}
                {r}
              </button>
            );
          })}
        </div>

        <div className="res-pick-add">
          <input
            type="text"
            list="cue-resource-list"
            placeholder="录入新资源名，回车 / 逗号添加（可一次粘贴多个）"
            value={draft}
            onChange={(e) => {
              const v = e.target.value;
              // 输入分隔符时即时提交前面的内容，便于连续录入
              if (RESOURCE_DELIMITERS.test(v)) {
                const parts = v.split(RESOURCE_DELIMITERS);
                setDraft(parts[parts.length - 1]);
                const parts2 = parts.slice(0, -1).map((s) => s.trim()).filter(Boolean);
                if (parts2.length > 0) {
                  onChange(node.id, { resources: [...new Set([...selected, ...parts2])] });
                }
              } else {
                setDraft(v);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitDraft();
              }
            }}
            onBlur={commitDraft}
          />
          <button type="button" className="btn res-pick-add-btn" onClick={commitDraft}>
            添加
          </button>
        </div>
        <datalist id="cue-resource-list">
          {resourceOptions.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
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
