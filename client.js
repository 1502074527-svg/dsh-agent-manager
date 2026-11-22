/**
 * 智能体 · Client 半。
 *
 * 只 require('react')；颜色只用 --dsw-alias-* 与 --am-*。
 *
 * 关于样式注入：本插件需要 6 个自建的分层色（--am-*），而 DSH 的
 * --dsw-alias-bg-layer-1/2/3 在亮色下全是纯白，无法区分层级。
 * 这些变量必须随生产包一起交付，否则真机上卡片会没有边框和背景。
 * 做法：注入一段 <style>，选择器限定在 [data-am-root] 下，不污染全局。
 *
 * 结构（按段编号，便于分段审查与定位）：
 *   §1 设计刻度 T —— 与 preview/tokens.css 逐项对应，改一处必须两边一起改
 *   §2 头像系统 —— 六槽位程序化简笔画，统一线宽，色相按黄金角分配
 *   §3 基础件 —— Field / Chip / 图标 / 按钮样式
 *   §4 接口层 —— 面板的本地 HTTP 调用
 *   §5 卡片与卡片墙 —— 主界面
 *   §6 详情 —— 只读首屏 + 知识库
 *   §7 编辑 —— 三个决策 + 高级
 *   §8 起点 —— 领域快捷入口 / 更多模板 / 种子转换
 *   §9 徽章 —— hero 与会话头部
 *   §10 主面板 —— 一页两段（我的智能体 + 快速开始），单一返回链
 *
 * 设计依据见 preview/设计依据.md（每个数值都有外部来源与证据强度标注）。
 */
window.__ModuleLoader__.load({
  id: 'dsh-agent-manager',
  factory(require) {
    const React = require('react')
    const ReactDOM = require('react-dom')
    const h = React.createElement
    const { useState, useEffect, useCallback, useMemo, useRef } = React

    /* ══════════════════════════════════════════════════════════════
     * §1 设计刻度
     *
     * 数值来源：preview/设计依据.md。
     * 字号阶梯 11/12/13/14/18/22/28（1.25–1.3 倍递增，标题跳档）；
     * 间距只用 4 的倍数；圆角 4/8/12/16；动效 120–200ms。
     * ══════════════════════════════════════════════════════════════ */
    const T = {
      font: { caption: 11, meta: 12, body: 13, bodyLg: 14, h2: 18, h1: 22, display: 44, hero: 44 },
      space: { s1: 2, s2: 4, s3: 8, s4: 12, s5: 16, s6: 24, s7: 32, s8: 48, s9: 64 },
      radius: { sm: 4, md: 8, lg: 12, xl: 16, pill: 999 },
      ease: 'cubic-bezier(0.2, 0, 0, 1)',
      dur: { hover: '120ms', enter: '180ms' },
      hit: 32,
      cardMin: 260,
      detailMax: 760,
    }

    /**
     * 设计 token 的运行时定义。
     *
     * 为什么必须随生产包注入：卡片、分隔线、悬浮层都依赖 --am-* 这几个分层色，
     * 而 DSH 的 --dsw-alias-bg-layer-1/2/3 在亮色主题下全是纯白（已核验），
     * 光靠它们卡片和背景分不开。早期版本只在预览夹具里定义这些变量，
     * 结果夹具看着正常、真机上卡片没有边框也没有背景。
     *
     * 注入方式：一个 <style>，选择器限定 [data-am-root]，
     * 只影响本插件自己的子树，不改全局。
     */
    const TOKEN_STYLE_ID = 'dsh-agent-manager-tokens'

    const TOKEN_CSS = `
[data-am-root] {
  /* Minimalism：纸白、暖灰、墨色；橙色只承担动作与状态。 */
  --am-surface: var(--am-paper, #faf9f7);
  --am-surface-sunken: var(--am-canvas, #f3f1ed);
  --am-surface-raised: var(--am-sheet, #fffefd);
  --am-surface-hover: var(--am-hover, #f0eee9);
  --am-surface-selected: var(--am-active, #eae7e1);
  --am-hairline: var(--am-line, #e8e5df);
  --am-card-edge: var(--am-line, #e8e5df);
  --am-card-edge-strong: var(--am-line-strong, #d7d2c9);
  --am-ink: var(--am-text, #242321);
  --am-muted: var(--am-text-muted, #706c65);
  --am-accent: var(--am-accent-color, #a44c27);
  --am-accent-ink: var(--am-accent-contrast, #fffaf5);
  --am-serif: "Songti SC", "Noto Serif SC", "Source Han Serif SC", "STSong", "SimSun", Georgia, serif;
  --am-sans: -apple-system, "SF Pro Text", "Helvetica Neue", "PingFang SC", "Noto Sans SC", system-ui, sans-serif;

  /* 亮色档的底层色值也必须显式声明。
   * 早期只在暗色块里声明了 --am-paper / --am-line / --am-line-strong 等，
   * 亮色下它们不存在，于是 border: 1px solid var(--am-line-strong) 整条
   * 在计算期失效（边框直接消失），而带兜底的 var(--am-line-strong, 色值)
   * 却正常——同一份设计里一半有边框、一半没有。补齐后两者一致。 */
  --am-paper: #faf9f7;
  --am-canvas: #f3f1ed;
  --am-sheet: #fefdfb;
  --am-hover: #f0eee9;
  --am-active: #eae7e1;
  --am-line: #e8e5df;
  --am-line-strong: #d7d2c9;
  --am-text: #242321;
  --am-text-muted: #706c65;
  --am-accent-color: #a44c27;
  --am-accent-contrast: #fffaf5;
}
[data-am-root][data-am-dark="true"] {
  --am-paper: #1d1c1a;
  --am-canvas: #252320;
  --am-sheet: #292724;
  --am-hover: #33302b;
  --am-active: #3a3630;
  --am-line: #3b3832;
  --am-line-strong: #514b42;
  --am-text: #ede9e2;
  --am-text-muted: #aaa398;
  --am-accent-color: #d99570;
  --am-accent-contrast: #241a14;
}
[data-am-root] :focus-visible {
  outline: 2px solid var(--dsw-alias-link);
  outline-offset: 2px;
}
/* 交互动效由 CSS 负责，hover 不再触发整棵组件树重渲染。 */
[data-am-root] .am-button:not(:disabled):hover {
  background: var(--am-surface-hover, var(--dsw-alias-interactive-bg-hover));
  border-color: var(--am-card-edge-strong, var(--dsw-alias-border-l2));
  color: var(--dsw-alias-label-primary);
}
[data-am-root] .am-button-primary:not(:disabled):hover {
  background: var(--am-accent);
  border-color: var(--am-accent);
  color: var(--am-accent-ink);
  opacity: .88;
}
[data-am-root] .am-button-danger:not(:disabled):hover {
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent);
  border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 32%, transparent);
  color: var(--dsw-alias-state-error-primary);
}
[data-am-root] .am-card:hover,
[data-am-root] .am-card[aria-current="true"] {
  background: var(--am-surface-hover, var(--dsw-alias-interactive-bg-hover));
  border-color: var(--am-card-edge-strong, var(--dsw-alias-border-l2));
}
[data-am-root] .am-card[aria-current="true"] { border-color: var(--am-accent); }
[data-am-root] .am-agent-card { min-height: 244px; justify-content: space-between; }
[data-am-root] .am-agent-card .am-card-symbol { transition: transform 180ms var(--am-ease, ease); }
[data-am-root] .am-agent-card:hover .am-card-symbol { transform: translateY(-3px); }
[data-am-root] .am-card .am-chevron { opacity: 0; }
[data-am-root] .am-card:hover .am-chevron,
[data-am-root] .am-card:focus-visible .am-chevron,
[data-am-root] .am-card[aria-current="true"] .am-chevron { opacity: 1; }
[data-am-root] .am-row:hover { background: var(--am-surface-hover, var(--dsw-alias-interactive-bg-hover)); }
[data-am-root] .am-input::placeholder { color: var(--dsw-alias-label-caption); opacity: 1; }
[data-am-root] .am-input:hover:not(:disabled) { border-color: var(--am-card-edge-strong, var(--dsw-alias-border-l2)); }
[data-am-root] .am-input:focus { border-color: var(--dsw-alias-link); }
[data-am-root] .am-segment {
  display: inline-flex; gap: 20px; padding: 0;
  border-radius: 0; background: transparent; border-bottom: 1px solid var(--am-hairline);
}
[data-am-root] .am-segment button {
  min-height: 36px; padding: 0 0 9px; border: 0; border-radius: 0;
  border-bottom: 1px solid transparent; margin-bottom: -1px;
  background: transparent; color: var(--am-muted);
  font: 12px inherit; cursor: pointer;
}
[data-am-root] .am-segment button[aria-pressed="true"] {
  background: transparent; color: var(--am-ink); border-bottom-color: var(--am-ink);
  box-shadow: none;
}
[data-am-root] .am-status-dot { width: 6px; height: 6px; border-radius: 50%; flex: none; }
[data-am-root] .am-project-details > summary {
  display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 32px;
  color: var(--dsw-alias-label-secondary); font-size: 12px; cursor: pointer;
  list-style: none;
}
[data-am-root] .am-project-details > summary::-webkit-details-marker { display: none; }
[data-am-root] .am-project-details[open] > summary .am-chevron-down { transform: rotate(180deg); }
[data-am-root] .am-page-content { width: 100%; max-width: 1240px; margin: 0 auto; }
[data-am-root] .am-editor-content { width: 100%; max-width: 880px; margin: 0 auto; }

/* ── 首页「快速开始」：智能体列表在上，领域卡作为同页起点在下 ── */
[data-am-root] .am-quick { width: 100%; max-width: 1040px; margin: clamp(40px, 6vh, 68px) auto 0; }
[data-am-root] .am-quick-head { display: flex; align-items: baseline; justify-content: center; gap: 12px; flex-wrap: wrap; margin-bottom: 20px; }
[data-am-root] .am-quick-title { margin: 0; font-family: var(--am-serif); font-size: clamp(19px, 1.9vw, 24px); font-weight: 600; letter-spacing: -.028em; color: var(--am-ink); }
[data-am-root] .am-quick-note { font-size: 12px; color: var(--am-muted); }
[data-am-root] .am-quick-foot { display: flex; align-items: center; justify-content: center; gap: 16px; margin-top: 18px; font-size: 12px; color: var(--am-muted); }
[data-am-root] .am-quick-foot button {
  border: 0; background: transparent; color: inherit; cursor: pointer;
  font: inherit; padding: 4px 0; border-bottom: 1px solid transparent;
}
[data-am-root] .am-quick-foot button:hover { color: var(--am-ink); border-bottom-color: var(--am-ink); }
/* 列表与快速开始之间的分隔：一条短横线，不抢视线 */
[data-am-root] .am-quick-rule { width: 42px; height: 1px; background: var(--am-line-strong); margin: 0 auto; }

/* ── 未完成的创建：可继续，不静默丢稿 ── */
[data-am-root] .am-resume {
  display: flex; align-items: center; justify-content: center; gap: 12px; flex-wrap: wrap;
  max-width: 1040px; margin: 0 auto 20px; padding: 10px 16px;
  border: 1px dashed var(--am-line-strong); border-radius: 10px;
  font-size: 12px; color: var(--am-muted);
}
[data-am-root] .am-resume b { font-weight: 500; color: var(--am-ink); }
[data-am-root] .am-resume button {
  border: 0; background: transparent; color: inherit; cursor: pointer;
  font: inherit; padding: 4px 0; border-bottom: 1px solid transparent;
}
[data-am-root] .am-resume button:hover { color: var(--am-ink); border-bottom-color: var(--am-ink); }

/* ── 更多模板：单列清单，一行一个起点 ── */
[data-am-root] .am-tpl { max-width: 880px; margin: 0 auto; padding: 6px 0 64px; }
[data-am-root] .am-tpl-head { text-align: center; margin: clamp(24px, 5vh, 52px) 0 clamp(28px, 5vh, 44px); }
[data-am-root] .am-tpl-title { margin: 0; font-family: var(--am-serif); font-weight: 600; font-size: clamp(30px, 3.4vw, 42px); line-height: 1.15; letter-spacing: -.04em; color: var(--am-ink); }
[data-am-root] .am-tpl-sub { margin: 14px auto 0; max-width: 460px; font-size: 13px; line-height: 1.85; color: var(--am-muted); }
[data-am-root] .am-tpl-group + .am-tpl-group { margin-top: 32px; }
[data-am-root] .am-tpl-group h2 { font: 600 10.5px var(--am-sans); letter-spacing: .16em; text-transform: uppercase; color: var(--am-muted); margin: 0 0 4px; }
[data-am-root] .am-tpl-item {
  display: flex; align-items: baseline; gap: 16px; width: 100%; box-sizing: border-box;
  padding: 13px 6px; border: 0; border-bottom: 1px solid var(--am-hairline);
  background: transparent; text-align: left; cursor: pointer; font-family: inherit; color: var(--am-ink);
  transition: background-color 120ms var(--am-ease, ease);
}
[data-am-root] .am-tpl-item:hover { background: var(--am-surface-hover); }
/* 当前起点：从编辑器进来换起点时，先让人认出「我现在用的是哪份」（B-3）。 */
[data-am-root] .am-tpl-item.is-current { background: var(--am-surface-hover); box-shadow: inset 3px 0 0 var(--am-accent); }
[data-am-root] .am-tpl-item.is-current .am-tpl-tag { color: var(--am-accent); border-color: color-mix(in oklab, var(--am-accent) 45%, transparent); }
[data-am-root] .am-tpl-current { max-width: 560px; margin: 18px auto 0; padding: 12px 14px; border-radius: 10px; background: var(--am-surface-sunken); font-size: 12.5px; line-height: 1.8; color: var(--am-muted); text-align: left; }
[data-am-root] .am-tpl-name { flex: none; min-width: 136px; font-family: var(--am-serif); font-size: 16.5px; font-weight: 600; letter-spacing: -.02em; }
[data-am-root] .am-tpl-desc { flex: 1; min-width: 0; font-size: 12.5px; line-height: 1.7; color: var(--am-muted); }
[data-am-root] .am-tpl-tag { flex: none; font-size: 11px; color: var(--am-muted); border: 1px solid var(--am-hairline); border-radius: 999px; padding: 2px 8px; }

/* ── 就地覆盖层（风格库 / 知识卡编辑器）── */
[data-am-root].am-layer-backdrop {
  position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center;
  padding: 24px; background: color-mix(in oklab, #1d1c1a 42%, transparent);
}
[data-am-root] .am-layer-card {
  width: min(720px, 100%); max-height: min(86vh, 780px); overflow: auto; box-sizing: border-box;
  padding: 18px 20px 22px; border-radius: 12px; border: 1px solid var(--am-line-strong);
  background: var(--am-surface); color: var(--am-ink); box-shadow: 0 24px 60px rgba(0, 0, 0, .24);
}

/* ── 编辑器 01 角色页里的「帮我起草」 ── */
[data-am-root] .am-draft { border: 1px solid var(--am-line-strong); border-radius: 12px; padding: 14px 16px; margin-bottom: 26px; background: var(--am-surface-sunken); }
[data-am-root] .am-draft textarea { width: 100%; box-sizing: border-box; min-height: 70px; border: 0; outline: none; resize: vertical; background: transparent; padding: 0; font: 13.5px/1.7 var(--am-sans); color: var(--am-ink); }
[data-am-root] .am-draft textarea::placeholder { color: var(--am-muted); opacity: .85; }
[data-am-root] .am-draft-foot { display: flex; align-items: center; gap: 10px; margin-top: 10px; flex-wrap: wrap; }

/* ── 领域卡（快速开始区）：三列，悬停反色 ── */
[data-am-root] .am-domain-grid {
  width: 100%; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: clamp(12px, 1.6vw, 20px);
}
[data-am-root] .am-domain-card {
  position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center;
  min-height: clamp(126px, 16vh, 168px); padding: 22px 18px; text-align: center;
  border: 1px solid var(--am-line-strong); border-radius: 12px;
  background: transparent; color: var(--am-ink); cursor: pointer;
  font-family: var(--am-serif);
  transition: background-color 180ms var(--am-ease, ease), color 180ms var(--am-ease, ease), border-color 180ms var(--am-ease, ease);
}
[data-am-root] .am-domain-card .am-domain-name {
  font-size: clamp(22px, 2.6vw, 32px); font-weight: 600; letter-spacing: -.03em; line-height: 1.25;
}
/* 卡面第二行：从「英文短标签」变成「从「某份模板」开始 · 共 N 个」。
   原来那套 uppercase + .12em 字距是给「STYLE / MOTION」这类英文短语做的，
   套到中文模板名上又松又长，窄卡里会折成两行，把六张卡高度撑乱。
   改成正常中文排版：小字距、允许两行但不换词、居中。 */
[data-am-root] .am-domain-card .am-domain-meta {
  margin-top: 14px; font-family: var(--am-sans); font-size: 11.5px;
  letter-spacing: .01em; line-height: 1.5; color: var(--am-muted);
  max-width: 100%; text-align: center;
  transition: color 180ms var(--am-ease, ease);
}
[data-am-root] .am-domain-card:hover .am-domain-meta,
[data-am-root] .am-domain-card:focus-visible .am-domain-meta { color: inherit; opacity: .7; }
/* 浅色模式：悬停变黑底纸白字 */
[data-am-root]:not([data-am-dark="true"]) .am-domain-card:hover,
[data-am-root]:not([data-am-dark="true"]) .am-domain-card:focus-visible {
  background: #161513; color: #f7f3ec; border-color: #161513;
}
/* 深色模式：悬停变纸白底墨字 */
[data-am-root][data-am-dark="true"] .am-domain-card:hover,
[data-am-root][data-am-dark="true"] .am-domain-card:focus-visible {
  background: #f5f1e8; color: #191817; border-color: #f5f1e8;
}
[data-am-root] .am-agents-head { padding: calc(40px + var(--dsh-frame-top-clearance, 0px)) 32px 8px; flex-direction: column; align-items: center; text-align: center; }
[data-am-root] .am-agents-title { font-family: var(--am-serif); font-size: clamp(38px, 4.4vw, 56px); font-weight: 600; letter-spacing: -.045em; line-height: 1.1; margin: 10px 0 0; color: var(--am-ink); }
[data-am-root] .am-agents-sub { font-size: 12.5px; color: var(--am-muted); margin: 12px 0 0; }
[data-am-root] .am-agents-tools { display: flex; align-items: center; justify-content: center; gap: 10px; margin-top: 22px; flex-wrap: wrap; }
@media (max-width: 720px) {
  [data-am-root] .am-quick { max-width: 100%; }
}
[data-am-root] .am-tools-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
[data-am-root] .am-tool-check {
  appearance: none; -webkit-appearance: none; width: 17px; height: 17px; flex: none;
  margin: 1px 0 0; border: 1px solid var(--am-line-strong); border-radius: 50%;
  background: transparent; cursor: pointer; position: relative;
}
[data-am-root] .am-tool-check:checked { background: var(--am-ink); border-color: var(--am-ink); }
[data-am-root] .am-tool-check:checked::after {
  content: '✓'; position: absolute; inset: 0; display: grid; place-items: center;
  font-size: 10px; color: var(--am-surface-raised); line-height: 1;
}
[data-am-root] .am-tool-check:disabled { cursor: default; }
@media (max-width: 760px) { [data-am-root] .am-tools-grid { grid-template-columns: 1fr; } }
[data-am-root] .am-agent-wrap { position: relative; display: flex; }
[data-am-root] .am-agent-wrap > .am-agent-card { width: 100%; height: 100%; }
[data-am-root] .am-agent-delete {
  position: absolute; top: 12px; right: 12px; z-index: 2;
  width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center;
  border: 1px solid transparent; background: var(--am-surface-sunken);
  color: var(--dsw-alias-state-error-primary); cursor: pointer; opacity: .62;
  transition: opacity 150ms var(--am-ease), background-color 150ms var(--am-ease), border-color 150ms var(--am-ease);
}
[data-am-root] .am-agent-wrap:hover .am-agent-delete,
[data-am-root] .am-agent-delete:focus-visible { opacity: 1; }
[data-am-root] .am-agent-delete:hover {
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent);
  border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 32%, transparent);
}
[data-am-root] .am-detail { width: 100%; max-width: 1000px; margin: 0 auto; padding: 16px 0 60px; }
[data-am-root] .am-detail-back { max-width: 760px; margin: 0 auto 6px; }
[data-am-root] .am-detail-hero { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 10px 0 30px; border-bottom: 1px solid var(--am-hairline); }
/* 只作用于 hero 的直属图形（头像/徽记）。用后代选择器会把按钮里的 icon
   一起命中，给它加 18px 下外边距，图标被顶高 9px —— 用户看到的「图标和文字没对齐」。 */
[data-am-root] .am-detail-hero > img, [data-am-root] .am-detail-hero > svg { margin-bottom: 18px; }
[data-am-root] .am-detail-name { font-family: var(--am-serif); font-size: clamp(34px,3.8vw,46px); font-weight: 600; letter-spacing: -.045em; line-height: 1.15; margin: 0; color: var(--am-ink); overflow-wrap: anywhere; }
[data-am-root] .am-detail-desc { font-size: 13px; line-height: 1.85; color: var(--am-muted); max-width: 620px; margin: 14px 0 0; }
[data-am-root] .am-detail-meta { display: flex; align-items: center; flex-wrap: wrap; justify-content: center; gap: 7px; font-size: 11.5px; color: var(--am-muted); margin-top: 16px; }
[data-am-root] .am-detail-meta .sep { opacity: .4; }
[data-am-root] .am-detail-actions { display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 22px; flex-wrap: wrap; }
[data-am-root] .am-detail-tabs { display: flex; justify-content: center; gap: 30px; margin: 26px 0 6px; border: 0; }
[data-am-root] .am-detail-tabs button { border: 0; background: transparent; padding: 8px 0; font: 12.5px var(--am-sans); color: var(--am-muted); cursor: pointer; border-bottom: 1px solid transparent; }
[data-am-root] .am-detail-tabs button[aria-selected="true"] { color: var(--am-ink); border-bottom-color: var(--am-ink); }
[data-am-root] .am-detail-body { max-width: 760px; margin: 0 auto; }
[data-am-root] .am-detail-section { padding: 26px 0; border-bottom: 1px solid var(--am-hairline); }
[data-am-root] .am-detail-section h2 { font: 600 10.5px var(--am-sans); letter-spacing: .16em; text-transform: uppercase; color: var(--am-faint, var(--am-muted)); margin: 0 0 12px; }
[data-am-root] .am-detail-text { font-size: 15px; line-height: 1.9; color: var(--am-ink); margin: 0; }
[data-am-root] .am-detail-chips { display: flex; flex-wrap: wrap; gap: 7px; }
[data-am-root] .am-detail-chips span { border: 1px solid var(--am-line-strong); border-radius: 999px; padding: 5px 12px; font-size: 11.5px; color: var(--am-ink); }
[data-am-root] .am-detail-prompt { max-height: 132px; overflow: hidden; position: relative; border: 1px solid var(--am-hairline); border-radius: 12px; background: var(--am-surface-raised); padding: 18px 20px; font: 12.5px/1.9 var(--am-sans); color: var(--am-muted); white-space: pre-wrap; }
[data-am-root] .am-detail-prompt.open { max-height: 520px; overflow: auto; }
[data-am-root] .am-detail-prompt::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 44px; background: linear-gradient(transparent, var(--am-surface-raised)); pointer-events: none; }
[data-am-root] .am-detail-prompt.open::after { display: none; }
[data-am-root] .am-detail-more { display: inline-block; margin-top: 8px; padding: 4px 0; border: 0; background: transparent; color: var(--am-muted); font: 11.5px var(--am-sans); cursor: pointer; border-bottom: 1px solid var(--am-line-strong); }
[data-am-root] .am-detail-flags { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; padding-top: 26px; }
[data-am-root] .am-detail-flags span { font-size: 11px; color: var(--am-muted); border: 1px solid var(--am-hairline); border-radius: 999px; padding: 5px 11px; }
[data-am-root] .am-editor-shell {
  width: 100%; max-width: 1060px; margin: 0 auto;
  display: grid; grid-template-columns: 210px minmax(0, 1fr); gap: clamp(36px, 5vw, 80px);
  align-items: start; padding: 24px 0 80px;
}
[data-am-root] .am-editor-rail { position: sticky; top: 8px; }
[data-am-root] .am-editor-kicker { font: 10.5px var(--am-sans); letter-spacing: .22em; text-transform: uppercase; color: var(--am-muted); }
[data-am-root] .am-editor-name { font-family: var(--am-serif); font-size: 32px; font-weight: 600; letter-spacing: -.04em; line-height: 1.2; margin: 10px 0 0; color: var(--am-ink); overflow-wrap: anywhere; }
[data-am-root] .am-editor-scope { font-size: 11.5px; color: var(--am-muted); margin-top: 10px; }
[data-am-root] .am-editor-unsaved { display: inline-block; margin-top: 8px; padding: 1px 7px; border-radius: 999px; font-size: 10.5px; letter-spacing: .02em; color: var(--am-accent); border: 1px solid color-mix(in oklab, var(--am-accent) 45%, transparent); }
[data-am-root] .am-editor-nav { list-style: none; padding: 0; margin: 30px 0 0; display: grid; gap: 4px; }
[data-am-root] .am-editor-nav button {
  display: flex; align-items: baseline; gap: 12px; width: 100%; text-align: left;
  padding: 9px 0; border: 0; background: transparent; cursor: pointer;
  font: 12.5px var(--am-sans); color: var(--am-muted);
}
[data-am-root] .am-editor-nav button b { font-weight: 400; font-size: 11px; color: var(--am-muted); font-variant-numeric: tabular-nums; }
[data-am-root] .am-editor-nav button[aria-current="true"] { color: var(--am-ink); }
[data-am-root] .am-editor-nav button[aria-current="true"] b { color: var(--am-accent); }
[data-am-root] .am-editor-main { min-width: 0; }
[data-am-root] .am-editor-heading { font-family: var(--am-serif); font-size: clamp(28px,3vw,38px); font-weight: 600; letter-spacing: -.035em; line-height: 1.2; margin: 0 0 8px; }
[data-am-root] .am-editor-lede { font-size: 12.5px; line-height: 1.8; color: var(--am-muted); margin: 0 0 28px; max-width: 520px; }
[data-am-root] .am-editor-section { padding-bottom: 30px; margin-bottom: 30px; border-bottom: 1px solid var(--am-hairline); }
[data-am-root] .am-editor-section:last-of-type { border-bottom: 0; margin-bottom: 8px; }
[data-am-root] .am-editor-foot { display: flex; align-items: center; gap: 10px; padding-top: 20px; border-top: 1px solid var(--am-hairline); flex-wrap: wrap; }
[data-am-root] .am-logo-grid { padding: 2px; scrollbar-width: thin; }
[data-am-root] .am-logo-grid::-webkit-scrollbar { height: 6px; }
[data-am-root] .am-logo-grid::-webkit-scrollbar-thumb { background: var(--am-line-strong); border-radius: 3px; }
@media (max-width: 820px) {
  [data-am-root] .am-editor-shell { grid-template-columns: 1fr; padding-top: 8px; }
  [data-am-root] .am-editor-rail { position: static; }
  [data-am-root] .am-editor-nav { display: flex; flex-wrap: wrap; gap: 16px; margin-top: 18px; }
  [data-am-root] .am-quick { max-width: 720px; }
  [data-am-root] .am-tpl-item { flex-wrap: wrap; gap: 6px; }
}
[data-am-root] .am-domain-card.am-domain-custom { border-style: dashed; border-color: var(--am-line-strong); color: var(--am-muted); }
[data-am-root] .am-domain-card.am-domain-custom .am-domain-plus {
  font-family: var(--am-sans); font-weight: 300; font-size: 44px; line-height: 1;
  color: var(--am-muted); margin-bottom: 8px;
}
[data-am-root] .am-domain-card.am-domain-custom:hover .am-domain-plus,
[data-am-root] .am-domain-card.am-domain-custom:focus-visible .am-domain-plus { color: inherit; }
/* 领域卡在窄面板下从三列退到两列、再退到一列：
   固定三列时每张卡只剩约 150px，「产品运营」加内边距就贴边，
   「空白 · 自己写」会折成两行，六张卡高度参差。 */
@media (max-width: 860px) {
  [data-am-root] .am-domain-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  [data-am-root] .am-quick { max-width: 720px; }
  [data-am-root] .am-domain-card { min-height: 118px; padding: 18px 12px; }
  [data-am-root] .am-domain-card .am-domain-name { font-size: 19px; }
}
[data-am-root] .am-kicker { color: var(--am-muted); font-size: 11px; letter-spacing: .16em; text-transform: uppercase; }
[data-am-root] .am-form-section { padding: 32px 0; border-bottom: 1px solid var(--am-hairline); }
[data-am-root] .am-form-section:first-child { padding-top: 0; }
[data-am-root] .am-form-section:last-child { border-bottom: 0; }
@media (max-width: 640px) {
  [data-am-root] .am-domain-grid { grid-template-columns: 1fr; }
}
@media (max-width: 720px) {
  [data-am-root] .am-body { padding-left: 20px !important; padding-right: 20px !important; }
  [data-am-root] .am-search { flex: 1 1 140px !important; min-width: 120px; }
  [data-am-root] .am-detail-actions { width: 100%; }
}
/* 尊重系统的"减少动效"设置：不是关掉全部过渡，而是压到 1ms，
   这样状态变化仍然发生，只是不产生动画（纯移除过渡会让某些浏览器跳过状态更新）。 */
@media (prefers-reduced-motion: reduce) {
  [data-am-root] * {
    transition-duration: 1ms !important;
    animation-duration: 1ms !important;
  }
}
`

    /** 幂等注入：同一个文档只插一次。 */
    function ensureTokens() {
      try {
        if (document.getElementById(TOKEN_STYLE_ID) !== null) return
        const style = document.createElement('style')
        style.id = TOKEN_STYLE_ID
        style.textContent = TOKEN_CSS
        document.head.appendChild(style)
      } catch { /* 环境没有 DOM 就跳过：SSR 与测试不需要真实样式 */ }
    }

    const S = {
      /* 页面骨架 */
      root: {
        minHeight: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column',
        background: 'var(--am-surface)', color: 'var(--am-ink)',
        fontFamily: 'inherit', fontSize: T.font.bodyLg, lineHeight: 1.6,
      },
      topbar: {
        display: 'flex', alignItems: 'flex-end', gap: T.space.s6,
        paddingTop: `calc(${T.space.s8}px + var(--dsh-frame-top-clearance, 0px))`,
        paddingRight: T.space.s8, paddingBottom: T.space.s7, paddingLeft: T.space.s8,
        flexWrap: 'wrap', maxWidth: 1404, width: '100%', margin: '0 auto', boxSizing: 'border-box',
      },
      title: { fontSize: T.font.h1, fontWeight: 600, margin: 0, letterSpacing: '-0.035em', color: 'var(--am-ink)' },
      count: { fontSize: T.font.meta, color: 'var(--am-muted)', fontVariantNumeric: 'tabular-nums' },
      body: { flex: 1, minHeight: 0, overflow: 'auto', padding: `0 ${T.space.s8}px ${T.space.s9}px` },
      muted: { color: 'var(--am-muted)', fontSize: T.font.meta },
      faint: { color: 'var(--am-muted)', fontSize: T.font.caption },
      grow: { flex: 1 },
      row: { display: 'flex', alignItems: 'center', gap: T.space.s3, flexWrap: 'wrap' },
      divider: { height: 1, background: 'var(--am-hairline, var(--dsw-alias-border-l1))', margin: `${T.space.s6}px 0`, border: 0 },

      /* 按钮：三种层级，主按钮只有一处（新建） */
      btn: {
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        minHeight: T.hit, padding: `0 ${T.space.s4}px`, borderRadius: T.radius.md, lineHeight: 1.2,
        border: '1px solid var(--am-card-edge, var(--dsw-alias-border-l2))', background: 'transparent',
        color: 'var(--dsw-alias-label-primary)', cursor: 'pointer',
        fontSize: T.font.body, fontFamily: 'inherit', whiteSpace: 'nowrap',
        transition: `background-color ${T.dur.hover} ${T.ease}, border-color ${T.dur.hover} ${T.ease}`,
      },
      btnPrimary: {
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        minHeight: T.hit, padding: `0 ${T.space.s5}px`, borderRadius: T.radius.md, lineHeight: 1.2,
        border: '1px solid var(--am-accent)',
        background: 'var(--am-accent)', color: 'var(--am-accent-ink)',
        // 与次级按钮同字重：同一行动作里只有橙底承担「主」的语义，
        // 再加粗会让汉字重心比两边高半像素，扫视时更明显。
        cursor: 'pointer', fontSize: T.font.body, fontWeight: 400, fontFamily: 'inherit',
        transition: `opacity ${T.dur.hover} ${T.ease}`,
      },
      btnGhost: {
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        minHeight: T.hit, padding: `0 ${T.space.s3}px`, borderRadius: T.radius.md, lineHeight: 1.2,
        border: '1px solid transparent', background: 'transparent',
        color: 'var(--dsw-alias-label-tertiary)', cursor: 'pointer',
        fontSize: T.font.body, fontFamily: 'inherit',
        transition: `background-color ${T.dur.hover} ${T.ease}, color ${T.dur.hover} ${T.ease}`,
      },
      btnDanger: {
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        minHeight: T.hit, padding: `0 ${T.space.s4}px`, borderRadius: T.radius.md,
        border: '1px solid transparent', background: 'transparent',
        color: 'var(--dsw-alias-state-error-primary)', cursor: 'pointer',
        fontSize: T.font.body, fontFamily: 'inherit',
      },

      /* 表单 */
      input: {
        width: '100%', boxSizing: 'border-box', padding: `${T.space.s3}px ${T.space.s4}px`,
        borderRadius: T.radius.sm, border: '1px solid var(--am-card-edge)',
        background: 'var(--am-surface-raised)', color: 'var(--am-ink)',
        fontSize: T.font.bodyLg, fontFamily: 'inherit', lineHeight: 1.5,
        transition: `border-color ${T.dur.hover} ${T.ease}, background-color ${T.dur.hover} ${T.ease}`,
      },
      label: { display: 'block', fontSize: T.font.body, fontWeight: 500, color: 'var(--am-ink)', marginBottom: T.space.s3 },
      field: { marginBottom: T.space.s6 },
      hint: { fontSize: T.font.meta, color: 'var(--am-muted)', marginTop: T.space.s3, lineHeight: 1.6 },

      /* 卡片 */
      card: {
        position: 'relative', display: 'flex', flexDirection: 'column', gap: T.space.s5,
        padding: T.space.s6, borderRadius: T.radius.sm,
        border: '1px solid var(--am-card-edge)', background: 'var(--am-surface-raised)',
        cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', color: 'var(--am-ink)',
        transition: `background-color ${T.dur.hover} ${T.ease}, border-color ${T.dur.hover} ${T.ease}, transform ${T.dur.enter} ${T.ease}`,
      },
      cardHover: { background: 'var(--am-surface-hover, var(--dsw-alias-interactive-bg-hover))', borderColor: 'var(--am-card-edge-strong, var(--dsw-alias-border-l3))' },
      cardOn: { background: 'var(--am-surface-selected, var(--dsw-alias-interactive-bg-active))', borderColor: 'var(--dsw-alias-brand-primary)' },

      /* 标签 */
      chip: {
        display: 'inline-flex', alignItems: 'center', gap: 4,
        fontSize: T.font.caption, padding: '2px 7px', borderRadius: T.radius.pill,
        border: '1px solid var(--am-card-edge, var(--dsw-alias-border-l2))', color: 'var(--dsw-alias-label-tertiary)',
        whiteSpace: 'nowrap', lineHeight: 1.6,
      },
      chipSolid: {
        display: 'inline-flex', alignItems: 'center', gap: 4,
        fontSize: T.font.caption, padding: '2px 7px', borderRadius: T.radius.pill,
        border: '1px solid transparent', background: 'var(--am-surface-selected, var(--dsw-alias-interactive-bg-active))',
        color: 'var(--dsw-alias-label-secondary)', whiteSpace: 'nowrap', lineHeight: 1.6,
      },

      err: { color: 'var(--dsw-alias-state-error-primary)', fontSize: T.font.meta, whiteSpace: 'pre-wrap', marginBottom: T.space.s3 },
      ok: { color: 'var(--dsw-alias-state-success-primary)', fontSize: T.font.meta, marginBottom: T.space.s3 },
      pre: {
        whiteSpace: 'pre-wrap', margin: 0, padding: T.space.s4,
        borderRadius: T.radius.md, border: '1px solid var(--am-hairline, var(--dsw-alias-border-l1))',
        background: 'var(--am-surface-sunken, var(--dsw-alias-bg-layer-1))', fontSize: T.font.body,
        lineHeight: 1.65, color: 'var(--dsw-alias-label-secondary)',
      },
      empty: {
        padding: `${T.space.s9}px ${T.space.s6}px`, textAlign: 'center',
        color: 'var(--dsw-alias-label-tertiary)', fontSize: T.font.bodyLg,
      },
    }

    /* ══════════════════════════════════════════════════════════════
     * §2 头像系统
     *
     * 设计约束（preview/设计依据.md 第七节）：
     *  - 画布 48×48，线宽 3 = 6.25%，全图单一线宽，圆头线帽
     *  - 主体占 70–80%，四周留 ≥10%
     *  - 色相：12 个，固定 S/L 只变 H，对白底与深底均 ≥3:1（已用脚本实测）
     *  - 24px 以下只留眼点与嘴弧，删掉顶饰细节与面部标记
     *
     * 槽位：脸 6 × 眼 12 × 嘴 10 × 顶饰 22 × 标记 5 ≈ 7.9 万种组合，
     * 按名字稳定派生，所以同一个智能体在任何端、任何时候都是同一张脸。
     * ══════════════════════════════════════════════════════════════ */

    /**
     * 14 个色相沿色轮均分（360/14 ≈ 25.7°），保证相邻两色一眼可分、同屏不撞色。
     *
     * 每色两档亮度：亮色界面用 light，暗色界面用 dark。
     * 为什么需要两档：高亮度填充放在深色背景上会被背景"洗白"，
     * 观感变成粉彩、失去饱和度（这是同时对比效应，不是错觉）。
     * 暗色档统一压到 L≈52，色相不变，所以在深色下仍然鲜艳。
     *
     * 描边不写死：用主题语义色 --dsw-alias-label-primary，
     * 它在亮色下近黑、暗色下近白，于是「轮廓永远与所在界面反色」，
     * 一套逻辑同时满足两种主题（实测对白底 18.9:1、对深底 17.5:1）。
     *
     * 早期版本把描边写死成深色，暗色主题下对比只有 1.4–3.8:1，轮廓几乎看不见；
     * 这个错误由 preview/tools/palette.mjs 的验算脚本抓出来。
     */
    const HUES = [
      { h: 0, light: '#ee5858', dark: '#c93b3b', lightInk: 'dark', darkInk: 'light' },
      { h: 26, light: '#ee9958', dark: '#c9793b', lightInk: 'dark', darkInk: 'dark' },
      { h: 51, light: '#eed858', dark: '#c9b43b', lightInk: 'dark', darkInk: 'dark' },
      { h: 77, light: '#c4ee58', dark: '#a1c93b', lightInk: 'dark', darkInk: 'dark' },
      { h: 103, light: '#83ee58', dark: '#63c93b', lightInk: 'dark', darkInk: 'dark' },
      { h: 129, light: '#58ee6f', dark: '#3bc950', lightInk: 'dark', darkInk: 'dark' },
      { h: 154, light: '#58eead', dark: '#3bc98c', lightInk: 'dark', darkInk: 'dark' },
      { h: 180, light: '#58eeee', dark: '#3bc9c9', lightInk: 'dark', darkInk: 'dark' },
      { h: 206, light: '#58adee', dark: '#3b8cc9', lightInk: 'dark', darkInk: 'dark' },
      { h: 231, light: '#3c56ec', dark: '#3043b0', lightInk: 'light', darkInk: 'light' },
      { h: 257, light: '#8358ee', dark: '#633bc9', lightInk: 'light', darkInk: 'light' },
      { h: 283, light: '#c458ee', dark: '#a13bc9', lightInk: 'dark', darkInk: 'light' },
      { h: 309, light: '#ec3cd1', dark: '#b0309d', lightInk: 'dark', darkInk: 'light' },
      { h: 334, light: '#ee5899', dark: '#c93b79', lightInk: 'dark', darkInk: 'light' },
    ]

    const MOTIFS = ['orbit', 'prism', 'arch', 'axis', 'aperture', 'stack', 'wave', 'node', 'portal', 'monogram', 'quadrant', 'spark']
    const FACES = ['circle', 'squircle', 'diamond', 'oval', 'blob', 'hex']
    const EYES = ['dot', 'happy', 'sleepy', 'wide', 'square', 'star', 'glasses', 'shades', 'patch', 'wink', 'angry', 'line']
    const MOUTHS = ['smile', 'grin', 'flat', 'o', 'cat', 'frown', 'tongue', 'beak', 'smirk', 'tiny']
    const TOPS = [
      'none', 'cat-ears', 'pointy-ears', 'long-ears', 'round-ears', 'horns', 'halo',
      'antenna', 'bow', 'crown', 'petals', 'leaf', 'crescent', 'rays', 'cloud',
      'heart', 'rainbow', 'bolt', 'flame', 'star', 'headphones', 'cap',
    ]
    const MARKS = ['none', 'cheeks', 'freckles', 'tear', 'sparkle']

    /** cyrb53：短、稳定、够散。 */
    function hashSeed(text) {
      let h1 = 0xdeadbeef
      let h2 = 0x41c6ce57
      const source = String(text ?? '')
      for (let i = 0; i < source.length; i += 1) {
        const ch = source.charCodeAt(i)
        h1 = Math.imul(h1 ^ ch, 2654435761)
        h2 = Math.imul(h2 ^ ch, 1597334677)
      }
      h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
      h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
      return 4294967296 * (2097151 & h2) + (h1 >>> 0)
    }

    /** 从 seed 稳定取第 index 个槽位值（逐槽独立，改一个槽不影响其它槽）。 */
    function pick(seed, index, list) {
      return list[hashSeed(`${seed}#${index}`) % list.length]
    }

    /** 名字 → 六个槽位。同名永远同一结果。 */
    function slotsFor(name) {
      const seed = String(name ?? '').trim().toLowerCase()
      return {
        face: pick(seed, 1, FACES),
        eyes: pick(seed, 2, EYES),
        mouth: pick(seed, 3, MOUTHS),
        top: pick(seed, 4, TOPS),
        mark: pick(seed, 5, MARKS),
        hue: hashSeed(`${seed}@hue`) % HUES.length,
      }
    }

    /**
     * 旧版 36 个形象 id → 新槽位。
     * 老数据里 avatar 存的是 'fox' / 'owl' 这类 id，升级后必须继续显示同一张脸，
     * 否则用户会觉得「我的智能体换人了」。
     */
    const LEGACY_AVATARS = {
      classic: ['circle', 'dot', 'smile', 'none', 'none'],
      happy: ['circle', 'happy', 'grin', 'none', 'none'],
      geek: ['circle', 'glasses', 'flat', 'none', 'none'],
      cool: ['circle', 'shades', 'smile', 'none', 'none'],
      wink: ['circle', 'wink', 'smile', 'none', 'none'],
      sleepy: ['circle', 'sleepy', 'flat', 'none', 'none'],
      surprised: ['circle', 'wide', 'o', 'none', 'none'],
      cat: ['circle', 'dot', 'cat', 'cat-ears', 'none'],
      robot: ['squircle', 'square', 'flat', 'antenna', 'none'],
      alien: ['diamond', 'wide', 'flat', 'antenna', 'none'],
      angry: ['circle', 'angry', 'frown', 'none', 'none'],
      tongue: ['circle', 'dot', 'tongue', 'none', 'none'],
      blush: ['circle', 'dot', 'smile', 'none', 'cheeks'],
      dreamy: ['circle', 'sleepy', 'cat', 'cat-ears', 'none'],
      starstruck: ['circle', 'star', 'grin', 'none', 'sparkle'],
      imp: ['circle', 'dot', 'grin', 'horns', 'none'],
      angel: ['circle', 'happy', 'smile', 'halo', 'none'],
      ribbon: ['circle', 'dot', 'smile', 'bow', 'none'],
      bunny: ['circle', 'dot', 'smile', 'long-ears', 'none'],
      bear: ['circle', 'dot', 'flat', 'round-ears', 'none'],
      panda: ['circle', 'patch', 'flat', 'round-ears', 'none'],
      fox: ['diamond', 'dot', 'cat', 'pointy-ears', 'none'],
      owl: ['circle', 'wide', 'beak', 'none', 'none'],
      ghost: ['squircle', 'dot', 'o', 'none', 'none'],
      blob: ['blob', 'dot', 'smile', 'none', 'none'],
      boxy: ['squircle', 'square', 'flat', 'none', 'none'],
      gem: ['diamond', 'dot', 'smile', 'none', 'none'],
      royal: ['circle', 'happy', 'smile', 'crown', 'none'],
      bloom: ['circle', 'dot', 'smile', 'petals', 'none'],
      sprout: ['circle', 'happy', 'flat', 'leaf', 'none'],
      moon: ['circle', 'sleepy', 'smile', 'crescent', 'none'],
      sunny: ['circle', 'wide', 'smile', 'rays', 'none'],
      puff: ['squircle', 'dot', 'flat', 'cloud', 'none'],
      sweetheart: ['circle', 'happy', 'smile', 'heart', 'none'],
      arc: ['circle', 'dot', 'smile', 'rainbow', 'none'],
      spark: ['diamond', 'wide', 'grin', 'bolt', 'none'],
    }

    /** 解析出最终六槽位：优先用显式 variant，否则按名字派生。 */
    function resolveSlots(name, variant) {
      const derived = slotsFor(name)
      if (typeof variant === 'string' && variant !== '') {
        const legacy = LEGACY_AVATARS[variant]
        if (legacy !== undefined) {
          return { face: legacy[0], eyes: legacy[1], mouth: legacy[2], top: legacy[3], mark: legacy[4], hue: derived.hue }
        }
      }
      return derived
    }

    /** 名字 → 色相（列表、徽章、卡片共用，保证同一个智能体到处同色）。 */
    function hueFor(name) {
      return HUES[hashSeed(`${String(name ?? '').trim().toLowerCase()}@hue`) % HUES.length].fill
    }

    /**
     * 当前是否暗色主题。
     * DSH 用 body[data-ds-dark-theme] 标记暗色，这里监听这个属性变化，
     * 让头像的填充色跟着换档。不用 prefers-color-scheme：
     * 用户可能在系统亮色下选了应用暗色，两者不是一回事。
     */
    function useDarkTheme() {
      const read = () => {
        try {
          return document !== undefined && document.body !== undefined
            && document.body.hasAttribute('data-ds-dark-theme')
        } catch { return false }
      }
      const [dark, setDark] = useState(read)
      useEffect(() => {
        let observer = null
        try {
          observer = new MutationObserver(() => setDark(read()))
          observer.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
        } catch { /* 环境不支持就不监听，保持初始值 */ }
        setDark(read())
        return () => { if (observer !== null) observer.disconnect() }
      }, [])
      return dark
    }

    /**
     * 极简几何徽记：纸白底、墨色线、一个暖橙强调点。
     * 48×48 光学区，2.5 描边，round 线帽，无渐变无阴影。
     * 同名稳定：按 name 哈希取母题；variant 命中旧 id 时仍可渲染（向后兼容）。
     */
    function Avatar(props) {
      const size = props.size ?? 36
      const seed = String(props.name ?? '').trim().toLowerCase()
      const variant = typeof props.variant === 'string' && props.variant !== '' ? props.variant : ''
      const logo = /^logo-([0-9]{2})$/.exec(variant)
      if (logo !== null) {
        return h('img', {
          src: `/agent-manager/logo/${logo[1]}.png`,
          width: size, height: size, alt: '', draggable: false,
          'data-logo': logo[1],
          style: { display: 'block', flexShrink: 0, objectFit: 'contain', ...props.style },
        })
      }
      const base = variant !== '' && LEGACY_AVATARS[variant] !== undefined ? `variant:${variant}` : `name:${seed}`
      const motifIdx = hashSeed(`${base}`) % MOTIFS.length
      const finalMotif = MOTIFS[motifIdx]
      // 同一母题的不同名字用旋转角区分，增加视觉差异。
      const rotation = (hashSeed(`${base}#rot`) % 4) * 90
      const ink = 'var(--am-ink, var(--dsw-alias-label-primary))'
      const accent = 'var(--am-accent, #a44c27)'
      const paper = 'var(--am-surface-raised, var(--dsw-alias-bg-base))'
      const stroke = 2.5
      const common = { fill: 'none', stroke: ink, strokeWidth: stroke, strokeLinecap: 'round', strokeLinejoin: 'round' }
      let mark
      if (finalMotif === 'orbit') {
        mark = [h('circle', { key: 'a', cx: 24, cy: 24, r: 15, ...common }),
          h('ellipse', { key: 'b', cx: 24, cy: 24, rx: 20, ry: 10, transform: 'rotate(-20 24 24)', fill: 'none', stroke: ink, strokeWidth: 1.5 }),
          h('circle', { key: 'c', cx: 41, cy: 16, r: 3.5, fill: accent, stroke: 'none' })]
      } else if (finalMotif === 'prism') {
        mark = [h('path', { key: 'a', d: 'M24 10 L38 38 H10 Z', ...common }),
          h('line', { key: 'b', x1: 24, y1: 10, x2: 24, y2: 38, stroke: ink, strokeWidth: 1.5 }),
          h('rect', { key: 'c', x: 30, y: 26, width: 8, height: 8, fill: accent, stroke: 'none', rx: 1 })]
      } else if (finalMotif === 'arch') {
        mark = [h('path', { key: 'a', d: 'M10 40 V24 A14 14 0 0 1 38 24 V40 Z', ...common }),
          h('line', { key: 'b', x1: 10, y1: 32, x2: 38, y2: 32, stroke: ink, strokeWidth: 1.5 }),
          h('rect', { key: 'c', x: 20, y: 12, width: 8, height: 6, fill: accent, stroke: 'none', rx: 1 })]
      } else if (finalMotif === 'axis') {
        mark = [h('line', { key: 'a', x1: 10, y1: 38, x2: 38, y2: 10, ...common }),
          h('circle', { key: 'b', cx: 24, cy: 24, r: 8, ...common }),
          h('circle', { key: 'c', cx: 24, cy: 24, r: 3.5, fill: accent, stroke: 'none' })]
      } else if (finalMotif === 'aperture') {
        mark = [h('circle', { key: 'a', cx: 24, cy: 24, r: 16, ...common }),
          h('circle', { key: 'b', cx: 24, cy: 24, r: 8, ...common }),
          h('circle', { key: 'c', cx: 24, cy: 24, r: 3, fill: accent, stroke: 'none' })]
      } else if (finalMotif === 'stack') {
        mark = [h('rect', { key: 'a', x: 10, y: 12, width: 28, height: 6, rx: 1, ...common }),
          h('rect', { key: 'b', x: 10, y: 22, width: 20, height: 6, rx: 1, ...common }),
          h('rect', { key: 'c', x: 10, y: 32, width: 28, height: 6, rx: 1, fill: accent, stroke: 'none' })]
      } else if (finalMotif === 'wave') {
        mark = [h('path', { key: 'a', d: 'M8 28 Q14 18 24 28 T40 28', ...common }),
          h('path', { key: 'b', d: 'M8 36 Q14 26 24 36 T40 36', stroke: ink, strokeWidth: 1.5, fill: 'none', strokeLinecap: 'round' }),
          h('circle', { key: 'c', cx: 40, cy: 28, r: 3.5, fill: accent, stroke: 'none' })]
      } else if (finalMotif === 'node') {
        mark = [h('circle', { key: 'a', cx: 24, cy: 24, r: 16, ...common }),
          h('circle', { key: 'b', cx: 24, cy: 24, r: 5, fill: accent, stroke: 'none' })]
      } else if (finalMotif === 'portal') {
        mark = [h('rect', { key: 'a', x: 8, y: 12, width: 32, height: 28, rx: 4, ...common }),
          h('line', { key: 'b', x1: 24, y1: 8, x2: 24, y2: 44, stroke: ink, strokeWidth: 1.5 }),
          h('rect', { key: 'c', x: 26, y: 22, width: 8, height: 8, fill: accent, stroke: 'none', rx: 1 })]
      } else if (finalMotif === 'monogram') {
        mark = [h('circle', { key: 'a', cx: 24, cy: 24, r: 16, ...common }),
          h('text', { key: 'b', x: 24, y: 30, textAnchor: 'middle', fontSize: 18, fontWeight: 600, fill: ink, fontFamily: 'inherit' }, (seed.slice(0, 1) || 'a').toUpperCase())]
      } else if (finalMotif === 'quadrant') {
        mark = [h('rect', { key: 'a', x: 10, y: 10, width: 28, height: 28, rx: 2, ...common }),
          h('line', { key: 'b', x1: 24, y1: 10, x2: 24, y2: 38, stroke: ink, strokeWidth: 1.5 }),
          h('line', { key: 'c', x1: 10, y1: 24, x2: 38, y2: 24, stroke: ink, strokeWidth: 1.5 }),
          h('rect', { key: 'd', x: 26, y: 12, width: 10, height: 10, fill: accent, stroke: 'none', rx: 1 })]
      } else {
        mark = [h('path', { key: 'a', d: 'M24 6 L30 20 L44 24 L32 30 L28 44 L22 32 L8 28 L20 22 Z', ...common }),
          h('circle', { key: 'b', cx: 24, cy: 24, r: 4, fill: accent, stroke: 'none' })]
      }
      return h('svg', {
        width: size, height: size, viewBox: '0 0 48 48', 'aria-hidden': true,
        'data-motif': finalMotif,
        style: { display: 'block', flexShrink: 0, ...props.style },
      },
        h('rect', { x: 4, y: 4, width: 40, height: 40, rx: 4, fill: paper, stroke: ink, strokeWidth: 1.5 }),
        h('g', { transform: `rotate(${rotation} 24 24)` }, mark))
    }

    /* ══════════════════════════════════════════════════════════════
     * §3 基础件
     * ══════════════════════════════════════════════════════════════ */

    const text = (value) => (typeof value === 'string' ? value : '')

    async function api(path, options) {
      const response = await fetch(path, {
        credentials: 'same-origin',
        ...options,
        headers: { 'content-type': 'application/json', 'x-agent-manager': '1', ...(options && options.headers) },
      })
      const raw = await response.text()
      let body = {}
      try {
        body = raw === '' ? {} : JSON.parse(raw)
      } catch {
        throw new Error(raw.slice(0, 200))
      }
      if (!response.ok || body.ok === false) {
        // 保住 Host 的错误码：调用方需要区分「路径还不可用（BAD_CWD）」这类
        // 可以就地降级的情况，不能一律当成「读不到」。
        const error = new Error(body && body.error ? body.error.message : `HTTP ${response.status}`)
        error.code = body && body.error ? body.error.code : undefined
        throw error
      }
      return body.value
    }

    /* 同一句缺失文案原来有三种写法（卡片/详情 hero/概览各一套），统一成一个来源。 */
    const MISSING_DESC = '还没写应用场景。主智能体靠这句话判断要不要叫它。'
    const MISSING_DESC_SHORT = '还没写应用场景'

    const errorText = (error) => String(error && error.message ? error.message : error)

    /**
     * 打开刚由 Host 建好的会话，容忍「客户端会话列表还没到」的竞态。
     *
     * 为什么必须重试：`POST /agent-manager/open-session` 是 Host 侧
     * `sessionController.create`，创建成功返回 sessionId；但这个 id 要经由
     * `api-session/added` 事件回流到客户端 Session Controller 的列表里，
     * `ctx.uiWorkspace.openSession(id)` 内部走 `sessions.retain()`，
     * 只要列表里还没有这一行，就抛 `sessions.retain: unknown session <id>`
     * ——用户看到的正是徽章/详情页「点开新会话没反应，报一串红字」。
     *
     * 事件通常几十毫秒内就到，所以先 refresh 再短暂轮询，最后才放弃。
     * 失败信息保留原始 sessionId，便于用户仍能手动在会话列表里找到它。
     */
    async function openCreatedSession(ctx, open, sessionId) {
      const sessions = (() => { try { return ctx.get('sessions') } catch { return undefined } })()
      const known = () => {
        try {
          const list = sessions?.list?.getSnapshot?.()
          return Array.isArray(list?.ids) && list.ids.includes(sessionId)
        } catch { return false }
      }
      // refresh() 返回的是「列表正在拉取」的 promise，必须 await：
      // 早先只调不 await，等于在列表还是旧快照时就打开会话，必然 unknown session。
      const refresh = async () => {
        try { await sessions?.refresh?.() } catch { /* 拉取失败也继续尝试打开 */ }
      }
      for (let attempt = 0; attempt < 12; attempt += 1) {
        await refresh()
        if (known()) break
        // 已刷新两轮仍没有，多半是事件还没回流；等一小会儿再拉一次。
        if (attempt < 11) await new Promise((resolve) => setTimeout(resolve, 80))
      }
      // 已知就打开；仍未知也试一次 —— 让 DSH 自己给出真实错误，而不是我们假装成功。
      open(sessionId)
    }

    /** 图标：统一 1.6 线宽、圆头线帽，与头像同一套线条语言。 */
    function PanelIcon(props) {
      const size = props?.size ?? 18
      return h('svg', {
        width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': true, style: { display: 'block', flexShrink: 0 },
      },
        h('rect', { x: 3, y: 7, width: 18, height: 13, rx: 4 }),
        h('circle', { cx: 9, cy: 13, r: 1.4, fill: 'currentColor', stroke: 'none' }),
        h('circle', { cx: 15, cy: 13, r: 1.4, fill: 'currentColor', stroke: 'none' }),
        h('path', { d: 'M12 3v4' }),
        h('circle', { cx: 12, cy: 3, r: 1.2, fill: 'currentColor', stroke: 'none' }))
    }

    function Icon(props) {
      const size = props.size ?? 18
      const paths = {
        star: 'M12 3.2l2.3 4.9 5.2.7-3.8 3.6 1 5.2-4.7-2.5-4.7 2.5 1-5.2L4.5 8.8l5.2-.7z',
        plus: 'M12 5v14M5 12h14',
        search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM16.2 16.2L21 21',
        back: 'M15 5l-7 7 7 7',
        close: 'M6 6l12 12M18 6L6 18',
        check: 'M4.5 12.5l5 5 10-11',
        chevron: 'M9 6l6 6-6 6',
        chevronDown: 'M6 9l6 6 6-6',
        tool: 'M14.5 5.5a4 4 0 0 0 5 5L21 12l-8 8-1.5-1.5a4 4 0 0 1-5-5L5 12z',
        book: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z M20 18v3H6.5A2.5 2.5 0 0 1 4 18.5',
        play: 'M8 5.5l11 6.5-11 6.5z',
        trash: 'M5 7h14M9.5 7V4.5h5V7M7 7l1 13h8l1-13',
        edit: 'M4 20h4L20 8l-4-4L4 16z',
        spark: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18',
        power: 'M12 4v8M7.5 7a6.5 6.5 0 1 0 9 0',
      }
      return h('svg', {
        width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
        strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
        style: { display: 'block', flexShrink: 0, ...props.style },
      }, h('path', { d: paths[props.name] ?? paths.star }))
    }

    /**
     * 表单一行：标签 + 控件 + 说明。
     *
     * 标签必须真的关联到控件，否则屏幕阅读器读到输入框时不知道该填什么
     * （全仓原来 0 个 htmlFor）。React 18 有 useId，用它生成稳定 id，
     * 再把 id 交给唯一的子控件；子控件自己已经有 id 时不覆盖。
     * 多控件或非控件的子节点就只保留视觉标签，不做错误关联。
     */
    function Field(props) {
      const autoId = React.useId()
      const id = props.htmlFor ?? autoId
      const hintId = `${id}-hint`
      const children = props.children
      const isSingle = React.isValidElement(children)
      const labelled = isSingle
        ? React.cloneElement(children, {
            ...(children.props.id === undefined ? { id } : {}),
            ...(props.hint !== undefined && children.props['aria-describedby'] === undefined
              ? { 'aria-describedby': hintId }
              : {}),
          })
        : children
      return h('div', { style: props.style ?? S.field },
        props.label ? h('label', { style: S.label, htmlFor: isSingle ? id : undefined }, props.label) : null,
        labelled,
        props.hint ? h('div', { id: hintId, style: S.hint }, props.hint) : null)
    }

    function Chip(props) {
      return h('span', { style: props.solid ? S.chipSolid : S.chip, title: props.title ?? undefined }, props.children)
    }

    /* 30 款 logo 只取一次；模块级缓存避免每次打开表单重复请求。 */
    let LOGO_CACHE = null
    let LOGO_REQUEST = null

    function useLogos() {
      const [logos, setLogos] = useState(LOGO_CACHE ?? [])
      useEffect(() => {
        if (LOGO_CACHE !== null) return undefined
        if (LOGO_REQUEST === null) {
          LOGO_REQUEST = api('/agent-manager/logos')
            .then((value) => {
              LOGO_CACHE = Array.isArray(value?.logos) ? value.logos : []
              return LOGO_CACHE
            })
            .catch(() => [])
        }
        let alive = true
        LOGO_REQUEST.then((list) => { if (alive) setLogos(list) })
        return () => { alive = false }
      }, [])
      return logos
    }

    /**
     * 图标选择：大图预览可点击切换，展开后是 30 款透明 logo 网格。
     * 存在 avatar 字段，值是 `logo-XX`；清空则回退到按名字生成的几何徽记。
     */
    function LogoPicker(props) {
      const logos = useLogos()
      const current = props.draft.avatar
      const selected = /^logo-([0-9]{2})$/.exec(current)?.[1]
      return h('div', null,
        h('div', { style: { display: 'flex', alignItems: 'center', gap: T.space.s6, flexWrap: 'wrap' } },
          h('button', {
            type: 'button',
            'aria-label': '点击切换智能体图标',
            title: '点击切换图标',
            onClick: () => {
              const strip = document.getElementById('am-logo-strip')
              if (strip !== null) strip.scrollIntoView({ block: 'nearest' })
            },
            style: {
              position: 'relative', width: 112, height: 112, padding: 0, cursor: 'pointer',
              border: '1px solid var(--am-line-strong)', borderRadius: 14,
              background: 'var(--am-surface-raised)', display: 'grid', placeItems: 'center',
            },
          },
            h(Avatar, { name: props.draft.name || props.draft.title || 'agent', variant: current, size: 84 }),
            h('span', {
              style: {
                position: 'absolute', left: '50%', bottom: 6, transform: 'translateX(-50%)',
                font: `${T.font.caption}px var(--am-sans)`, color: 'var(--am-muted)',
                background: 'var(--am-surface-raised)', padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap',
              },
            }, '点击下方切换')),
          h('div', { style: { minWidth: 180, flex: 1 } },
            h('div', { style: { fontSize: T.font.bodyLg, fontWeight: 600 } }, selected ? (logos.find((item) => item.id === selected)?.label ?? `图标 ${selected}`) : '默认几何徽记'),
            h('div', { style: { ...S.muted, marginTop: T.space.s2, lineHeight: 1.7 } }, '共 30 款透明图标，点击大图或下方任意一款即可切换。'),
            current !== ''
              ? h(Btn, { kind: 'ghost', onClick: () => { props.set({ avatar: '' }) }, style: { marginTop: T.space.s2, paddingLeft: 0 } }, '恢复默认徽记')
              : null)),
        h('div', {
              id: 'am-logo-strip',
              className: 'am-logo-grid',
              style: { display: 'flex', gap: T.space.s3, marginTop: T.space.s5, overflowX: 'auto', paddingBottom: T.space.s2 },
            },
              logos.map((item) => {
                const active = item.id === selected
                return h('button', {
                  key: item.id,
                  type: 'button',
                  title: item.label,
                  'aria-pressed': active,
                  onClick: () => { props.set({ avatar: `logo-${item.id}` }) },
                  style: {
                    flex: '0 0 64px', display: 'grid', placeItems: 'center', gap: 4, padding: 6, cursor: 'pointer',
                    border: `1px solid ${active ? 'var(--am-accent)' : 'var(--am-hairline)'}`,
                    borderRadius: 10, background: 'var(--am-surface-raised)',
                    boxShadow: active ? '0 0 0 1px var(--am-accent)' : 'none',
                  },
                },
                  h('img', { src: `/agent-manager/logo/${item.id}.png`, width: 44, height: 44, alt: '', loading: 'lazy', style: { display: 'block', objectFit: 'contain' } }),
                  h('span', { style: { font: `${T.font.caption}px var(--am-sans)`, color: 'var(--am-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' } }, item.label))
              })))
    }

    /** 可点按钮：hover 态用 JS 管，因为组件里不写 CSS 类。 */
    function Btn(props) {
      const base = props.kind === 'primary' ? S.btnPrimary : props.kind === 'ghost' ? S.btnGhost : props.kind === 'danger' ? S.btnDanger : S.btn
      return h('button', {
        type: 'button',
        // 函数组件拿不到 ref：需要「关闭后还焦」时用 innerRef 把 DOM 节点露出去。
        ref: props.innerRef ?? undefined,
        className: `am-button${props.kind === 'primary' ? ' am-button-primary' : props.kind === 'danger' ? ' am-button-danger' : ''}`,
        style: { ...base, ...(props.disabled ? { opacity: 0.45, cursor: 'default' } : {}), ...props.style },
        disabled: props.disabled === true,
        title: props.title ?? undefined,
        'aria-label': props['aria-label'] ?? undefined,
        'aria-expanded': props['aria-expanded'] ?? undefined,
        onClick: props.disabled === true ? undefined : props.onClick,
      }, props.icon
        ? h('span', { 'aria-hidden': true, style: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: props.iconSize ?? 16, height: props.iconSize ?? 16, flex: 'none' } },
            h(Icon, { name: props.icon, size: props.iconSize ?? 16 }))
        : null, props.children)
    }

    /** 骨架：保持行高，避免加载完内容跳动。 */
    function Skeleton(props) {
      return h('div', {
        style: {
          height: props.height ?? 14, width: props.width ?? '100%', borderRadius: T.radius.sm,
          background: 'var(--dsw-alias-bg-skeleton)',
        },
      })
    }

    /* ══════════════════════════════════════════════════════════════
     * §4 卡片
     *
     * 卡片只放 4 样：头像、名字、一句话能力、状态与知识量。
     * 工具与模型不进卡片——它们是详情里的事（Cloudscape 的 5 字段原则）。
     * ══════════════════════════════════════════════════════════════ */

    function AgentCard(props) {
      const agent = props.agent
      const on = props.selected === true
      const enabled = agent.enabledEffective !== false
      const statusRow = h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: T.space.s3, color: 'var(--am-muted)', fontSize: T.font.caption, borderTop: '1px solid var(--am-hairline)', paddingTop: T.space.s4 } },
        h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 5 } },
          h('span', { className: 'am-status-dot', style: { background: enabled ? 'var(--am-accent)' : 'var(--am-muted)' } }),
          enabled ? '已启用' : '已停用'),
        h('span', { style: { opacity: 0.45 } }, '·'),
        h('span', null, agent.scope === 'project' ? '项目专属' : '所有项目'),
        agent.knowledgeCount > 0
          ? h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4 } },
              h(Icon, { name: 'book', size: 12 }), String(agent.knowledgeCount || 0))
          : null)
      const card = h('button', {
        type: 'button',
        ref: props.cardRef,
        className: 'am-card am-agent-card',
        style: { ...S.card, minHeight: 244 },
        onClick: props.onOpen,
        onFocus: props.onFocus,
        'data-am-name': agent.name,
        // roving tabindex：整张网格只占一个 Tab 站位，方向键在卡间移动（C-11）。
        // 30+ 条时原来要按 60 多次 Tab 才穿得过去。
        tabIndex: props.tabbable === false ? -1 : 0,
        // 卡片打开的是详情页，不是开关：只要 aria-current。两个都挂会让读屏
        // 把「我在看这个」念成「这是一个可按下的切换按钮」（复查 C-10）。
        'aria-current': on ? 'true' : undefined,
        'aria-label': `${agent.title || agent.name}，${enabled ? '已启用' : '已停用'}${agent.shadowedProject === true ? '，项目里有同名定义未生效' : ''}，${agent.description || agent.name}`,
        title: agent.description || agent.name,
      },
        h('div', { className: 'am-card-symbol', style: { display: 'flex', justifyContent: 'center', alignItems: 'center', paddingTop: T.space.s2 } },
          h(Avatar, { name: agent.name, variant: agent.avatar, size: 64 })),
        h('div', { style: { textAlign: 'center' } },
          h('div', {
            style: {
              fontSize: T.font.bodyLg, fontWeight: 600, lineHeight: 1.35, color: 'var(--am-ink)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            },
          }, agent.title || agent.name),
          h('div', {
            style: {
              fontSize: T.font.meta, color: 'var(--am-muted)',
              marginTop: T.space.s2, lineHeight: 1.6,
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            },
          }, agent.description || MISSING_DESC_SHORT),
          // 项目里有一份同名定义、但没被信任：用户看到「已停用」却找不到原因（C-13）。
          agent.shadowedProject === true
            ? h('div', { style: { marginTop: 8, fontSize: 10.5, color: 'var(--am-muted)' } }, '项目里有同名定义，未信任，未生效')
            : null),
        statusRow)
      // 删除按钮是卡片的兄弟节点（绝对定位叠在 .am-agent-wrap 上），
      // 不能嵌进卡片的 <button> 里，否则 DOM 校验报错且点击/键盘行为失效。
      const del = h('button', {
        type: 'button',
        className: 'am-agent-delete',
        title: `删除 ${agent.title || agent.name}`,
        'aria-label': `删除 ${agent.title || agent.name}`,
        // 隐藏按钮不进 Tab 序：否则每张卡多一个站位，键盘穿过列表要按两倍次数。
        // 键盘用户可以在详情页删除（同一个操作、同一个确认）。
        tabIndex: -1,
        onClick: (event) => { event.stopPropagation(); props.onDelete?.() },
      }, h(Icon, { name: 'trash', size: 15 }))
      return h('div', { className: 'am-agent-wrap' }, card, del)
    }
    /* ══════════════════════════════════════════════════════════════
     * §5 知识库面板
     * ══════════════════════════════════════════════════════════════ */

    function KnowledgePane(props) {
      const [cards, setCards] = useState([])
      // 首帧 cards 是空数组，直接渲染空态会先闪一下「还没有知识卡」（A-9）。
      const [loaded, setLoaded] = useState(false)
      const [editing, setEditing] = useState(null)
      // 与风格库同一套：编辑前后的快照对比，用来判断「有未保存改动」。
      const [pristine, setPristine] = useState(null)
      const [busy, setBusy] = useState(false)
      // 两类信息必须分开：
      //   failure  = 数据读取失败（决定是否走「没能读到」空态）
      //   notice   = 操作提示（如「先填项目路径」），只在顶部显示一行，不影响列表渲染
      // 早期版本把提示写进 failure，导致点启停后整个列表变成"读取失败"。
      const [failure, setFailure] = useState('')
      const [notice, setNotice] = useState('')
      const [material, setMaterial] = useState('')
      const [urls, setUrls] = useState('')
      const [ingesting, setIngesting] = useState(false)
      const [showIngest, setShowIngest] = useState(false)

      const load = useCallback(async () => {
        try {
          const value = await api(`/agent-manager/knowledge?agent=${encodeURIComponent(props.agent)}`)
          setCards(Array.isArray(value.cards) ? value.cards : [])
        } catch (error) {
          setFailure(errorText(error))
        } finally {
          setLoaded(true)
        }
      }, [props.agent])

      useEffect(() => { void load() }, [load])

      const openCard = async (card) => {
        try {
          const value = await api(`/agent-manager/knowledge/read?agent=${encodeURIComponent(props.agent)}&card=${encodeURIComponent(card)}`)
          const next = { card: value.card, name: value.name, description: value.description, body: value.body }
          setEditing(next)
          setPristine(snapshotOf(next))
        } catch (error) {
          setFailure(errorText(error))
        }
      }

      const snapshotOf = (value) => JSON.stringify([value.card, value.name, value.description, value.body])
      const editingDirty = editing !== null && pristine !== null && snapshotOf(editing) !== pristine
      /* 知识卡编辑器也算一层：面板 Esc 与详情返回都要先让它收尾（复查 A-8）。
         与风格库共用 AM_LAYER / data-am-layer 约定。 */
      useEffect(() => {
        if (editing === null) return undefined
        AM_LAYER.open = true
        return () => { AM_LAYER.open = false; AM_LAYER.dirty = false }
      }, [editing === null])
      useEffect(() => { AM_LAYER.dirty = editingDirty }, [editingDirty])

      const closeEditing = () => {
        if (editingDirty && !window.confirm('这张知识卡还没保存，放弃修改？')) return false
        setEditing(null)
        setPristine(null)
        return true
      }

      const save = async () => {
        if (editing === null) return
        setBusy(true); setFailure('')
        try {
          await api('/agent-manager/knowledge/save', { method: 'POST', body: JSON.stringify({ agent: props.agent, card: editing.card, name: editing.name, description: editing.description, body: editing.body }) })
          setEditing(null)
          setPristine(null)
          await load()
          if (props.onChanged) props.onChanged()
        } catch (error) {
          setFailure(errorText(error))
        } finally { setBusy(false) }
      }

      const remove = async (card) => {
        if (!window.confirm(`删除知识卡 ${card}？`)) return
        try {
          await api('/agent-manager/knowledge/remove', { method: 'POST', body: JSON.stringify({ agent: props.agent, card }) })
          setEditing(null)
          setPristine(null)
          await load()
          if (props.onChanged) props.onChanged()
        } catch (error) {
          setFailure(errorText(error))
        }
      }

      const ingest = async () => {
        const body = material.trim()
        const list = urls.split(/[\s,，;；]+/).map((item) => item.trim()).filter((item) => item !== '')
        if (body === '' && list.length === 0) { setFailure('把材料贴到上面，或填一个网址'); return }
        setIngesting(true); setFailure(''); setNotice('')
        try {
          const result = await api('/agent-manager/ingest', { method: 'POST', body: JSON.stringify({ agent: props.agent, text: body, urls: list }) })
          setMaterial(''); setUrls('')
          await load()
          if (props.onChanged) props.onChanged()
          setNotice(`已生成 ${result.saved.length} 张知识卡`)
        } catch (error) {
          setFailure(errorText(error))
        } finally { setIngesting(false) }
      }

      /* 知识卡编辑器的 Esc：输入框里只退输入；在表单里先回卡片列表（脏则确认）。
         用捕获阶段监听——面板级 Esc 也挂在 document 上，必须先截住。 */
      const boxRef = useRef(null)
      useEffect(() => {
        const onKey = (event) => {
          if (event.key !== 'Escape') return
          if (editing === null) return
          AM_LAYER.escaped = true
          const target = event.target
          const typing = target !== null && target !== undefined && (
            target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'
          )
          if (typing) { target.blur(); return }
          closeEditing()
        }
        document.addEventListener('keydown', onKey, true)
        return () => document.removeEventListener('keydown', onKey, true)
      }, [editing, pristine])

      if (editing !== null) {
        return h('div', { ref: boxRef, 'data-am-layer': '', 'data-am-knowledge': '' },
          h('div', { style: { ...S.row, marginBottom: T.space.s5 } },
            h(Btn, { kind: 'ghost', icon: 'back', onClick: closeEditing }, '返回'),
            h('div', { style: { fontSize: T.font.h2, fontWeight: 600 } }, editing.card === '' ? '新建知识卡' : (editing.name || editing.card)),
            h('div', { style: S.grow }),
            editing.card === '' ? null : h(Btn, { kind: 'danger', onClick: () => { void remove(editing.card) }, disabled: busy }, '删除'),
            h(Btn, { kind: 'primary', onClick: () => { void save() }, disabled: busy }, busy ? '保存中…' : '保存')),
          failure ? h('div', { style: S.err }, failure) : null,
          h(Field, { label: '卡片标识（文件名）', hint: editing.card === '' ? '小写字母、数字、连字符' : '已有卡片保存后不能改标识（改它等于改名，旧文件会留在原地）' },
            h('input', { style: S.input, value: editing.card, disabled: editing.card !== '', onChange: (event) => setEditing({ ...editing, card: event.target.value }) })),
          h(Field, { label: '标题' },
            h('input', { style: S.input, value: editing.name, onChange: (event) => setEditing({ ...editing, name: event.target.value }) })),
          h(Field, { label: '什么时候用这张卡', hint: '智能体靠这句话判断要不要加载它' },
            h('input', { style: S.input, value: editing.description, onChange: (event) => setEditing({ ...editing, description: event.target.value }) })),
          h(Field, { label: '正文（Markdown）' },
            h('textarea', { style: { ...S.input, minHeight: 320, fontFamily: 'ui-monospace, monospace', resize: 'vertical' }, value: editing.body, onChange: (event) => setEditing({ ...editing, body: event.target.value }) })))
      }

      return h('div', null,
        h('div', { style: { ...S.row, marginBottom: T.space.s5 } },
          h('div', { style: { fontSize: T.font.bodyLg, fontWeight: 500 } }, cards.length === 0 ? '还没有知识卡' : `${cards.length} 张知识卡`),
          h('div', { style: S.grow }),
          h(Btn, {
            icon: 'plus',
            onClick: () => {
              const blank = { card: '', name: '', description: '', body: '' }
              setEditing(blank)
              setPristine(snapshotOf(blank))
            },
          }, '手动新建'),
          h(Btn, { kind: 'primary', icon: 'spark', onClick: () => setShowIngest((value) => !value) }, showIngest ? '收起' : '丢材料自动建库')),
        failure ? h('div', { style: S.err }, failure) : null,
        notice ? h('div', { style: S.ok }, notice) : null,
        showIngest
          ? h('div', { style: { padding: T.space.s5, borderRadius: T.radius.lg, border: '1px solid var(--am-hairline, var(--dsw-alias-border-l1))', background: 'var(--am-surface-sunken, var(--dsw-alias-bg-layer-1))', marginBottom: T.space.s5 } },
              h('div', { style: { ...S.muted, marginBottom: T.space.s3 } }, '把网页、文档、笔记贴进来，会按使用场景拆成知识卡（含标题和「什么时候用」）。'),
              h('textarea', {
                style: { ...S.input, minHeight: 96, resize: 'vertical' },
                value: material,
                placeholder: '粘贴文字、Markdown、网页正文……',
                onChange: (event) => setMaterial(event.target.value),
              }),
              h('div', { style: { ...S.row, marginTop: T.space.s3, flexWrap: 'nowrap' } },
                h('input', {
                  style: { ...S.input, flex: 1 },
                  value: urls,
                  placeholder: '或填网址（多个用空格分隔）',
                  onChange: (event) => setUrls(event.target.value),
                }),
                h(Btn, { kind: 'primary', onClick: () => { void ingest() }, disabled: ingesting }, ingesting ? '整理中…' : '生成')),
              h('div', { style: { ...S.hint, marginTop: T.space.s3 } }, '生成后可直接改。'))
          : null,
        !loaded
          ? h('div', { style: S.muted }, '正在读取知识卡…')
          : cards.length === 0
          ? h('div', { style: S.empty },
              h('div', { style: { fontWeight: 500, marginBottom: T.space.s2, color: 'var(--dsw-alias-label-secondary)' } }, '这个智能体还没有专业资料'),
              h('div', null, '把该领域的术语、规范、案例写成卡片，它就能在需要时自己查阅。'))
          : cards.map((card) => h(CardRow, {
              key: card.card,
              title: card.name || card.card,
              badge: card.card,
              description: card.description,
              meta: `${Math.max(1, Math.round((card.bytes || 0) / 1024))} KB`,
              onClick: () => { void openCard(card.card) },
            })))
    }

    /** 通用列表行：知识卡、风格、工具说明共用，保证同类元素同样式。 */
    function CardRow(props) {
      return h('button', {
        type: 'button',
        className: 'am-row',
        style: {
          display: 'flex', alignItems: 'center', gap: T.space.s4, width: '100%',
          padding: `${T.space.s3}px ${T.space.s4}px`, borderRadius: T.radius.md,
          border: '1px solid transparent', background: 'transparent',
          cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', color: 'inherit',
          transition: `background-color ${T.dur.hover} ${T.ease}`,
        },
        onClick: props.onClick,
      },
        h('div', { style: { minWidth: 0, flex: 1 } },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: T.space.s3 } },
            h('span', { style: { fontSize: T.font.body, fontWeight: 500 } }, props.title),
            props.badge ? h(Chip, null, props.badge) : null),
          props.description ? h('div', { style: { ...S.faint, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, props.description) : null),
        props.meta ? h('span', { style: S.faint }, props.meta) : null,
        h(Icon, { name: 'chevron', size: 14, style: { color: 'var(--dsw-alias-label-caption)', opacity: 0.55 } }))
    }
    /* ══════════════════════════════════════════════════════════════
     * §6 详情：只读首屏
     *
     * 首屏回答四个问题，按用户真正关心的顺序：
     *   它能干什么 → 什么时候叫它 → 它带什么工具 → 它读过什么
     * 编辑是次动作，放在右上角，不在首屏铺表单。
     *
     * 写法说明：这里刻意把每个区块先算成变量再拼装，而不是一路嵌套 h()。
     * 深嵌套的 h() 括号极难维护（之前就出过括号不匹配导致整段白屏），
     * 拆成变量后每一块都能单独读、单独改。
     * ══════════════════════════════════════════════════════════════ */

    /** 工具组 id → 中文名（详情页把 id 翻译成人话）。 */
    function toolLabel(groups, id) {
      const hit = (groups || []).find((group) => group.id === id)
      return hit ? hit.label : id
    }

    function DetailSection(props) {
      return h('section', { style: { marginBottom: T.space.s6 } },
        h('div', {
          style: {
            fontSize: T.font.caption, fontWeight: 600, letterSpacing: '0.06em',
            color: 'var(--dsw-alias-label-caption)', textTransform: 'uppercase',
            marginBottom: T.space.s3,
          },
        }, props.title),
        props.children)
    }

    function DetailHeader(props) {
      const agent = props.agent
      return h('div', null,
        h('div', { className: 'am-detail-back' },
          h(Btn, { kind: 'ghost', icon: 'back', onClick: props.onBack, style: { paddingLeft: 0 } }, '全部智能体')),
        h('div', { className: 'am-detail-hero' },
          h(Avatar, { name: agent.name, variant: agent.avatar, size: 96 }),
          h('h1', { className: 'am-detail-name' }, agent.title || agent.name),
          h('p', { className: 'am-detail-desc' }, agent.description || MISSING_DESC),
          h('div', { className: 'am-detail-meta' },
            h('span', null, agent.scope === 'project' ? '项目级' : '用户级'),
            h('span', { className: 'sep' }, '·'),
            h('span', null, agent.mode === 'llm' ? '单次问答' : '可带工具'),
            h('span', { className: 'sep' }, '·'),
            h('span', null, agent.enabledEffective === false ? '已停用' : '已启用'),
            agent.shadowedProject === true ? h('span', { className: 'sep' }, '·') : null,
            agent.shadowedProject === true ? h('span', null, '项目同名定义未生效') : null,
            agent.knowledgeCount > 0 ? h('span', { className: 'sep' }, '·') : null,
            agent.knowledgeCount > 0 ? h('span', null, `${agent.knowledgeCount} 张知识卡`) : null),
          h('div', { className: 'am-detail-actions' },
            agent.mode === 'agent'
              ? h(Btn, { kind: 'primary', icon: 'play', onClick: props.onRun, disabled: !agent.enabledEffective, title: agent.enabledEffective ? '用它的预设、工具和知识开新会话' : '请先启用这个智能体' }, '开新会话')
              : h(Btn, { kind: 'primary', icon: 'spark', disabled: true, title: '单次问答模式请通过 /agent 或主智能体调用' }, '供主智能体调用'),
            h(Btn, { icon: 'edit', onClick: props.onEdit }, '编辑'),
            // 这是「切换」不是「状态标记」：文案用动词，图标用 power，
            // 原来的 check + 「已启用」看着像已完成标签，点了会变什么完全看不出来。
            h(Btn, {
              icon: 'power',
              onClick: props.onToggle,
              disabled: props.busy === true,
              title: props.canToggle ? undefined : '启停是按项目的策略：先填项目路径',
            }, agent.enabledEffective ? '停用' : '启用'),
            h(Btn, { kind: 'danger', icon: 'trash', onClick: props.onDelete, title: '删除这个智能体' }, '删除'))))
    }

    /**
     * 详情页页签。
     *
     * 原来只标了 role="tablist"/role="tab"，没有 tabpanel、没有 aria-controls、
     * 也没有方向键——屏幕阅读器会期待 Tab 键切页签，结果按下去直接跳走。
     * 这里补齐：页签与面板互相引用，← → 切换，roving tabindex。
     */
    function DetailTabs(props) {
      const items = [
        { key: 'overview', label: '概览' },
        { key: 'knowledge', label: `知识库${props.count ? ` · ${props.count}` : ''}` },
      ]
      const onKeyDown = (event) => {
        if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
        event.preventDefault()
        const index = items.findIndex((item) => item.key === props.tab)
        const next = items[(index + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length]
        props.onChange(next.key)
        const node = event.currentTarget.parentElement?.querySelector(`#am-tab-${next.key}`)
        node?.focus?.()
      }
      return h('div', { className: 'am-detail-tabs', role: 'tablist', 'aria-label': '详情分栏' },
        items.map((item) => h('button', {
          key: item.key,
          id: `am-tab-${item.key}`,
          type: 'button',
          role: 'tab',
          'aria-selected': props.tab === item.key,
          'aria-controls': `am-tabpanel-${item.key}`,
          tabIndex: props.tab === item.key ? 0 : -1,
          onKeyDown,
          onClick: () => props.onChange(item.key),
        }, item.label)))
    }

    function ToolChips(props) {
      const tools = props.tools
      if (tools.length === 0) {
        return h('div', { style: S.muted }, props.mode === 'llm' ? '单次问答模式，不带工具。' : '没有勾选任何工具。')
      }
      return h('div', { className: 'am-detail-chips' },
        tools.map((id) => h('span', { key: id }, toolLabel(props.groups, id))))
    }

    function DetailOverview(props) {
      const agent = props.agent
      const tools = Array.isArray(agent.tools) ? agent.tools : []
      const [promptOpen, setPromptOpen] = useState(false)
      const [criteriaOpen, setCriteriaOpen] = useState(false)

      const flags = []
      if (agent.askFirst) flags.push('先问清再动手')
      if (agent.selfCheck) flags.push('产出后自检')
      if (agent.style) flags.push(`风格 · ${agent.style}`)
      flags.push(agent.model ? `模型 · ${agent.model}` : '模型 · 继承默认')

      return h('div', { className: 'am-detail-body' },
        h('section', { className: 'am-detail-section' },
          h('h2', null, '什么时候叫它'),
          h('p', { className: 'am-detail-text' }, agent.description || MISSING_DESC)),
        h('section', { className: 'am-detail-section' },
          h('h2', null, `工具 · ${tools.length}`),
          h(ToolChips, { tools, groups: props.groups, mode: agent.mode })),
        h('section', { className: 'am-detail-section' },
          h('h2', null, '工作方式'),
          h('div', { className: `am-detail-prompt${promptOpen ? ' open' : ''}` }, agent.prompt || '（空）'),
          agent.prompt && agent.prompt.length > 220
            ? h('button', { type: 'button', className: 'am-detail-more', onClick: () => setPromptOpen((v) => !v) }, promptOpen ? '收起' : '展开全文')
            : null),
        agent.criteria
          ? h('section', { className: 'am-detail-section' },
              h('h2', null, '判断标准'),
              h('div', { className: `am-detail-prompt${criteriaOpen ? ' open' : ''}` }, agent.criteria),
              agent.criteria.length > 220
                ? h('button', { type: 'button', className: 'am-detail-more', onClick: () => setCriteriaOpen((v) => !v) }, criteriaOpen ? '收起' : '展开全文')
                : null)
          : null,
        h('div', { className: 'am-detail-flags' },
          flags.map((label) => h('span', { key: label }, label))))
    }

    function AgentDetail(props) {
      const agent = props.agent
      // 页签状态提到 Panel：Esc 要在「知识库」页上先回概览（而不是直接退列表），
      // and 换智能体时由 Panel 统一重置。
      const tab = props.tab === undefined ? 'overview' : props.tab
      const setTab = typeof props.onTabChange === 'function' ? props.onTabChange : () => {}

      const panelProps = {
        role: 'tabpanel',
        id: `am-tabpanel-${tab}`,
        'aria-labelledby': `am-tab-${tab}`,
        tabIndex: -1,
      }
      /* 内层（知识卡编辑器）还开着时，返回与切页签都会把它卸载：
         先让它收尾（脏则确认），再动外层。 */
      const guardLayer = (action) => {
        if (!AM_LAYER.open || !AM_LAYER.dirty) return true
        return window.confirm(`还有没保存的编辑，${action}会丢掉它。继续？`)
      }

      const content = tab === 'overview'
        ? h('div', panelProps, h(DetailOverview, { agent, groups: props.groups }))
        : h('div', { ...panelProps, className: 'am-detail-body', style: { paddingTop: 20 } },
            h(KnowledgePane, { agent: agent.name, onChanged: props.onReload }))

      return h('div', { className: 'am-detail' },
        h(DetailHeader, {
          agent,
          canToggle: props.canToggle,
          busy: props.busy,
          onToggle: props.onToggle,
          onRun: props.onRun,
          onEdit: props.onEdit,
          onBack: () => { if (guardLayer('回列表')) props.onBack() },
          onDelete: props.onDelete,
        }),
        h(DetailTabs, {
          tab,
          count: agent.knowledgeCount,
          onChange: (next) => { if (next !== tab && guardLayer('切换页签')) setTab(next) },
        }),
        content)
    }

    /* ══════════════════════════════════════════════════════════════
     * §7 编辑
     *
     * 只暴露三个决策：干什么、用什么工具、用什么模型。
     * 其余（内部代号、作用域、推理强度、判断标准、形象）收进「高级」，
     * 并且高级里的每一项都带可见默认值——不填也能存。
     * ══════════════════════════════════════════════════════════════ */

    const DESIGN_BASELINE = `# 判断标准（产出前后逐条核对）

## 硬性数字
- 正文对比度 ≥ 4.5:1；辅助文字 ≥ 3:1
- 字号层级 ≤ 5 级；标题/正文 ≥ 2:1
- 间距只用 4 的倍数：4/8/12/16/24/32/48/64
- 主色 1 个 + 辅助色 ≤ 2 个 + 中性灰阶；点缀色 ≤ 10% 面积
- 内容最大宽度 ≤ 1200px，栅格 8pt

## 结构规则
- 每屏只有一个视觉焦点
- 每个元素都有对齐参照，慎用居中
- 留白 ≥ 30%
- 同类元素同样式

## 负面清单（出现即返工）
- 超过 3 个高饱和色同屏
- 阴影/描边/渐变滥用（同屏 >2 处）
- 图标风格混搭
- 文字压图不做遮罩
- 全大写中文、斜体正文`

    function normalizeDraft(source, defaultScope) {
      return {
        name: text(source && source.name),
        title: text(source && source.title),
        description: text(source && source.description),
        prompt: text(source && source.prompt),
        mode: source && source.mode === 'llm' ? 'llm' : 'agent',
        tools: Array.isArray(source && source.tools) ? [...source.tools] : [],
        model: text(source && source.model),
        provider: text(source && source.provider),
        reasoning_effort: text(source && source.reasoning_effort),
        enabled: source && source.enabled === false ? false : true,
        askFirst: source && source.askFirst === true,
        selfCheck: source && source.selfCheck === true,
        criteria: text(source && source.criteria),
        style: text(source && source.style),
        avatar: text(source && source.avatar),
        // 模板声明的模块（如 ['style','knowledge']）：决定 05 页要不要出现
        // 「默认风格」。没有声明时留 null，表示「不知道」，按显示处理。
        modules: Array.isArray(source && source.modules) ? [...source.modules] : null,
        scope: source && source.scope === 'project' ? 'project' : defaultScope === 'project' ? 'project' : 'user',
      }
    }

    function ModelPicker(props) {
      const providers = props.models?.providers ?? []
      const current = providers.find((item) => item.provider === props.draft.provider)
      const models = current?.models ?? []
      const flatModels = props.draft.provider === '' || models.length === 0
        ? (() => {
            const seen = new Set()
            const result = []
            for (const item of providers) {
              for (const model of item.models ?? []) {
                if (seen.has(model.id)) continue
                seen.add(model.id)
                result.push({ id: model.id, label: model.label || model.id, provider: item.provider })
              }
            }
            return result
          })()
        : []
      const list = models.length > 0 ? models.map((model) => ({ ...model, provider: current.provider })) : flatModels
      return h('div', { style: { display: 'flex', gap: T.space.s3, flexWrap: 'wrap' } },
        h('div', { style: { flex: '1 1 170px' } },
          h('label', { style: S.label }, '服务商'),
          h('select', { style: S.input, value: props.draft.provider, onChange: (event) => props.set({ provider: event.target.value, model: '' }) },
            h('option', { value: '' }, '继承默认'),
            providers.map((item) => h('option', { key: item.provider, value: item.provider }, item.label || item.provider)))),
        h('div', { style: { flex: '2 1 200px' } },
          h('label', { style: S.label }, '模型'),
          h('select', { style: S.input, value: props.draft.model, onChange: (event) => {
              const id = event.target.value
              const hit = flatModels.find((model) => model.id === id)
              props.set(hit !== undefined && props.draft.provider === '' ? { model: id, provider: hit.provider } : { model: id })
            } },
            h('option', { value: '' }, '继承默认'),
            list.map((model) => h('option', { key: model.id, value: model.id }, model.label || model.id)),
            props.draft.model !== '' && !list.some((model) => model.id === props.draft.model)
              ? h('option', { value: props.draft.model }, `${props.draft.model}（当前值）`)
              : null)))
    }

    function EffortPicker(props) {
      const [options, setOptions] = useState([])
      useEffect(() => {
        if (!props.draft.provider || !props.draft.model) { setOptions([]); return }
        let stop = false
        api(`/agent-manager/efforts?provider=${encodeURIComponent(props.draft.provider)}&model=${encodeURIComponent(props.draft.model)}`)
          .then((value) => { if (!stop) setOptions(value.efforts || []) })
          .catch(() => { if (!stop) setOptions([]) })
        return () => { stop = true }
      }, [props.draft.provider, props.draft.model])
      if (options.length === 0) {
        return h('input', { style: S.input, value: props.draft.reasoning_effort, placeholder: '留空继承默认', onChange: (event) => props.set({ reasoning_effort: event.target.value }) })
      }
      return h('select', { style: S.input, value: props.draft.reasoning_effort, onChange: (event) => props.set({ reasoning_effort: event.target.value }) },
        h('option', { value: '' }, '继承默认'),
        options.map((id) => h('option', { key: id, value: id }, id)),
        props.draft.reasoning_effort !== '' && !options.includes(props.draft.reasoning_effort)
          ? h('option', { value: props.draft.reasoning_effort }, `${props.draft.reasoning_effort}（当前值）`)
          : null)
    }

    /**
     * 风格库编辑器。
     *
     * Esc 语义（原实现完全缺失，是个真 bug）：
     * 面板级 Esc 处理在 `screen !== 'home'` 时一律 `back()`，而 StylesPane 是
     * **独立写盘**的（styles/save 不经过草稿）。于是在风格编辑表单里按两次 Esc
     * 会：第一次 blur 输入框 → 第二次直接退出编辑器，正在写的风格静默丢失，
     * 外层智能体表单也没保存。
     *
     * 现在分两层：
     *   - 正在编辑某套风格：Esc 先回到风格列表（有改动则先确认），不离开编辑器；
     *   - 只在看风格列表：Esc 关闭风格面板（回到 05 页），同样不离开编辑器。
     * 用 `data-am-styles` 标记，面板级 Esc 见到它就整体跳过。
     */
    function StylesPane(props) {
      const [styles, setStyles] = useState([])
      // 首帧别闪「还没有风格」（A-9）。
      const [loaded, setLoaded] = useState(false)
      const [editing, setEditing] = useState(null)
      // 差异对比用的快照：和当前编辑对象不一致即视为「有未保存改动」。
      const [pristine, setPristine] = useState(null)
      const [busy, setBusy] = useState(false)
      // 两类信息必须分开：
      //   failure  = 数据读取失败（决定是否走「没能读到」空态）
      //   notice   = 操作提示（如「先填项目路径」），只在顶部显示一行，不影响列表渲染
      // 早期版本把提示写进 failure，导致点启停后整个列表变成"读取失败"。
      const [failure, setFailure] = useState('')
      const [notice, setNotice] = useState('')

      const load = useCallback(async () => {
        try {
          const value = await api('/agent-manager/styles')
          setStyles(Array.isArray(value.styles) ? value.styles : [])
        } catch (error) { setFailure(errorText(error)) } finally { setLoaded(true) }
      }, [])
      useEffect(() => { void load() }, [load])

      const snapshotOf = (value) => JSON.stringify([value.style, value.name, value.description, value.body])
      const editingDirty = editing !== null && pristine !== null && snapshotOf(editing) !== pristine
      /* 这一层在屏幕上、以及它脏不脏，都登记到 AM_LAYER：
         面板 Esc 与编辑器里的「收起 / 切页签 / 返回上一步」据此让位或确认。 */
      useEffect(() => {
        AM_LAYER.open = true
        return () => { AM_LAYER.open = false; AM_LAYER.dirty = false; AM_LAYER.escaped = false }
      }, [])
      useEffect(() => { AM_LAYER.dirty = editingDirty }, [editingDirty])
      useEffect(() => { props.onDirtyChange?.(editingDirty) }, [editingDirty])

      const openStyle = async (style) => {
        try {
          const value = await api(`/agent-manager/styles/read?style=${encodeURIComponent(style)}`)
          const next = { style: value.style, name: value.name, description: value.description, body: value.body }
          setEditing(next)
          setPristine(snapshotOf(next))
        } catch (error) { setFailure(errorText(error)) }
      }

      const startNew = () => {
        const next = { style: '', name: '', description: '', body: '' }
        setEditing(next)
        setPristine(snapshotOf(next))
      }

      /** 关掉风格编辑表单：有未保存改动先问一句，避免静默丢弃。 */
      const closeEditing = () => {
        const dirty = editing !== null && pristine !== null && snapshotOf(editing) !== pristine
        if (dirty && !window.confirm('这套风格还没保存，放弃修改？')) return false
        setEditing(null)
        setPristine(null)
        return true
      }

      const save = async () => {
        if (editing === null) return
        setBusy(true); setFailure('')
        try {
          await api('/agent-manager/styles/save', { method: 'POST', body: JSON.stringify(editing) })
          setEditing(null)
          setPristine(null)
          await load()
          if (props.onChanged) props.onChanged()
        } catch (error) { setFailure(errorText(error)) } finally { setBusy(false) }
      }

      const remove = async (style) => {
        if (!window.confirm(`删除风格 ${style}？已绑定它的智能体会回退到无风格。`)) return
        try {
          await api('/agent-manager/styles/remove', { method: 'POST', body: JSON.stringify({ style }) })
          setEditing(null); setPristine(null); await load()
          if (props.onChanged) props.onChanged()
        } catch (error) { setFailure(errorText(error)) }
      }

      /* 面板级 Esc 见到 [data-am-styles] 就整体跳过，交由这里分层处理。
         用捕获阶段的原生监听：面板级监听也挂在 document 上，
         必须在它之前截住，才能保证「Esc 只退一层」。 */
      const boxRef = useRef(null)
      /* 覆盖层 = 模态：打开时把焦点送进来、Tab 在层内循环、关掉把焦点还给触发按钮、
         锁住背景滚动。没有这一步就是「看得见、键盘进不去」的假模态（2026-11-22 验收 A-2）。 */
      useEffect(() => {
        const card = boxRef.current
        const opener = document.activeElement
        const previousOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        const focusables = () => [...(card?.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex="0"]') ?? [])]
        focusables()[0]?.focus?.()
        // 背景 inert：焦点陷阱挡住 Tab 之后，读屏仍会读到层后的表单，这里一并屏蔽。
        const panelRoot = [...document.querySelectorAll('[data-am-root]')].find((node) => !node.hasAttribute('data-am-layer'))
        try { panelRoot?.setAttribute('inert', '') } catch { /* 老浏览器忽略 */ }
        return () => {
          document.body.style.overflow = previousOverflow
          try { panelRoot?.removeAttribute('inert') } catch { /* 忽略 */ }
          const target = props.returnFocusTo?.current ?? opener
          if (target !== null && target !== undefined && typeof target.focus === 'function') target.focus()
        }
      }, [])

      useEffect(() => {
        const onKey = (event) => {
          if (event.key === 'Tab') {
            // 焦点陷阱：Tab / Shift+Tab 只在层内循环。
            const card = boxRef.current
            if (card === null || card === undefined) return
            const list = [...card.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex="0"]')]
            if (list.length === 0) return
            const first = list[0]
            const last = list[list.length - 1]
            const active = document.activeElement
            if (event.shiftKey && (active === first || !card.contains(active))) { event.preventDefault(); last.focus() }
            else if (!event.shiftKey && (active === last || !card.contains(active))) { event.preventDefault(); first.focus() }
            return
          }
          if (event.key !== 'Escape') return
          if (boxRef.current === null || boxRef.current === undefined) return
          AM_LAYER.escaped = true
          event.stopPropagation()
          const target = event.target
          const typing = target !== null && target !== undefined && (
            target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'
          )
          // 输入框里 Esc 只退出输入（与全站一致），不当作「关掉风格」。
          if (typing) { target.blur(); return }
          if (editing !== null) { closeEditing(); return }
          // 在风格列表上按 Esc = 收起风格面板，回到 05 页，不离开编辑器。
          if (typeof props.onClose === 'function') props.onClose()
        }
        document.addEventListener('keydown', onKey, true)
        return () => document.removeEventListener('keydown', onKey, true)
      }, [editing, pristine, props.onClose])

      const dark = useDarkTheme()
      const closePane = () => {
        if (editing !== null) { if (closeEditing()) { if (typeof props.onClose === 'function') props.onClose() } ; return }
        if (typeof props.onClose === 'function') props.onClose()
      }
      const content = editing !== null
        ? h('div', null,
            h('div', { style: { ...S.row, marginBottom: T.space.s4 } },
              h(Btn, { kind: 'ghost', icon: 'back', onClick: closeEditing }, '返回'),
              h('strong', { style: { fontSize: T.font.bodyLg } }, editing.style === '' ? '新建风格' : `风格 · ${editing.name || editing.style}`),
              h('div', { style: S.grow }),
              editing.style === '' ? null : h(Btn, { kind: 'danger', onClick: () => { void remove(editing.style) }, disabled: busy }, '删除'),
              h(Btn, { kind: 'primary', onClick: () => { void save() }, disabled: busy }, busy ? '保存中…' : '保存'),
              h(Btn, { kind: 'ghost', onClick: () => closePane() }, '收起')),
            failure ? h('div', { style: S.err }, failure) : null,
            h(Field, { label: '风格标识（小写字母/数字/连字符）', hint: editing.style === '' ? undefined : '已有风格保存后不能改标识（改它等于改名，旧文件会留在原地）' },
              h('input', { style: S.input, value: editing.style, disabled: editing.style !== '', onChange: (event) => setEditing({ ...editing, style: event.target.value }) })),
            h(Field, { label: '风格名' },
              h('input', { style: S.input, value: editing.name, onChange: (event) => setEditing({ ...editing, name: event.target.value }) })),
            h(Field, { label: '什么时候用这种风格' },
              h('input', { style: S.input, value: editing.description, onChange: (event) => setEditing({ ...editing, description: event.target.value }) })),
            h(Field, { label: '这套风格的判断标准（数字规则 + 负面清单）' },
              h('textarea', { style: { ...S.input, minHeight: 260, fontFamily: 'ui-monospace, monospace', resize: 'vertical' }, value: editing.body, onChange: (event) => setEditing({ ...editing, body: event.target.value }) })))
        : h('div', null,
            h('div', { style: { ...S.row, marginBottom: T.space.s4 } },
              h('strong', { style: { fontSize: T.font.bodyLg } }, `风格库 · ${styles.length}`),
              h('div', { style: S.grow }),
              h(Btn, { onClick: async () => { try { await api('/agent-manager/styles/install', { method: 'POST', body: '{}' }); await load(); if (props.onChanged) props.onChanged() } catch (error) { setFailure(errorText(error)) } } }, '装内置风格'),
              h(Btn, { kind: 'primary', onClick: startNew }, '新建风格'),
              h(Btn, { kind: 'ghost', onClick: () => closePane() }, '收起')),
            failure ? h('div', { style: S.err }, failure) : null,
            !loaded
              ? h('div', { style: S.muted }, '正在读取风格库…')
              : styles.length === 0
              ? h('div', { style: S.muted }, '还没有风格。点「装内置风格」获得瑞士极简 / 编辑杂志风 / 活力科技三套起点。')
              : styles.map((item) => h(CardRow, {
                  key: item.style,
                  title: item.name,
                  badge: item.style,
                  description: item.description,
                  meta: '编辑',
                  onClick: () => { void openStyle(item.style) },
                })))

      /* 就地覆盖层（B-4）：不再内联摊在 05 页里，保存键因此被推到很远。
         portal 到 body，带 data-am-root/data-am-dark 才拿得到 --am-* 变量。 */
      return ReactDOM.createPortal(
        h('div', {
          className: 'am-layer-backdrop',
          'data-am-root': '',
          'data-am-dark': dark ? 'true' : undefined,
          'data-am-layer': '',
          // 点遮罩 = 收起（有未保存改动时先确认）
          onMouseDown: (event) => { if (event.target === event.currentTarget) closePane() },
        },
          h('div', {
            ref: boxRef,
            'data-am-styles': '',
            className: 'am-layer-card',
            role: 'dialog',
            'aria-modal': 'true',
            'aria-label': editing !== null ? '风格编辑' : '风格库',
          }, content)),
        document.body)
    }

    /**
     * 工具勾选：按领域自动勾，用户改过后不再覆盖。
     * 「为什么勾这些」始终可见——自动决策必须可解释，否则用户不敢用。
     */
    function ToolPicker(props) {
      const draft = props.draft
      const set = props.set
      const groups = props.groups ?? []
      const reason = props.reason

      return h('div', null,
        reason !== null && reason !== undefined
          ? h('div', {
              style: {
                display: 'flex', gap: T.space.s3, padding: `${T.space.s3}px ${T.space.s4}px`,
                borderRadius: T.radius.md, background: 'var(--am-surface-sunken, var(--dsw-alias-bg-layer-1))',
                marginBottom: T.space.s4, alignItems: 'flex-start',
              },
            },
              h(Icon, { name: 'spark', size: 14, style: { color: 'var(--dsw-alias-label-caption)', marginTop: 3 } }),
              h('div', { style: { flex: 1 } },
                h('div', { style: { fontSize: T.font.meta, color: 'var(--dsw-alias-label-secondary)' } }, reason),
                props.touched
                  ? h('div', { style: { ...S.faint, marginTop: 2 } }, '你已经手动改过工具，之后换领域不会再覆盖你的选择。')
                  : h('div', { style: { ...S.faint, marginTop: 2 } }, '按领域自动勾选。改一下就会以你的选择为准。')))
          : null,
        h('div', { className: 'am-tools-grid' },
          groups.map((group) => {
            const checked = draft.tools.includes(group.id)
            const disabled = group.available === false
            return h('label', {
              key: group.id,
              title: group.description || group.label,
              className: 'am-tool-card',
              style: {
                display: 'flex', alignItems: 'flex-start', gap: T.space.s3,
                padding: `12px 16px 12px 20px`, borderRadius: 8,
                border: `1px solid ${checked ? 'var(--am-line-strong)' : 'var(--am-hairline)'}`,
                background: checked ? 'var(--am-surface-raised)' : 'transparent',
                fontSize: T.font.body, cursor: disabled ? 'default' : 'pointer',
                opacity: disabled ? 0.4 : 1,
              },
            },
              h('input', {
                type: 'checkbox',
                checked,
                disabled,
                className: 'am-tool-check',
                onChange: (event) => {
                  if (props.onTouched) props.onTouched()
                  set({ tools: event.target.checked ? [...draft.tools, group.id] : draft.tools.filter((id) => id !== group.id) })
                },
              }),
              h('span', { style: { minWidth: 0, paddingTop: 1 } },
                h('span', { style: { display: 'block', lineHeight: 1.45 } }, group.label),
                group.description ? h('span', { style: { ...S.faint, display: 'block', lineHeight: 1.5, marginTop: 3 } }, group.description) : null))
          })))
    }

    /**
     * 编辑表单：三个决策在前，高级折叠在后。
     *
     * 草稿（draft）由 Panel 持有并作为 props 传入（受控），不是组件内部 state：
     * 这样「返回上一步」卸载本组件后，01–05 页签里填过的内容仍然在，
     * 再进来接着改，不会像早期版本那样一返回就全丢。
     */
    function AgentForm(props) {
      const draft = props.draft
      const setDraft = props.setDraft
      const creating = props.creating === true
      // 编辑态才有「原来那份」：用于判断是否脏、以及判断内部代号是否锁定。
      const initial = creating ? undefined : props.initial
      const [tab, setTab] = useState('role')
      const [stylesList, setStylesList] = useState([])
      const [stylesOpen, setStylesOpen] = useState(false)
      // 覆盖层关闭后把焦点还给「管理/收起」按钮（程序化 click 不会移动焦点，只能显式指定）。
      const stylesBtnRef = useRef(null)
      // 风格库是独立写盘的就地覆盖层：收起 / 切页签 / 返回都会卸载它（复查 A-6）。
      const [stylesDirty, setStylesDirty] = useState(false)
      const [busy, setBusy] = useState(false)
      // 两类信息必须分开：
      //   failure  = 数据读取失败（决定是否走「没能读到」空态）
      //   notice   = 操作提示（如「先填项目路径」），只在顶部显示一行，不影响列表渲染
      // 早期版本把提示写进 failure，导致点启停后整个列表变成"读取失败"。
      const [failure, setFailure] = useState('')
      const [notice, setNotice] = useState('')
      const [touched, setTouched] = useState(false)
      // 「帮我起草」：把用户的一句话交给同一个 /generate 接口，
      // 结果只填空白字段，不覆盖已经写过的内容。
      const [need, setNeed] = useState(() => text(props.draftNeed))
      const [drafting, setDrafting] = useState(false)
      // 并发写冲突（409）：光给红字没有出路，这里记一笔并在表单里给可点的动作。
      const [stale, setStale] = useState(false)
      /* 脏判定只比「当前草稿 vs 基线」，不再用组件内的 touched 标记。
       *
       * 表单会随换屏卸载重挂载（Panel 用 key 区分 target），任何挂在组件内的
       * 「我改过」标记都会在第二次进入时归零，把有未保存改动误判成干净，
       * 于是换目标确认与「继续编辑」守卫一起失效。
       * 基线由 Panel 在开新草稿 / 换编辑对象时写入，所以模板预填不算用户改动。 */
      const baselineJson = JSON.stringify(
        props.baseline === null || props.baseline === undefined
          ? normalizeDraft(initial ?? {}, props.defaultScope)
          : props.baseline,
      )
      const dirty = JSON.stringify(draft) !== baselineJson
      const set = (patch) => {
        setDraft((current) => ({ ...current, ...patch }))
      }
      /** 离开编辑器（返回上一步 / 先不保存 / 换起点）前，先让风格库守卫一次。 */
      const leaveForm = (action) => {
        if (!leaveStylesLayer(action)) return
        props.onCancel()
      }
      /** 离开会卸载风格库的动作前，先问一句（有未保存的风格改动时）。 */
      const leaveStylesLayer = (action) => {
        if (!stylesOpen || !stylesDirty) return true
        return window.confirm(`风格库里还有没保存的改动，${action}会丢掉它。继续？`)
      }
      // 草稿属于 Panel：每次改动直接回写，父层才能判断脏、也才能在返回后保住内容。
      useEffect(() => {
        props.onDraftChange?.(draft)
      }, [draft])
      useEffect(() => {
        props.onDirtyChange?.(dirty)
      }, [dirty])
      // 提交中把状态回传给 Panel：Esc 处理在 Panel 上，必须知道这一层忙不忙。
      useEffect(() => {
        props.onBusyChange?.(busy)
      }, [busy])
      useEffect(() => () => { props.onBusyChange?.(false) }, [])

      const loadStyles = useCallback(async () => {
        try {
          const value = await api('/agent-manager/styles')
          setStylesList(Array.isArray(value.styles) ? value.styles : [])
        } catch { setStylesList([]) }
      }, [])
      useEffect(() => { void loadStyles() }, [loadStyles])

      const draftWithAi = async () => {
        if (need.trim() === '') { setFailure('先写一句：它替你做什么'); return }
        setDrafting(true); setFailure(''); setNotice('')
        try {
          const result = await api('/agent-manager/generate', { method: 'POST', body: JSON.stringify({ need }) })
          if (result.needMore) {
            setFailure(Array.isArray(result.questions) ? result.questions.join('\n') : '需要更多信息')
            return
          }
          const suggestion = result.suggestion || {}
          // 只补空白：已经写过的字段以用户为准，起草不能悄悄改掉他的说法。
          setDraft((current) => ({
            ...current,
            title: current.title.trim() === '' ? (suggestion.title || current.title) : current.title,
            description: current.description.trim() === '' ? (suggestion.description || current.description) : current.description,
            prompt: current.prompt.trim() === '' ? (suggestion.prompt || current.prompt) : current.prompt,
            criteria: current.criteria.trim() === '' ? (suggestion.criteria || current.criteria) : current.criteria,
          }))
          // 草稿一变，Panel 侧按「草稿 vs 基线」自动判脏，不需要额外标记。
          setNotice('已按你的一句话填好空白字段，逐项核对再改。')
        } catch (error) { setFailure(errorText(error)) } finally { setDrafting(false) }
      }

      const submit = async () => {
        // 前端先拦一道：名字和触发场景是必填，缺了直接告诉用户怎么补，
        // 不要提交到 Host 再弹一条「name 非法」这种用户看不懂的错。
        const title = (draft.title || '').trim()
        const description = (draft.description || '').trim()
        if (title === '') { setFailure('「它叫什么」不能为空：给它起个名字，比如「界面设计评审」'); return }
        if (description === '') { setFailure('「什么时候叫它」不能为空：写清触发场景，比如「当用户需要评审界面稿时调用」'); return }
        // 保存会离开编辑器，同样会把展开的风格库卸载掉。
        if (!leaveStylesLayer('保存并离开')) return
        setBusy(true); setFailure('')
        try {
          await props.onSave({
            name: draft.name.trim(),
            title,
            description,
            prompt: draft.prompt,
            mode: draft.mode,
            tools: draft.mode === 'agent' ? draft.tools : [],
            model: draft.model.trim() || undefined,
            provider: draft.provider.trim() || undefined,
            reasoning_effort: draft.reasoning_effort.trim() || undefined,
            enabled: draft.enabled,
            askFirst: draft.askFirst === true,
            selfCheck: draft.selfCheck === true,
            criteria: draft.criteria,
            style: draft.style,
            avatar: draft.avatar,
            scope: draft.scope,
            previousScope: initial ? initial.scope : undefined,
          })
        } catch (error) {
          if (error && error.code === 'STALE_DEFINITION') setStale(true)
          setFailure(errorText(error))
        } finally { setBusy(false) }
      }

      /** 重新读取磁盘上的最新版本，但不丢掉当前表单：mtime 更新后就能覆盖保存。 */
      const reloadLatest = async () => {
        const snapshot = [draft.title, draft.description, draft.prompt, draft.criteria].join('\n\n')
        let copied = false
        try { await navigator.clipboard.writeText(snapshot); copied = true } catch { copied = false }
        try { await props.onReloadLatest?.() } catch (problem) { setFailure(errorText(problem)); return }
        setStale(false)
        setFailure('')
        setNotice(copied
          ? '已读取最新版本；你的修改还在，旧版内容也复制到了剪贴板。确认后再保存。'
          : '已读取最新版本；你的修改还在，确认后再保存。')
      }

      const saveAsTemplate = async () => {
        setNotice(''); setFailure('')
        try {
          const base = (draft.name || 'custom').trim().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '') || 'custom'
          const id = `user-${base}`.slice(0, 50)
          // 同名模板原来直接覆盖，没有任何提示（复查 A-14）。
          if (props.templateIds instanceof Set && props.templateIds.has(id)) {
            if (!window.confirm(`已经有同名模板「${draft.title || id}」。用当前表单覆盖它？`)) return
          }
          const result = await api('/agent-manager/templates', {
            method: 'POST',
            body: JSON.stringify({
              id, label: draft.title || draft.name || id, description: draft.description,
              definition: {
                name: draft.name || id, title: draft.title, description: draft.description,
                prompt: draft.prompt, mode: draft.mode, tools: draft.tools,
                askFirst: draft.askFirst === true, selfCheck: draft.selfCheck === true,
                criteria: draft.criteria, style: draft.style,
              },
            }),
          })
          // 内部 id（user-xxx）用户不认识；回显标题更可读，拿不到标题才退回 id。
          setNotice(`已存为模板：${draft.title || result?.label || id}`)
        } catch (error) { setFailure(errorText(error)) }
      }

      /**
       * 05 页要不要显示「默认风格」。
       *
       * 这里曾按 `props.modules === null || includes('style')` 判断，而调用方
       * 创建态传 `null`、编辑态传 `null` 或 `['style','knowledge']`——两种都命中
       * 第一个分支，于是**恒为真**，模板 JSON 里声明的 `modules` 从来没被读过：
       * 12 份模板里 9 份声明了不含 style（如 code-review），05 页照样给它们
       * 显示「默认风格」，用户以为这份智能体会用到风格库。
       *
       * 现在按模板实际声明判断：显式声明了 modules 就照办；没有声明
       * （手写智能体、老数据）才退回显示，避免把已有用户的选择藏起来。
       */
      const showsStyle = !Array.isArray(props.modules) || props.modules.includes('style')
      const editing = initial !== undefined && !creating
      const tabs = [
        { key: 'role', label: '角色', no: '01' },
        { key: 'ability', label: '能力', no: '02' },
        { key: 'model', label: '模型', no: '03' },
        { key: 'logo', label: '图标', no: '04' },
        { key: 'advanced', label: '高级', no: '05' },
      ]
      const activeTab = tabs.some((item) => item.key === tab) ? tab : 'role'

      const heading = activeTab === 'role' ? '它是谁'
        : activeTab === 'ability' ? '它怎样工作'
        : activeTab === 'model' ? '用哪个模型'
        : activeTab === 'logo' ? '给它一个图标'
        : '不常用，但随时能改'
      const lede = activeTab === 'role' ? '一个名字，一句触发场景，一段岗位说明。'
        : activeTab === 'ability' ? '只给它完成任务所需的能力；工具越少，行为越稳。'
        : activeTab === 'model' ? '留空则继承全局默认，不额外占额度。'
        : activeTab === 'logo' ? '30 款透明图标任选，创建后会同步到卡片、详情与会话头部。'
        // 说明要跟着实际显示走：不显示风格时还写「风格」会让人找不见。
        : showsStyle ? '内部代号、作用域、风格与判断标准。' : '内部代号、作用域与判断标准。'

      const content = activeTab === 'role'
        ? h('div', null,
            h('div', { className: 'am-draft' },
              h('div', { style: { ...S.label, marginBottom: T.space.s2 } }, '一句话：它替你做什么'),
              h('textarea', {
                value: need,
                placeholder: '例如：帮我评审界面方案，指出层级与对比度问题',
                onChange: (event) => setNeed(event.target.value),
              }),
              h('div', { className: 'am-draft-foot' },
                h(Btn, { kind: 'primary', icon: 'spark', onClick: () => { void draftWithAi() }, disabled: drafting }, drafting ? '起草中…' : '帮我起草'),
                h('span', { style: S.faint }, '只填空白字段，已写的不动'))),
            h(Field, { label: '它叫什么', hint: '显示在卡片、详情与会话里的名字' },
              h('input', { className: 'am-input', style: S.input, value: draft.title, placeholder: '例如：界面设计评审', onChange: (event) => set({ title: event.target.value }) })),
            h(Field, { label: '什么时候叫它', hint: '主智能体只凭这句话决定是否调用，写清触发场景。' },
              h('textarea', { className: 'am-input', style: { ...S.input, minHeight: 76, resize: 'vertical' }, value: draft.description, placeholder: '当用户需要…时调用', onChange: (event) => set({ description: event.target.value }) })),
            h(Field, { label: '岗位说明', hint: '流程、纪律与交付标准；只在它自己的上下文里生效。' },
              h('textarea', { className: 'am-input', style: { ...S.input, minHeight: 210, resize: 'vertical', lineHeight: 1.75 }, value: draft.prompt, onChange: (event) => set({ prompt: event.target.value }) })))
        : activeTab === 'ability'
          ? h('div', null,
              h(Field, { label: '执行模式' },
                h('select', { className: 'am-input', style: S.input, value: draft.mode, onChange: (event) => set({ mode: event.target.value }) },
                  h('option', { value: 'agent' }, '可带工具（推荐）'),
                  h('option', { value: 'llm' }, '单次问答，不带工具'))),
              draft.mode === 'agent'
                ? h(Field, { label: '它能用哪些工具', hint: '勾「技能与知识库」才能加载它的知识卡。' },
                    h(ToolPicker, { draft, set, groups: props.groups, reason: props.toolReason, touched, onTouched: () => setTouched(true) }))
                : h('div', { style: S.muted }, '单次问答模式不加载工具。'),
              h('label', { style: { display: 'flex', alignItems: 'center', gap: T.space.s3, fontSize: T.font.body, margin: `${T.space.s5}px 0 ${T.space.s4}px` } },
                h('input', { type: 'checkbox', checked: draft.askFirst === true, style: { accentColor: 'var(--am-accent)' }, onChange: (event) => set({ askFirst: event.target.checked }) }),
                h('span', null, '先问清再动手'),
                h('span', { style: S.faint }, '信息不足时主动提问（需勾「向用户提问」）')),
              h('label', { style: { display: 'flex', alignItems: 'center', gap: T.space.s3, fontSize: T.font.body } },
                h('input', { type: 'checkbox', checked: draft.selfCheck === true, style: { accentColor: 'var(--am-accent)' }, onChange: (event) => set({ selfCheck: event.target.checked }) }),
                h('span', null, '产出后自检'),
                h('span', { style: S.faint }, '渲染截图逐条核对（需终端 + 文件读写）')))
          : activeTab === 'model'
            ? h('div', null,
                h(Field, { label: '用哪个模型', hint: '留空继承全局默认' }, h(ModelPicker, { models: props.models, draft, set })),
                h(Field, { label: '推理强度' }, h(EffortPicker, { draft, set })))
            : activeTab === 'logo'
              ? h(LogoPicker, { draft, set })
              : h('div', null,
                  h('div', { style: { display: 'flex', gap: T.space.s4, flexWrap: 'wrap' } },
                    h(Field, { label: '内部代号', hint: initial ? '保存后不能改' : '小写字母开头，可含数字与连字符', style: { ...S.field, flex: '1 1 200px' } },
                      h('input', { className: 'am-input', style: S.input, value: draft.name, disabled: editing, placeholder: 'ui-review', onChange: (event) => set({ name: event.target.value }) })),
                    h(Field, { label: '作用域', style: { ...S.field, flex: '1 1 200px' } },
                      h('select', { className: 'am-input', style: S.input, value: draft.scope, onChange: (event) => set({ scope: event.target.value }) },
                        h('option', { value: 'user' }, '用户级（跨项目）'),
                        h('option', { value: 'project', disabled: !props.cwd }, props.cwd ? '项目级（当前项目）' : '项目级（需先填项目路径）')))),
                  showsStyle
                    ? h(Field, { label: '默认风格', hint: '风格规则常驻提示词；任务里临时指定会覆盖它' },
                        h('div', { style: { ...S.row, gap: T.space.s3, flexWrap: 'nowrap' } },
                          h('select', { className: 'am-input', style: { ...S.input, flex: 1 }, value: draft.style, onChange: (event) => set({ style: event.target.value }) },
                            h('option', { value: '' }, '不绑定风格'),
                            stylesList.map((item) => h('option', { key: item.style, value: item.style }, `${item.name}（${item.style}）`))),
                          h(Btn, {
                            innerRef: stylesBtnRef,
                            onClick: () => {
                              if (stylesOpen && !leaveStylesLayer('收起')) return
                              setStylesOpen((value) => !value)
                            },
                          }, stylesOpen ? '收起' : '管理')))
                    : null,
                  // onClose：Esc 在风格列表上时收起面板（不是退出编辑器）。
                  showsStyle && stylesOpen
                    ? h(StylesPane, {
                        onChanged: () => { void loadStyles() },
                        onClose: () => setStylesOpen(false),
                        onDirtyChange: setStylesDirty,
                        returnFocusTo: stylesBtnRef,
                      })
                    : null,
                  h(Field, {
                    label: showsStyle && draft.style !== '' ? '补充标准（叠加在风格之上）' : '判断标准',
                    hint: '写「什么样的产出算合格」的可核对规则：具体数字、必须项、禁止项',
                  },
                    h('textarea', { className: 'am-input', style: { ...S.input, minHeight: 140, fontFamily: 'ui-monospace, monospace', resize: 'vertical' }, value: draft.criteria, onChange: (event) => set({ criteria: event.target.value }) }),
                    showsStyle ? h(Btn, { style: { marginTop: T.space.s2 }, onClick: () => set({ criteria: DESIGN_BASELINE }) }, '填入设计基线') : null))

      return h('div', { className: 'am-editor-shell' },
        h('aside', { className: 'am-editor-rail' },
          h(Btn, { kind: 'ghost', icon: 'back', onClick: () => leaveForm('返回上一步'), disabled: busy, style: { paddingLeft: 0, marginBottom: T.space.s4 } }, '返回上一步'),
          h('div', { className: 'am-editor-kicker' }, creating ? '新建智能体' : '自己写'),
          h('h1', { className: 'am-editor-name' }, draft.title || '新智能体'),
          h('div', { className: 'am-editor-scope' }, draft.scope === 'project' ? '项目级 · 仅当前项目' : '用户级 · 所有项目'),
          // 草稿会跨返回保留，那就必须让人看得见「这份还没保存」（B-1）。
          dirty ? h('span', { className: 'am-editor-unsaved', role: 'status' }, '未保存') : null,
          h('ol', { className: 'am-editor-nav' },
            tabs.map((item) => h('li', { key: item.key },
              h('button', {
                type: 'button',
                'aria-current': activeTab === item.key ? 'true' : undefined,
                onClick: () => {
                  // 切页签会把 05 页连同展开的风格库一起卸载。
                  if (activeTab !== item.key && !leaveStylesLayer('切换页签')) return
                  setTab(item.key)
                },
              }, h('b', null, item.no), item.label)))),
          // 「换一个起点」：编辑器里总得有路回到模板库，否则 tplOrigin='edit'
          // 那条返回分支永远走不到（它原来就是个死分支）。
          typeof props.onPickTemplate === 'function'
            ? h('div', { style: { marginTop: T.space.s5 } },
                h(Btn, { kind: 'ghost', onClick: () => { if (!leaveStylesLayer('换一个起点')) return; props.onPickTemplate() }, disabled: busy, style: { paddingLeft: 0 } },
                  props.templateLabel === undefined || props.templateLabel === ''
                    ? '换一个起点'
                    : `起点：${props.templateLabel} · 换`))
            : null),
        h('div', { className: 'am-editor-main' },
          failure ? h('div', { style: S.err }, failure) : null,
          stale
            ? h('div', { style: { ...S.row, gap: T.space.s3, marginBottom: T.space.s4 } },
                h('span', { style: S.faint }, '文件在你打开之后被别处改过。'),
                h(Btn, { onClick: () => { void reloadLatest() }, disabled: busy }, '读取最新版（保留我的修改）'))
            : null,
          notice ? h('div', { style: S.ok }, notice) : null,
          h('h2', { className: 'am-editor-heading' }, heading),
          h('p', { className: 'am-editor-lede' }, lede),
          h('div', { className: 'am-editor-section' }, content),
          h('div', { className: 'am-editor-foot' },
            h(Btn, { kind: 'primary', onClick: () => { void submit() }, disabled: busy }, busy ? '保存中…' : (creating ? '创建智能体' : '保存修改')),
            // 这里其实不丢草稿（Panel 持有），叫「取消」会让人以为改动没了。
            h(Btn, { onClick: () => leaveForm(creating ? '稍后再建' : '先不保存'), disabled: busy }, creating ? '稍后再建' : '先不保存'),
            h('div', { style: S.grow }),
            h(Btn, { onClick: () => { void saveAsTemplate() }, disabled: busy, title: '把当前配置存成模板' }, '存为模板'))))
    }
    /* ══════════════════════════════════════════════════════════════
     * §8 起点：领域快捷入口 + 更多模板
     *
     * 领域卡不再是「首页」，而是同页「快速开始」区里的起点：
     * 点一下就把该领域的工具与提示词起点填进统一编辑器。
     * 领域决定工具与提示词起点，所以替用户勾好工具并说明理由；
     * 用户改过工具后不再覆盖（尊重既有选择优先于自动推断）。
     * ══════════════════════════════════════════════════════════════ */

    const TEMPLATE_GROUPS = [
      { name: '视觉', ids: ['video-aesthetic', 'graphic-design', 'ui-ux-design'], note: '风格、画面与动效' },
      { name: '技术', ids: ['code-review', 'architecture-design', 'data-analysis'], note: '审查、架构与数据' },
      { name: '内容', ids: ['copywriting', 'writing-research', 'translation'], note: '写作、研究与翻译' },
      { name: '产品运营', ids: ['product-manager', 'ops-growth'], note: '需求拆解与增长' },
      { name: '学习', ids: ['learning-tutor'], note: '诊断与阶段计划' },
    ]

    /**
     * 快速开始：五个领域 + 一个「空白」。
     * 不承担导航职责——它就在列表下方，因此不做成整页，只做成一排卡。
     */
    function DomainHome(props) {
      const groups = props.groups ?? TEMPLATE_GROUPS
      const byId = props.templatesById ?? new Map()
      /**
       * 卡面说明：优先写「点进去会拿到哪份模板」。
       *
       * 这张卡只有一步、点完直接进预填好的编辑器，所以必须事先说清会选谁。
       * 早先这里写的是 group.note（「审查、架构与数据」），那是对组内三份模板
       * 主题的缩写，读起来像导航，实际却是起点选择——两者错位正是用户
       * 「点技术却进了架构设计」的根源。模板没加载到时退回 note，不至于空着。
       */
      const metaFor = (group) => {
        const ids = Array.isArray(group.ids) ? group.ids : []
        const primary = ids.map((id) => byId.get(id)).find((item) => item !== undefined)
        // 模板没读到（或这份模板缺失）时，写清「还没读到」，别退回组说明——
        // 那句「审查、架构与数据」会让人以为点进去就是这三个之一（C-3）。
        if (primary === undefined) return '模板还没读到'
        return ids.length > 1
          ? `从「${primary.label}」开始 · 共 ${ids.length} 个`
          : `从「${primary.label}」开始`
      }
      return h('div', { className: 'am-domain-grid' },
        groups.map((group) => h('button', {
          key: group.name,
          type: 'button',
          className: 'am-domain-card',
          onClick: () => props.onPick(group),
        },
          h('span', { className: 'am-domain-name' }, group.name),
          h('span', { className: 'am-domain-meta', title: group.note }, metaFor(group)))),
        h('button', {
          key: 'custom',
          type: 'button',
          className: 'am-domain-card am-domain-custom',
          onClick: () => props.onPick(null),
        },
          h('span', { className: 'am-domain-plus', 'aria-hidden': true }, '+'),
          h('span', { className: 'am-domain-meta' }, '空白 · 自己写')))
    }

    /**
     * 更多模板：内置 12 个包 + 用户「存为模板」存下来的全部。
     *
     * 存在理由：`saveAsTemplate` 会把模板写进用户目录，但此前 UI 没有任何地方
     * 能选到用户模板（只认 TEMPLATE_GROUPS 里写死的内置 id），等于保存了个黑洞。
     * 这里按领域分组列出全部模板，并单独给用户模板一组。
     */
    function TemplateGallery(props) {
      // 模板列表由 Panel 统一加载：原来这里又拉一次，模板库失败时也没有重试入口（C-4）。
      const templates = Array.isArray(props.templates) ? props.templates : []
      const currentId = props.currentId
      const current = templates.find((item) => item.id === currentId)

      const byId = new Map(templates.map((item) => [item.id, item]))
      const used = new Set()
      const sections = []
      for (const group of TEMPLATE_GROUPS) {
        const items = group.ids.map((id) => byId.get(id)).filter((item) => item !== undefined)
        for (const item of items) used.add(item.id)
        if (items.length > 0) sections.push({ title: group.name, items })
      }
      const rest = templates.filter((item) => !used.has(item.id))
      const mine = rest.filter((item) => item.id.startsWith('user-'))
      const others = rest.filter((item) => !item.id.startsWith('user-'))
      if (mine.length > 0) sections.push({ title: '我存的模板', items: mine })
      if (others.length > 0) sections.push({ title: '其它', items: others })

      const row = (item) => h('button', {
        key: item.id,
        type: 'button',
        className: item.id === currentId ? 'am-tpl-item is-current' : 'am-tpl-item',
        'aria-current': item.id === currentId ? 'true' : undefined,
        onClick: () => props.onPick(item, props.mode),
      },
        h('span', { className: 'am-tpl-name' }, item.label),
        h('span', { className: 'am-tpl-desc' }, item.description || '没有写适用场景'),
        item.id === currentId
          ? h('span', { className: 'am-tpl-tag' }, '当前起点')
          : (item.id.startsWith('user-') ? h('span', { className: 'am-tpl-tag' }, '自建') : null))

      return h('div', { className: 'am-tpl' },
        // 模板页是唯一没有返回入口的屏幕：之前只能靠浏览器后退或 Esc，
        // 鼠标用户进来就出不去。这里补一个与详情页同规格的返回。
        h('div', { className: 'am-detail-back' },
          h(Btn, { kind: 'ghost', icon: 'back', onClick: props.onBack, style: { paddingLeft: 0 } }, '返回')),
        h('div', { className: 'am-tpl-head' },
          h('h1', { className: 'am-tpl-title' }, props.mode === 'new' ? '所有模板' : '换一个起点'),
          // 文案要说实话：换起点并不会覆盖全部内容，名字/触发场景/作用域/图标
          // 是保留的（pickTemplate 的 replace 分支），被换掉的是提示词、工具、
          // 判断标准与模型设置。原来写「内容会被覆盖」既不准确，也会吓退用户。
          h('p', { className: 'am-tpl-sub' }, props.mode === 'new'
            ? '每个模板都预填好提示词、工具与判断标准。选一个，再改成你要的样子。'
            : '会换掉提示词、工具与判断标准；名字、触发场景、作用域和图标保留。')),
        /* 从编辑器进来：说清「现在用的是哪份、换会替换什么」，并把当前起点标出来。
           原来这里只是 12 份模板排成一片，猜错了起点的人找不到自己那份（B-3）。 */
        props.mode === 'replace' && currentId !== undefined
          ? h('div', { className: 'am-tpl-current' },
              current === undefined
                ? '你现在的起点是自建/已删除的模板，下方列表里没有它的高亮。'
                : `已经按「${current.label}」填好，下方高亮的就是当前起点。换一份会替换提示词、工具与判断标准。`)
          : null,
        props.failure !== '' && props.failure !== undefined
          ? h('div', { style: S.err },
              props.failure,
              typeof props.onRetry === 'function'
                ? h(Btn, { style: { marginTop: T.space.s3 }, onClick: props.onRetry }, '重新读取模板')
                : null)
          : null,
        templates.length === 0 && !props.failure
          ? h('div', { style: S.muted }, '正在读取模板…')
          : sections.map((section) => h('div', { key: section.title, className: 'am-tpl-group' },
              h('h2', null, section.title),
              section.items.map(row))))
    }

    /**
     * 从中文显示名生成合法内部代号。
     * 规则与 Host 侧一致：小写字母开头，只含小写字母/数字/连字符，≤50 位。
     * 中文会被整段丢掉，所以纯中文名会退化成带时间戳的兜底值——这是有意为之：
     * 代号只是文件名，用户可读性由 title 承担。
     */
    let slugCounter = 0
    function slugFor(source) {
      const base = String(source ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
      if (base !== '' && /^[a-z]/.test(base)) return base.slice(0, 40)
      // 纯中文名会被上面的正则整段丢掉，退化成兜底值。
      // 不能用时间戳：同一毫秒内连点两次会撞同一个名字（实测 2000 次调用只有 2 个唯一值）。
      // 改成「内容哈希 + 单调计数器」，同一个名字稳定、不同名字不撞、连续调用也不撞。
      const digest = hashSeed(String(source ?? '')) % 46656
      slugCounter += 1
      const suffix = (digest + slugCounter).toString(36).padStart(3, '0')
      return `agent-${suffix}`
    }

    /** 领域 → 工具勾选的解释文案。自动勾选必须能说清理由。 */
    function toolReasonFor(template) {
      if (template === null || template === undefined) return null
      const tools = Array.isArray(template.defaults?.tools) ? template.defaults.tools : []
      const why = []
      if (tools.includes('fs')) why.push('读写文件')
      if (tools.includes('search')) why.push('检索代码与文档')
      if (tools.includes('bash')) why.push('跑脚本')
      if (tools.includes('web')) why.push('联网查资料')
      if (tools.includes('skill')) why.push('加载它自己的知识卡')
      if (tools.includes('present')) why.push('交付文件')
      return `${template.label}这个领域通常需要：${why.join('、')}。`
    }

    /** 把模板/领域包转成编辑器初值。没有模板时按默认工具起步。 */
    function seedFromTemplate(template, groupsList, scope, hint) {
      const base = normalizeDraft(template?.defaults ?? {}, scope)
      if (template === null || template === undefined) {
        base.tools = (groupsList ?? []).filter((item) => item.defaultOn && item.available !== false).map((item) => item.id)
        base.mode = 'agent'
      }
      if (base.name === '') base.name = slugFor(base.title || hint || 'agent')
      // 模板自己声明的模块要跟着草稿走，否则 05 页无法按模板决定显示什么。
      const declared = Array.isArray(template?.modules) ? template.modules : null
      return { ...base, scope, modules: declared }
    }

    /* ══════════════════════════════════════════════════════════════
     * §9 徽章：hero 与会话头部
     *
     * 点一下展开智能体菜单；选一个就用 Host 侧建会话（预设与创建同进程，
     * 不会出现 id 失配后静默回落）。
     * ══════════════════════════════════════════════════════════════ */
    function AgentBadge(props) {
      const [agents, setAgents] = useState([])
      const [open, setOpen] = useState(false)
      // 两类信息必须分开：
      //   failure  = 数据读取失败（决定是否走「没能读到」空态）
      //   notice   = 操作提示（如「先填项目路径」），只在顶部显示一行，不影响列表渲染
      // 早期版本把提示写进 failure，导致点启停后整个列表变成"读取失败"。
      const [failure, setFailure] = useState('')
      const [notice, setNotice] = useState('')
      const [menuPos, setMenuPos] = useState(null)
      const [hover, setHover] = useState(false)
      // 错误提示条挂在 body 的 fixed 层，落位要自己算；默认值保证首帧不跑到视口外。
      const [feedbackPos, setFeedbackPos] = useState({ top: 56, left: 8, width: 320 })
      // 失败时记住是谁，错误条才能直接重试（不用重新展开菜单找那一个）。
      const [retryName, setRetryName] = useState('')
      // 菜单与错误条都是 portal 到 body 的，脱离 Panel 的 [data-am-dark] 子树；
      // 不自己判断主题，暗色下菜单会变成「近白底 + 近白字」，一个字都看不见。
      const dark = useDarkTheme()
      const boxRef = useRef(null)
      // 菜单是 portal 出去的，不在 boxRef 子树里，必须单独存引用。
      // 用全局 querySelector('[data-am-agent-menu]') 会拿到「另一个徽章」的菜单：
      // hero 和 header 各挂一个 AgentBadge 实例，两个实例的菜单互相看不见对方，
      // 于是点自己菜单里的项会被判成「点在菜单外」而误关。
      const menuRef = useRef(null)

      const close = () => { setOpen(false); setMenuPos(null) }

      /**
       * 量出菜单该落在哪里。
       *
       * 竖直方向必须支持翻转：会话头部（header.utilities）在页面最顶端，
       * 锚点下方有空间；但 hero 徽章在视口中部偏下，向下展开会直接掉出屏幕。
       * 早期版本固定写 top = rect.bottom + 6，等于假设「锚点永远在上方」，
       * hero 位置的菜单就被画到视口外——用户看到的现象正是「点了没反应」。
       *
       * 水平宽度用 clientWidth 而不是 innerWidth：经典滚动条下 innerWidth
       * 比可视区宽 15–17px，用它算 left 会把菜单推到右边框外。
       *
       * 返回 null 表示锚点还没挂上（首帧 ref 为 null），由调用方给安全落位。
       */
      const measure = () => {
        const node = boxRef.current
        if (node === null || node === undefined || typeof node.getBoundingClientRect !== 'function') return null
        const rect = node.getBoundingClientRect()
        const viewportW = document.documentElement.clientWidth || window.innerWidth
        const viewportH = document.documentElement.clientHeight || window.innerHeight
        const width = Math.min(360, Math.max(280, viewportW - 16))
        const gap = 6
        const margin = 8
        const below = viewportH - rect.bottom - gap - margin
        const above = rect.top - gap - margin
        // 下方能放下「至少 240px」就向下开，否则向上开；上方也不够时取较大一侧。
        const flipUp = below < Math.min(240, above)
        const space = flipUp ? above : below
        // 下限 160 是「再小就不像菜单」的经验值，但绝不能超过视口本身：
        // 否则视口高 < 180 时菜单会被撑出屏幕（极端窗口下仍会溢出）。
        const maxHeight = Math.min(Math.max(160, Math.min(440, space)), viewportH - margin * 2)
        // 水平：默认与锚点右缘对齐，左侧不足 margin 时贴左边，绝不出视口。
        const left = Math.max(margin, Math.min(rect.right - width, viewportW - width - margin))
        return {
          left,
          width,
          maxHeight,
          // 翻转时的 top 依赖菜单真实高度，首帧只能按 maxHeight 估；
          // 渲染完成后由 settleHeight() 用实际高度校正。
          top: flipUp ? Math.max(margin, rect.top - gap - maxHeight) : rect.bottom + gap,
          flipUp,
          anchorTop: rect.top,
          anchorBottom: rect.bottom,
          gap,
          margin,
        }
      }

      /**
       * 翻转时用「菜单真实高度」回正位置。
       *
       * 只用 maxHeight 反推 top 会算错：菜单内容比 maxHeight 矮时，
       * 底边停在 rect.top - gap - maxHeight，与按钮之间留出一大段空白
       * （实测 8 个智能体时悬空 358px）。菜单真实高度只有渲染后才知道，
       * 所以先按估算落位，再用 offsetHeight 校正一次。
       *
       * 收敛性：top 的变化不影响菜单自身高度（内容与 maxHeight 都不变），
       * 所以校正一次即稳定；加 0.5px 阈值避免亚像素抖动导致的循环。
       */
      const settleHeight = () => {
        const node = menuRef.current
        if (node === null || node === undefined) return
        setMenuPos((current) => {
          if (current === null || !current.flipUp) return current
          const height = node.getBoundingClientRect().height
          if (!(height > 0)) return current
          const desired = Math.max(current.margin, current.anchorTop - current.gap - height)
          if (Math.abs(desired - current.top) < 0.5) return current
          return { ...current, top: desired }
        })
      }

      const toggleOpen = () => {
        if (open) { close(); return }
        // 徽章可能挂在会话页（Panel 从未打开过），token 样式不一定已注入。
        ensureTokens()
        const next = measure()
        // 量不到锚点（首帧 ref 尚未挂上）时也给安全落位，绝不落到视口外。
        setMenuPos(next ?? { left: 8, width: 300, maxHeight: 320, top: 72, flipUp: false, anchorTop: 78, anchorBottom: 78, gap: 6, margin: 8 })
        setOpen(true)
      }

      /**
       * 项目路径：面板把它存在 localStorage（'am.cwd'）。
       *
       * 徽章必须带上它两处都要用：① `/list?cwd=` 才能看到项目级智能体，
       * ② `/open-session` 才能在该项目下开会话。早先两处都没传，
       * 结果项目级智能体在会话头部完全看不到，注释里却写着「cwd 由面板传入」。
       */
      const projectCwd = (() => {
        try { return localStorage.getItem('am.cwd') || '' } catch { return '' }
      })()

      useEffect(() => {
        const suffix = projectCwd !== '' ? `?cwd=${encodeURIComponent(projectCwd)}` : ''
        api(`/agent-manager/list${suffix}`).then((value) => {
          // 徽章不需要 presetId：Host 在 openSession 时会懒注册并返回真实预设。
          setAgents((value && Array.isArray(value.definitions) ? value.definitions : []).filter((d) => d.enabledEffective && d.mode !== 'llm'))
        }).catch(() => {})
      }, [projectCwd])

      /**
       * 键盘：Esc 关、↑↓ 在菜单项之间移动、Home/End 跳到首尾、Tab 离开即关。
       *
       * 菜单是 portal 到 body 末尾的，Tab 顺序天然接不上触发按钮，
       * 所以打开时主动把焦点送进第一项，关闭时再还回触发按钮——
       * 否则纯键盘用户只能打开、无法选择（菜单项根本收不到焦点）。
       */
      useEffect(() => {
        if (!open) return
        const menuNode = menuRef.current
        const items = () => (menuNode === null || menuNode === undefined)
          ? []
          : [...menuNode.querySelectorAll('button[role="menuitem"]')]
        const first = items()[0]
        if (first !== undefined) first.focus()

        const onKey = (event) => {
          if (event.key === 'Escape') { event.stopPropagation(); close(); return }
          if (event.key === 'Tab') { close(); return }
          const list = items()
          if (list.length === 0) return
          const index = list.indexOf(document.activeElement)
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            list[(index + 1 + list.length) % list.length].focus()
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            list[(index - 1 + list.length) % list.length].focus()
          } else if (event.key === 'Home') {
            event.preventDefault(); list[0].focus()
          } else if (event.key === 'End') {
            event.preventDefault(); list[list.length - 1].focus()
          }
        }
        document.addEventListener('keydown', onKey)
        return () => {
          document.removeEventListener('keydown', onKey)
          // 关掉后焦点不能留在已卸载的 portal 里，否则整页失焦。
          const trigger = boxRef.current
          if (trigger !== null && trigger !== undefined && !trigger.contains(document.activeElement)) {
            const button = trigger.querySelector('button')
            if (button !== null) button.focus()
          }
        }
      }, [open])

      /**
       * 打开期间跟随滚动/缩放重新量位。
       *
       * 菜单是 portal + position:fixed，锚点在页面里会随滚动移动，
       * 不跟随就会出现「菜单悬在原地、按钮跑走了」的错位。
       * 用 capture 监听 scroll，容器内部滚动也能收到。
       */
      useEffect(() => {
        if (!open) return
        const reposition = () => {
          const next = measure()
          if (next === null) return
          setMenuPos(next)
          // 重排后菜单高度可能变化，翻转时要用新高度回正一次。
          requestAnimationFrame(() => settleHeight())
        }
        window.addEventListener('resize', reposition)
        window.addEventListener('scroll', reposition, true)
        return () => {
          window.removeEventListener('resize', reposition)
          window.removeEventListener('scroll', reposition, true)
        }
      }, [open])

      /**
       * 渲染后按菜单真实高度回正（仅翻转时需要）。
       *
       * 依赖里不放 menuPos.top：settleHeight 会改 top，放进去就成循环。
       * 只在「打开 / 展开工作区 / 列表变化 / 翻转方向变化」时校正，
       * 这些正是菜单高度会变的时机。
       */
      useEffect(() => {
        if (!open) return
        settleHeight()
      }, [open, agents.length, menuPos === null ? null : menuPos.flipUp])

      /**
       * 点空白处关闭。
       *
       * 用 pointerdown 而不是 click：按钮自己的 click 会先把菜单打开，
       * 若用 click 冒泡判断，同一次点击立刻又把它关掉（开→关抖动）。
       * pointerdown 在 click 之前触发，且这里只处理「落在菜单和按钮之外」的情况。
       */
      useEffect(() => {
        if (!open) return
        const onPointerDown = (event) => {
          const target = event.target
          if (!(target instanceof Node)) return
          if (boxRef.current !== null && boxRef.current.contains(target)) return
          // 只认自己这个实例的菜单，避免误判到另一个徽章的菜单上。
          if (menuRef.current !== null && menuRef.current.contains(target)) return
          close()
        }
        document.addEventListener('pointerdown', onPointerDown, true)
        return () => document.removeEventListener('pointerdown', onPointerDown, true)
      }, [open])

      /**
       * 直接开会话。
       *
       * 早期版本在这里展开二级菜单让用户选 workspace，而详情页的「开新会话」
       * 是直接开——同一件事两套交互。用户拍板（Q5）与详情页对齐：一个智能体
       * 一行，点一下就开会话，归属沿用当前项目。
       */
      const pick = async (agent) => {
        close()
        if (typeof props.openWorkspace !== 'function') { setFailure('此版本不支持打开智能体会话'); return }
        setFailure('')
        try {
          await props.openWorkspace(agent.name)
        } catch (error) {
          // 记下失败对象，错误条上给一个「重试」，用户不必重新展开菜单再找一遍。
          setRetryName(agent.name)
          setFailure(errorText(error))
        }
      }

      /**
       * 错误条落位：贴在徽章下方（下方放不下就翻到上方），左右不越出视口。
       *
       * 和菜单一样是 portal + fixed，所以必须自己量；不量就会退回文档流末尾，
       * 或者贴到按钮右缘后被头部容器裁掉。
       */
      const placeFeedback = () => {
        const node = boxRef.current
        if (node === null || node === undefined || typeof node.getBoundingClientRect !== 'function') return
        const rect = node.getBoundingClientRect()
        const viewportW = document.documentElement.clientWidth || window.innerWidth
        const viewportH = document.documentElement.clientHeight || window.innerHeight
        const width = Math.min(360, Math.max(240, viewportW - 16))
        const margin = 8
        const gap = 6
        const below = viewportH - rect.bottom - gap - margin
        // 提示条内容长度不定，按「至少要能放两行」判断能否向下开，否则向上翻。
        const flipUp = below < 56 && rect.top - gap - margin > below
        setFeedbackPos({
          top: flipUp ? Math.max(margin, rect.top - gap - 56) : rect.bottom + gap,
          left: Math.max(margin, Math.min(rect.left, viewportW - width - margin)),
          width,
        })
      }

      // 出现错误时先量位；容器宽度变化（切面板/窗口缩放）也重新量。
      useEffect(() => {
        if (failure === '') return undefined
        placeFeedback()
        const reposition = () => placeFeedback()
        window.addEventListener('resize', reposition)
        window.addEventListener('scroll', reposition, true)
        return () => {
          window.removeEventListener('resize', reposition)
          window.removeEventListener('scroll', reposition, true)
        }
      }, [failure])

      if (agents.length === 0) return null

      const menu = open && menuPos !== null
        ? ReactDOM.createPortal(
            h('div', {
              ref: menuRef,
              // portal 挂在 body 下，在 [data-am-root] 之外，
              // 不标这个属性就拿不到 --am-* 变量，菜单会变透明。
              'data-am-root': '',
              'data-am-dark': dark ? 'true' : undefined,
              // 供「点空白关闭」判定用：菜单挂在 body 下，不在 boxRef 子树里。
              'data-am-agent-menu': '',
              role: 'menu',
              'aria-label': '选择一个智能体开新会话',
              // 落位必须真的写进 style：早期版本只算了 menuPos 却没用它，
              // 于是 position:fixed 没有 top/left，退回文档流末尾被画到视口外。
              style: {
                position: 'fixed', zIndex: 1000,
                // border-box：否则 width 360 + 内边距 + 边框 = 370，
                // 窄窗口下会顶出视口右边。
                boxSizing: 'border-box',
                top: menuPos.top, left: menuPos.left,
                width: menuPos.width, maxWidth: 'calc(100vw - 16px)',
                maxHeight: menuPos.maxHeight, overflow: 'auto', padding: T.space.s2,
                borderRadius: T.radius.lg, border: '1px solid var(--dsw-alias-border-l2)',
                background: 'var(--am-surface-raised, var(--dsw-alias-bg-base))',
                boxShadow: '0 8px 28px rgba(0,0,0,0.16)',
                // 菜单挂在 body 下，脱离主题容器；显式给前景色，避免继承到浅色文字。
                color: 'var(--dsw-alias-label-primary)',
                fontFamily: 'inherit', fontSize: T.font.body,
              },
            },
              h('div', { style: { ...S.faint, padding: `${T.space.s2}px ${T.space.s3}px ${T.space.s3}px` } }, '选一个智能体开新会话'),
              agents.map((agent) => h('button', {
                key: agent.name,
                type: 'button',
                role: 'menuitem',
                style: {
                  display: 'flex', alignItems: 'center', gap: T.space.s3, width: '100%',
                  padding: `${T.space.s3}px ${T.space.s3}px`, borderRadius: T.radius.md,
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  textAlign: 'left', fontFamily: 'inherit', color: 'inherit',
                },
                onClick: () => { void pick(agent) },
              },
                h(Avatar, { name: agent.name, variant: agent.avatar, size: 26 }),
                h('span', { style: { minWidth: 0, flex: 1 } },
                  h('span', { style: { display: 'block', fontSize: T.font.body, fontWeight: 500 } }, agent.title || agent.name),
                  h('span', { style: { ...S.faint, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, agent.description || '')),
                h(Icon, { name: 'chevron', size: 13, style: { color: 'var(--dsw-alias-label-caption)' } })))),
            document.body)
        : null

      return h('div', { ref: boxRef, style: { position: 'relative', display: 'inline-flex' } },
        h('button', {
          type: 'button',
          style: {
            display: 'inline-flex', alignItems: 'center', gap: T.space.s3,
            padding: `3px ${T.space.s3}px 3px 5px`, borderRadius: T.radius.pill,
            border: '1px solid var(--dsw-alias-border-l2)',
            background: hover ? 'var(--am-surface-hover, var(--dsw-alias-interactive-bg-hover))' : 'transparent',
            color: 'var(--dsw-alias-label-primary)', cursor: 'pointer',
            fontSize: T.font.meta, fontFamily: 'inherit',
            transition: `background-color ${T.dur.hover} ${T.ease}`,
          },
          onClick: toggleOpen,
          onMouseEnter: () => setHover(true),
          onMouseLeave: () => setHover(false),
          title: '开一个绑定智能体的新会话',
          'aria-haspopup': 'menu',
          'aria-expanded': open,
        },
          h(Avatar, { name: agents[0].name, variant: agents[0].avatar, size: 20 }),
          '智能体',
          h('span', { style: { color: 'var(--dsw-alias-label-caption)', fontVariantNumeric: 'tabular-nums' } }, String(agents.length)),
          h(Icon, { name: 'chevronDown', size: 12, style: { color: 'var(--dsw-alias-label-secondary)' } })),
        failure !== ''
          ? ReactDOM.createPortal(
              h('div', {
                // 两个徽章分别挂在 hero 和会话头部，两者所在的容器都很窄（头部高 28px），
                // 原来贴着按钮绝对定位的错误框会被裁掉、长错误还会折成竖直一列
                // ——用户截图里那串「sessions.retain: unknown session …」正是这样。
                // 改成挂到 body 的 fixed 消息条：正常折行、可关闭、永远落在视口内。
                'data-am-root': '',
                'data-am-dark': dark ? 'true' : undefined,
                role: 'alert',
                style: {
                  position: 'fixed', zIndex: 1001, boxSizing: 'border-box',
                  top: feedbackPos.top, left: feedbackPos.left, width: feedbackPos.width,
                  display: 'flex', alignItems: 'flex-start', gap: T.space.s3,
                  background: 'var(--am-surface-raised, var(--dsw-alias-bg-base))',
                  border: '1px solid var(--dsw-alias-state-error-primary)',
                  borderRadius: T.radius.md, padding: `${T.space.s3}px ${T.space.s3}px`,
                  boxShadow: '0 6px 20px rgba(0,0,0,0.16)',
                  color: 'var(--dsw-alias-state-error-primary)',
                  fontSize: T.font.meta, lineHeight: 1.55, wordBreak: 'break-word',
                  fontFamily: 'inherit',
                },
              },
                h('span', { style: { flex: 1, minWidth: 0 } }, failure),
                retryName !== ''
                  ? h('button', {
                      type: 'button',
                      onClick: () => {
                        const agent = agents.find((item) => item.name === retryName)
                        setFailure('')
                        if (agent !== undefined) void pick(agent)
                      },
                      style: { border: 0, background: 'transparent', color: 'inherit', cursor: 'pointer', padding: 0, flex: 'none', fontSize: T.font.meta, textDecoration: 'underline', fontFamily: 'inherit' },
                    }, '重试')
                  : null,
                h('button', {
                  type: 'button',
                  onClick: () => { setFailure(''); setRetryName('') },
                  title: '关闭提示',
                  'aria-label': '关闭提示',
                  style: { border: 0, background: 'transparent', color: 'inherit', cursor: 'pointer', padding: 0, display: 'inline-flex', flex: 'none' },
                }, h(Icon, { name: 'close', size: 13 }))),
              document.body)
          : null,
        menu)
    }

    /* ══════════════════════════════════════════════════════════════
     * §10 主面板
     *
     * 信息架构（用户 2026-11-14 拍板，别再拆层）：
     *   一页两段 —— 上：我的智能体；下：快速开始（领域卡）+ 更多模板。
     *   新建只有一条路：直接进统一编辑器；领域/模板只是「预填好的起点」。
     *   返回逐级回退，且草稿由本组件持有 —— 回退不丢已填内容。
     * ══════════════════════════════════════════════════════════════ */

    /** 打开会话的跳转能力：由 apply 时注入，避免挂 window 全局。 */
    let openSessionRef = null

    /**
     * 就地覆盖层（风格库 / 知识卡编辑器）的登记表。
     *
     * 面板只有「同一屏」和「整屏」两档容器，缺一个「就地覆盖层」原语：
     * 内层表单是独立写盘的，外层一旦 `back()` 就会连带丢掉它。这里约定
     * 任何覆盖层都挂 `data-am-layer`，并把「有没有未保存改动」登记进来，
     * 外层（面板 Esc / 详情返回）据此先问一句、再退。
     */
    const AM_LAYER = {
      open: false,
      dirty: false,
      /** 这一次 Esc 已经被内层处理掉了。内层在 capture 阶段置位，面板据此让位。 */
      escaped: false,
    }

    function Panel(props) {
      // 同步注入：整份样式表必须在首次绘制前就位，否则会闪一下无样式内容。
      // ensureTokens() 自带幂等（按 id 判断）与无 DOM 环境兜底，重复调用安全。
      ensureTokens()
      const [cwd, setCwd] = useState(() => {
        try { return localStorage.getItem('am.cwd') || '' } catch { return '' }
      })
      const [agents, setAgents] = useState([])
      const [groups, setGroups] = useState([])
      const [models, setModels] = useState({ providers: [], default: undefined })
      const [policy, setPolicy] = useState({ enabled: [], disabled: [], trustProject: false })
      const [parseErrors, setParseErrors] = useState([])
      // 两类信息必须分开：
      //   failure  = 数据读取失败（决定是否走「没能读到」空态）
      //   notice   = 操作提示（如「先填项目路径」），只在顶部显示一行，不影响列表渲染
      // 早期版本把提示写进 failure，导致点启停后整个列表变成"读取失败"。
      const [failure, setFailure] = useState('')
      // 动作失败（开新会话/启停/删除/保存）单独一格：写进 failure 会把整个卡片网格
      // 换成「没能读到智能体列表」，用户会以为智能体被删光了。
      const [actionError, setActionError] = useState('')
      // 项目路径本身不可用（打到一半 / 目录不存在）：就地提示，不动列表。
      const [cwdError, setCwdError] = useState('')
      const [notice, setNotice] = useState('')
      /* 「已建好，但项目级默认停用」这类提示需要可点的动作：
         只写一句话，等于把「去哪启用」丢给用户自己找（复查 B-2）。 */
      const [noticeAction, setNoticeAction] = useState(null)
      const [policyBusy, setPolicyBusy] = useState(false)
      const [detailTab, setDetailTab] = useState('overview')
      const [loading, setLoading] = useState(true)
      const [query, setQuery] = useState('')
      const [scopeFilter, setScopeFilter] = useState('all')

      /* 模板列表：首页领域卡要显示「从哪份模板开始」，模板库也要用同一份。
       * 早先只有模板库自己去拉，于是领域卡根本无法说明它会选哪一份——
       * 而 pickDomain 又按服务器顺序取，两者叠加就成了「说一套做一套」。
       * 提升到 Panel 后，卡面标签与点击结果来自同一个 Map。 */
      const [templates, setTemplates] = useState([])
      const [templatesError, setTemplatesError] = useState('')
      const reloadTemplates = useCallback(async () => {
        try {
          const value = await api('/agent-manager/templates')
          setTemplates(Array.isArray(value?.templates) ? value.templates : [])
          setTemplatesError('')
        } catch (error) {
          setTemplatesError(errorText(error))
        }
      }, [])
      const templatesById = useMemo(() => new Map(templates.map((item) => [item.id, item])), [templates])

      /* 屏幕只有四块：home（列表+快速开始）/ detail / edit / templates。
       * 早期版本同时有 mode 与 view 两套状态（browse|detail|edit|create ×
       * domains|agents），两套状态可以组合出 8 种，其中若干种是空屏，
       * 正是「幽灵态」和「返回跳层」的来源。现在合并成单一 screen。 */
      const [screen, setScreen] = useState('home')      // home | detail | edit | templates
      const [selectedName, setSelectedName] = useState(null)

      /* 草稿：由 Panel 持有，AgentForm 受控。
       * 回退到列表再进来，01–05 填过的内容还在（Q4）。 */
      const [draft, setDraft] = useState(null)
      const [draftMode, setDraftMode] = useState('create')   // create | edit
      const [draftTemplateId, setDraftTemplateId] = useState(undefined)
      const [draftTemplate, setDraftTemplate] = useState(null)
      const [draftNeed, setDraftNeed] = useState('')
      const [dirty, setDirty] = useState(false)
      // 表单正在提交时，Esc 不能把编辑器退掉：请求还在飞，失败的提示会随组件卸载一起消失。
      const [formBusy, setFormBusy] = useState(false)
      /* 草稿基线：开新草稿 / 换编辑对象时写入。脏 = 当前草稿 ≠ 基线。
       * 早先由表单内的 `edited` 标记判定脏，但表单会随换屏卸载重挂载，
       * 标记一归零，「有未保存改动」就变成假，换目标确认与继续编辑守卫全部失效。 */
      const [draftBaseline, setDraftBaseline] = useState(null)
      // 「所有模板」是从首页进来的还是编辑器里换起点：决定返回落点。
      const [tplOrigin, setTplOrigin] = useState('home')

      const [showProject, setShowProject] = useState(() => Boolean(cwd))
      const bodyRef = useRef(null)
      // 滚动容器（.am-body）用于换屏归位；bodyRef 是根节点，不滚。
      const scrollRef = useRef(null)
      const homeScroll = useRef(0)
      const lastScreen = useRef('home')
      const [panelWidth, setPanelWidth] = useState(1180)
      const [focusIndex, setFocusIndex] = useState(-1)
      const sequence = useRef(0)
      // 保存/删除等写操作的并发闸：连点两次只发一次请求，避免重复写文件或删已删项。
      const mutationBusy = useRef(false)
      const searchRef = useRef(null)
      // 卡片 DOM 引用表：方向键必须真的把焦点移到卡片上，
      // 只改 state 的话键盘用户按方向键什么都不会发生（焦点仍停在原处）。
      const cardRefs = useRef(new Map())
      const cwdRef = useRef(null)
      const rememberCard = (name) => (node) => {
        if (node === null) cardRefs.current.delete(name)
        else cardRefs.current.set(name, node)
      }

      /* options.silent：写操作后的刷新不把整张列表换成骨架（复查 A-10：
         保存/删除/启停之后列表闪一下骨架，像是重进了面板）。 */
      const load = useCallback(async (options = {}) => {
        const silent = options.silent === true
        const id = ++sequence.current
        if (!silent) setLoading(true)
        setFailure('')
        try {
          // 先校验路径，避免输入一半时不断触发目录扫描与错误提示。
          if (cwd.trim() !== '' && !cwd.startsWith('/')) {
            setCwdError('项目路径需要是以 / 开头的绝对路径')
            return
          }
          const suffix = cwd ? `?cwd=${encodeURIComponent(cwd)}` : ''
          const value = (await api(`/agent-manager/list${suffix}`)) || {}
          if (id !== sequence.current) return
          setCwdError('')
          setAgents(Array.isArray(value.definitions) ? value.definitions : [])
          setPolicy(value.policy || { enabled: [], disabled: [], trustProject: false })
          setParseErrors(Array.isArray(value.errors) ? value.errors : [])
        } catch (error) {
          if (id !== sequence.current) return
          // 路径还不可用 ≠ 读不到列表：地址栏里敲到一半（/Users/da）时，
          // Host 会回 BAD_CWD，旧实现把它当读取失败，整张列表被错误空态顶掉。
          // 现在只在项目设置里就地报错，已有数据原样留着。
          if (error && error.code === 'BAD_CWD') { setCwdError(errorText(error)); return }
          setFailure(errorText(error))
        } finally {
          if (id === sequence.current) setLoading(false)
        }
      }, [cwd])

      useEffect(() => { try { localStorage.setItem('am.cwd', cwd) } catch { /* 忽略 */ } }, [cwd])
      useEffect(() => { const timer = setTimeout(() => { void load() }, 500); return () => clearTimeout(timer) }, [load])
      // 纯回执 6 秒后自己收起；带动作的提示留着等用户处理，别吞掉「启用它」（B-3）。
      useEffect(() => {
        if (notice === '' || noticeAction !== null) return undefined
        const timer = setTimeout(() => setNotice(''), 6000)
        return () => clearTimeout(timer)
      }, [notice, noticeAction])
      useEffect(() => {
        if (!dirty) return
        const warn = (event) => { event.preventDefault(); event.returnValue = '' }
        window.addEventListener('beforeunload', warn)
        return () => window.removeEventListener('beforeunload', warn)
      }, [dirty])
      useEffect(() => {
        // 选中项被删除（或详情页指向一个已不存在的名字）：回列表。
        // 用 selectedName/agents 判断而不是 current —— current 在后面才声明，
        // 早期版本把它放进这个 effect 直接触发 TDZ，全链路测试一起挂。
        if (screen === 'detail' &&
            (selectedName === null || !agents.some((agent) => agent.name === selectedName))) {
          setScreen('home')
        }
      }, [agents, screen, selectedName])

      /* 换屏时把滚动位置归位：列表滚到很下面的某张卡再点进详情，详情会从
       * 中间开始，标题与「全部智能体」都在视口外（2026-11-21 复查 A-5）。
       * 回列表则恢复离开时的位置，不把用户丢回顶部。 */
      useEffect(() => {
        const box = scrollRef.current
        if (box !== null && box !== undefined) {
          if (lastScreen.current === 'home' && screen !== 'home') homeScroll.current = box.scrollTop
          if (screen !== lastScreen.current) box.scrollTop = screen === 'home' ? homeScroll.current : 0
        }
        lastScreen.current = screen
      }, [screen])

      useEffect(() => {
        api('/agent-manager/groups').then((value) => setGroups(Array.isArray(value) ? value : [])).catch(() => {})
        api('/agent-manager/models').then((value) => setModels(value || { providers: [] })).catch(() => {})
        // 模板列表只在这里拉一次，首页领域卡与模板库共用。
        // 失败不报错：首页照常可用，领域卡退回只显示领域名、点进去是空白起点。
        void reloadTemplates()
      }, [reloadTemplates])

      /* 量面板宽度：方向键的上下移动要按真实列数换算，否则会跳错行。 */
      useEffect(() => {
        const measure = () => setPanelWidth(window.innerWidth || 1180)
        measure()
        window.addEventListener('resize', measure)
        return () => window.removeEventListener('resize', measure)
      }, [])

      const filtered = useMemo(() => {
        const q = query.trim().toLowerCase()
        return agents.filter((agent) => {
          const inScope = scopeFilter === 'all' || (scopeFilter === 'project' ? agent.scope === 'project' : agent.scope === 'user')
          return inScope && (q === '' || `${agent.name} ${agent.title} ${agent.description}`.toLowerCase().includes(q))
        })
      }, [agents, query, scopeFilter])

      const current = selectedName === null ? null : (agents.find((agent) => agent.name === selectedName) || null)

      /** 静默刷新之后把键盘焦点放回一个说得通的位置（否则掉到 body，等于丢焦点）。 */
      const focusSoon = (target) => {
        setTimeout(() => {
          try {
            const node = typeof target === 'string' ? document.querySelector(target) : target?.current
            node?.focus?.()
          } catch { /* 忽略 */ }
        }, 90)
      }

      /* ── 起点：开一个新的编辑会话（唯一的「新建」出口） ────────── */
      /**
       * 丢草稿前的唯一守卫。
       *
       * 原来只拦「首页有未建完的草稿」（判 draftMode === 'create'）：编辑态的改动
       * 换到新建或另一张卡时被静默覆盖。现在任何有改动的草稿换目标都先问一句。
       * 返回 false = 用户选择留下当前草稿，调用方必须原样返回、什么都不改。
       */
      const confirmLeaveDraft = (action) => {
        if (!dirty || draft === null) return true
        const label = draft.title.trim() === '' ? '未命名智能体' : draft.title.trim()
        const what = draftMode === 'create' ? `「${label}」还没建完` : `「${label}」有没保存的修改`
        return window.confirm(`${what}，${action}会丢掉它。继续？`)
      }

      const startCreate = useCallback((template, group, options = {}) => {
        // 有未保存的草稿就不能被「新建/领域卡」静默冲掉：上面挂着「继续编辑」，
        // 一按旁边的卡或另一张卡的编辑就没了。
        if (!confirmLeaveDraft('新建')) return
        const scope = cwd ? 'project' : 'user'
        const seed = seedFromTemplate(template ?? null, groups, scope, group?.name || 'agent')
        setDraft(seed)
        setDraftBaseline(seed)
        setDraftMode('create')
        setDraftTemplateId(template?.id)
        setDraftTemplate(template ?? null)
        setDraftNeed(options.need ?? '')
        setDirty(false)
        setSelectedName(null)
        setScreen('edit')
      }, [cwd, groups, draftMode, draft, dirty])

      /* 领域卡：取该领域里第一个能用的模板作为起点。 */
      /**
       * 领域卡：取该领域的「默认起点」。
       *
       * 早期实现是 `list.find(item => group.ids.includes(item.id))`——遍历的是
       * **Host 返回的列表顺序**（`readdir` 的字典序），不是 `group.ids` 的顺序。
       * 于是 `group.ids[0]` 那个「应当默认选中」的声明从未生效：
       *   视觉   → 实际进「平面品牌视觉」（应为 video-aesthetic）
       *   技术   → 实际进「架构设计」（应为 code-review）
       *   产品运营 → 实际进「运营增长」（应为 product-manager）
       * 5 个领域里 3 个选错。现在改成按 `group.ids` 的顺序找，把顺序声明真正当回事；
       * 同时让首页与它共用同一份模板列表（见 useTemplates），卡面标签和点击结果
       * 来自同一份数据，不可能再对不上。
       */
      const pickDomain = useCallback((group) => {
        let template = null
        if (group !== null && Array.isArray(group?.ids)) {
          for (const id of group.ids) {
            const hit = templatesById.get(id)
            if (hit !== undefined) { template = hit; break }
          }
        }
        startCreate(template, group)
      }, [startCreate, templatesById])

      /* 模板页里点一份模板：新建就换起点，替换就填进当前草稿。 */
      const pickTemplate = useCallback((template, mode) => {
        if (mode === 'replace') {
          const scope = cwd ? 'project' : 'user'
          const seed = seedFromTemplate(template, groups, scope, template.label)
          // 保留用户已经写过的名字/触发场景：换起点不该抹掉他的措辞。
          setDraft((previousDraft) => ({
            ...seed,
            title: previousDraft?.title?.trim() ? previousDraft.title : seed.title,
            description: previousDraft?.description?.trim() ? previousDraft.description : seed.description,
            scope: previousDraft?.scope ?? seed.scope,
            avatar: previousDraft?.avatar || seed.avatar,
          }))
          setDraftTemplateId(template.id)
          setDraftTemplate(template)
          setDirty(true)
          setScreen('edit')
          return
        }
        startCreate(template, null)
      }, [cwd, groups, startCreate])

      const openEdit = (agent) => {
        // 改到一半点「取消」→ 回详情 → 再点「编辑」，之前看到的是原值，
        // 改动无声消失。同一份定义且 dirty 时保留草稿，用户能接着改。
        const sameTarget = draftMode === 'edit' && selectedName === agent.name && draft !== null && dirty
        // 换编辑对象时，当前草稿（可能是另一份定义或还没建完的）不能被静默覆盖。
        if (!sameTarget && !confirmLeaveDraft(`去编辑「${agent.title || agent.name}」`)) return
        setSelectedName(agent.name)
        setDraftMode('edit')
        if (!sameTarget) {
          const next = normalizeDraft(agent, agent.scope)
          setDraft(next)
          setDraftBaseline(next)
          setDraftTemplateId(undefined)
          setDraftTemplate(null)
          setDraftNeed('')
          setDirty(false)
        }
        setScreen('edit')
      }

      const openDetail = (agent) => {
        setSelectedName(agent.name)
        setDetailTab('overview')
        setScreen('detail')
      }

      /* ── 返回：唯一入口，Esc 与所有「返回」按钮共用 ─────────────
       * 逐级回退，且不清草稿：
       *   模板（从首页来）→ 首页
       *   模板（从编辑器来）→ 编辑器
       *   编辑器（编辑态）→ 详情
       *   编辑器（创建态）→ 首页（草稿留着，首页有「继续」入口）
       *   详情 → 首页
       */
      const back = useCallback(() => {
        if (screen === 'templates') { setScreen(tplOrigin === 'edit' ? 'edit' : 'home'); return }
        if (screen === 'edit') {
          if (draftMode === 'edit' && selectedName !== null) { setScreen('detail'); return }
          setScreen('home')
          return
        }
        if (screen === 'detail') {
          // 知识库页签也算一层：Esc 先回概览，再退列表（C-12）。
          if (detailTab !== 'overview') { setDetailTab('overview'); return }
          setScreen('home')
          return
        }
      }, [screen, tplOrigin, draftMode, selectedName, detailTab, formBusy])

      const discardDraft = () => {
        setDraft(null)
        setDraftBaseline(null)
        setDirty(false)
        setDraftNeed('')
        setDraftTemplate(null)
        setDraftTemplateId(undefined)
        setNotice('已放弃这次未完成的草稿')
      }

      /**
       * 面板里有正在使用的内层覆盖物吗？
       *
       * 现在只有风格库编辑器（`[data-am-styles]`）。它带自己的 Esc 语义与
       * 独立写盘的表单，面板级 Esc 必须让位，否则「退一层」会变成「退出编辑器」。
       * 以后再加弹层，在这里登记即可（或改用统一的 `[data-am-layer]` 约定）。
       */
      const hasInnerLayer = () => {
        try {
          return AM_LAYER.open || document.querySelector('[data-am-layer]') !== null
        } catch { return false }
      }

      /* 键盘：↑↓ 移动、Enter 打开、Esc 逐层退。只在没有输入焦点时生效。 */
      useEffect(() => {
        const onKey = (event) => {
          const target = event.target
          const typing = target !== null && target !== undefined && (
            target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'
          )
          if (event.key === 'Escape') {
            // 内层已经处理过这一下：无论焦点在哪都先把它消费掉。
            // 放在 typing 之前，是因为「内层里输入框按 Esc」也会置标记并 return，
            // 留着不消费会吞掉面板的下一次 Esc（实测：要按三次才退得出去）。
            if (AM_LAYER.escaped === true) { AM_LAYER.escaped = false; return }
            // 输入框里按 Esc 只退出输入，不打断流程：用户是在取消输入，不是在取消这一步。
            if (typing) { target.blur(); return }
            // 有内层覆盖物（风格库编辑器）时一律让位：它自己处理 Esc，
            // 且它的改动是独立写盘的，不能被「退出编辑器」连带丢掉。
            // 注意 stopPropagation 对同一节点上的多个 document 监听器无效，
            // 所以这里必须主动判断，不能指望内层拦住。
            if (hasInnerLayer()) return
            // 提交中：不退出、不折叠，等请求回来（复查 A-13）。
            if (screen === 'edit' && formBusy) return
            if (screen !== 'home') { back(); return }
            if (query !== '') setQuery('')
            return
          }
          if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && screen === 'home') {
            event.preventDefault(); searchRef.current?.focus?.(); searchRef.current?.select?.(); return
          }
          if (event.key === '/' && !typing && screen === 'home') {
            event.preventDefault(); searchRef.current?.focus?.(); return
          }
          if (typing) return
          if (screen !== 'home') return
          const ARROWS = ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight']
          if (ARROWS.includes(event.key)) {
            /* 方向键按「屏幕上真实的卡片顺序 + 真实列数」走，不再用窗口宽度估算。
               两处修正（2026-11-22 验收）：
               - 列数：网格有 maxWidth 1040，按 innerWidth 算会多出一列，↓ 会斜一格；
               - 顺序：默认「全部」下先用户级后项目级分组，DOM 顺序 ≠ filtered 顺序，
                 用 filtered 索引会让 → 跨组跳。 */
            const cards = [...document.querySelectorAll('.am-agent-card')]
            if (cards.length === 0) return
            const active = document.activeElement
            const at = cards.indexOf(active)
            if (at < 0) return
            event.preventDefault()
            const sectionOf = (node) => node?.closest('[data-am-scope]')
            const section = sectionOf(cards[at])
            const rowTop = cards[at].getBoundingClientRect().top
            const columns = Math.max(1, cards.filter((node) => sectionOf(node) === section
              && Math.abs(node.getBoundingClientRect().top - rowTop) < 4).length)
            const step = event.key === 'ArrowRight' ? 1
              : event.key === 'ArrowLeft' ? -1
              : event.key === 'ArrowDown' ? columns
              : -columns
            let next = at + step
            next = Math.max(0, Math.min(cards.length - 1, next))
            // 上下移动不跨分组：不然后半段会跳进另一组的第一张。
            if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && sectionOf(cards[next]) !== section) {
              return
            }
            if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
              if (sectionOf(cards[next]) !== section) return
            }
            const node = cards[next]
            node.focus()
            const name = node.getAttribute('data-am-name')
            if (name !== null && name !== '') setSelectedName(name)
            setFocusIndex(next)
            return
          }
          if (event.key === 'Enter' && screen === 'home' && current !== null) {
            event.preventDefault()
            openDetail(current)
          }
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
      }, [filtered, focusIndex, screen, current, query, panelWidth, back])

      const patchPolicy = async (patch) => {
        // 慢盘上连点「启用/停用」会发两组策略 POST，先到后到的顺序不稳定（复查 A-12）。
        if (policyBusy) return
        if (!cwd) {
          // 展开项目设置，保留上下文；不把操作提示误报成读取失败。
          setShowProject(true)
          setNotice('启停会保存为这个项目的本地策略。先填写项目路径，再点启用/停用。')
          setTimeout(() => {
            try {
              cwdRef.current?.focus?.()
              cwdRef.current?.scrollIntoView?.({ block: 'nearest' })
            } catch { /* 忽略 */ }
          }, 0)
          return
        }
        setNotice('')
        setActionError('')
        setPolicyBusy(true)
        try {
          await api('/agent-manager/policy', { method: 'POST', body: JSON.stringify({ cwd, ...patch }) })
          await load({ silent: true })
        } catch (error) { setActionError(errorText(error)) } finally { setPolicyBusy(false) }
      }

      const toggle = async (agent) => {
        const enabled = policy.enabled || []
        const disabled = policy.disabled || []
        if (agent.enabledEffective) {
          await patchPolicy({ disabled: [...new Set([...disabled, agent.name])], enabled: enabled.filter((name) => name !== agent.name) })
        } else {
          await patchPolicy({
            disabled: disabled.filter((name) => name !== agent.name),
            enabled: agent.scope === 'project' ? [...new Set([...enabled, agent.name])] : enabled,
          })
        }
      }

      const save = async (definition) => {
        if (mutationBusy.current) return
        // 同名静默覆盖是数据丢失：`name` 由标题 slug 推导，两篇同标题的智能体
        // 会算出同一个 name，Host 直接写同一份 .md。新建时先拦一道，
        // 编辑时排除「自己」这一份。
        const clash = agents.find((item) => item.name === definition.name)
        if (clash !== undefined && !(draftMode === 'edit' && selectedName === definition.name)) {
          throw new Error(`已经有同名智能体「${clash.title || clash.name}」。换个名字，或在它上面编辑。`)
        }
        mutationBusy.current = true
        try {
          setNotice('')
          const { previousScope, ...rest } = definition
          await api('/agent-manager/save', {
            method: 'POST',
            body: JSON.stringify({
              cwd,
              scope: definition.scope,
              previousScope,
              definition: rest,
              ...(draftMode === 'create' && draftTemplateId !== undefined ? { templateId: draftTemplateId } : {}),
              // 并发写保护：把这次编辑开始时读到的文件时间带回去（C-14）。
              // 只有「同一个文件、同一份作用域」才比 mtime：换作用域时写的是另一个目录，
              // 拿用户文件的版本去比项目文件会恒 409（2026-11-22 验收 A-6）。
              ...(draftMode === 'edit' && typeof current?.mtimeMs === 'number' && current.scope === definition.scope
                ? { expectedMtime: current.mtimeMs }
                : {}),
            }),
          })
          const wasEdit = draftMode === 'edit'
          setDraft(null)
          setDraftBaseline(null)
          setDraftTemplateId(undefined)
          setDraftTemplate(null)
          setDraftNeed('')
          setDirty(false)
          const label = definition.title || definition.name
          const goDetail = () => {
            setSelectedName(definition.name)
            setDetailTab('overview')
            setScreen('detail')
            setNotice('')
            setNoticeAction(null)
          }
          if (!wasEdit && definition.scope === 'project') {
            // 项目级默认停用（store.js 的既定策略），但界面从没说过这件事，
            // 结果刚建好的智能体「开新会话」是灰的，用户以为建坏了（复查 B-2）。
            setNotice(`已建好「${label}」。项目级定义默认停用，要先启用才能开新会话。`)
            setNoticeAction({
              label: '启用它',
              run: async () => {
                await patchPolicy({ enabled: [...new Set([...(policy.enabled || []), definition.name])] })
                setNotice(`已启用「${label}」。`)
                // 启用完给个落点：新建的项目级卡在第二组末尾，光靠滚动很难找到（A-8）。
                setNoticeAction({ label: '去详情看它', run: goDetail })
              },
            })
          } else if (!wasEdit) {
            setNotice(`已保存「${label}」`)
            setNoticeAction({ label: '去详情看它', run: goDetail })
          } else {
            // 编辑保存后本来就落在这份的详情页，再给「去详情」等于原地踏步（A-7）。
            setNotice(`已保存「${label}」`)
            setNoticeAction(null)
          }
          // 改完就回它自己的详情；新建完回列表，接着建下一个。
          if (wasEdit) {
            setSelectedName(definition.name)
            setScreen('detail')
          } else {
            setSelectedName(null)
            setScreen('home')
            // 回列表时从顶部开始，刚落盘的卡片至少不会因为上次的滚动位置而看不见（C-8）。
            homeScroll.current = 0
          }
          // 换屏会重建列表：把焦点送回落点，别让它掉到 body。
          if (wasEdit) focusSoon('.am-detail-back button')
          else focusSoon(`[data-am-name="${definition.name}"]`)
          await load({ silent: true })
        } finally {
          mutationBusy.current = false
        }
      }

      const remove = async (agent) => {
        if (mutationBusy.current) return
        const cards = Number(agent.knowledgeCount) || 0
        const extra = cards > 0 ? `\n它积累的 ${cards} 张知识卡会一起删除，无法恢复。` : ''
        if (!window.confirm(`删除智能体「${agent.title || agent.name}」？${extra}`)) return
        mutationBusy.current = true
        try {
          await api('/agent-manager/remove', { method: 'POST', body: JSON.stringify({ cwd, name: agent.name, scope: agent.scope }) })
          if (selectedName === agent.name) { setSelectedName(null); setScreen('home') }
          // 删除是唯一没有回执的操作：卡片一消失，用户不确定是删了还是没读到（复查 A-11）。
          setNotice(`已删除「${agent.title || agent.name}」${cards > 0 ? `，连同 ${cards} 张知识卡` : ''}`)
          setNoticeAction(null)
          // 被删的卡可能正是 roving 的那一站：不重置的话整张网格会全部 tabIndex=-1。
          setFocusIndex(-1)
          await load({ silent: true })
          // 被删的卡可能正持有焦点：刷新后焦点会掉到 body，放回搜索框最稳。
          focusSoon(searchRef)
        } catch (error) { setActionError(errorText(error)) }
        finally { mutationBusy.current = false }
      }

      const openRun = async (agent) => {
        if (agent.mode !== 'agent') {
          setNotice('这个智能体是单次问答模式：请用 /agent，或让主智能体按需调用它。')
          return
        }
        if (!agent.enabledEffective) {
          setNotice('请先启用这个智能体，再开新会话。')
          return
        }
        try {
          const result = await api('/agent-manager/open-session', { method: 'POST', body: JSON.stringify({ name: agent.name, cwd: cwd || undefined }) })
          const sessionId = result?.sessionId
          if (typeof sessionId !== 'string' || sessionId === '') throw new Error('Host 未返回会话 id')
          // 优先用 inject 传进来的，退回闭包里那份；两者都没有才报错。
          const open = typeof props.openSession === 'function' ? props.openSession : openSessionRef
          if (typeof open !== 'function') throw new Error('当前版本不支持打开会话')
          // open 现在会等客户端会话列表回收新 id（见 openCreatedSession），
          // 必须 await，否则失败会被吞成未处理的 Promise 拒绝、界面毫无提示。
          await open(sessionId)
        } catch (error) { setActionError(errorText(error)) }
      }

      /* 空态要区分四件事，不能混：
       *   加载中 → 骨架
       *   加载失败 → 只显示错误与重试，不能同时说「还没有智能体」（否则用户以为数据没了）
       *   真的一个都没有 → 引导创建
       *   搜不到 → 说明是搜索没命中
       */
      const emptyState = failure !== ''
        ? h('div', { style: { ...S.empty, maxWidth: 420, margin: '0 auto' } },
            h('div', { style: { fontSize: T.font.h2, fontWeight: 500, color: 'var(--dsw-alias-label-secondary)' } }, '没能读到智能体列表'),
            h('div', { style: { ...S.muted, marginTop: T.space.s3, lineHeight: 1.7 } }, failure),
            h('div', { style: { marginTop: T.space.s5 } },
              h(Btn, { kind: 'primary', onClick: () => { void load() } }, '重试')))
        : loading
        ? h('div', { style: { display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${T.cardMin}px, 1fr))`, gap: T.space.s4 } },
            [0, 1, 2, 3, 4, 5].map((index) => h('div', {
              key: index,
              style: { padding: T.space.s6, minHeight: 244, borderRadius: T.radius.sm, border: '1px solid var(--am-card-edge)', background: 'var(--am-surface-raised)', display: 'flex', flexDirection: 'column', gap: T.space.s4 },
            },
              h('div', { style: { display: 'flex', justifyContent: 'center' } },
                h(Skeleton, { width: 64, height: 64, style: { borderRadius: 4 } })),
              h('div', { style: { textAlign: 'center', display: 'flex', flexDirection: 'column', gap: T.space.s2 } },
                h(Skeleton, { width: '60%' }),
                h(Skeleton, { width: '90%', height: 10 })),
              h(Skeleton, { width: '40%', height: 10 }))))
        : agents.length === 0
          ? h('div', { style: { ...S.empty, maxWidth: 420, margin: '0 auto' } },
              h('div', { style: { display: 'flex', justifyContent: 'center', opacity: 0.32 } },
                h(Avatar, { name: 'no-agents', variant: 'sprout', size: 64 })),
              h('div', { style: { marginTop: T.space.s5, fontSize: T.font.h2, fontWeight: 500, color: 'var(--dsw-alias-label-secondary)' } }, '还没有智能体'),
              h('div', { style: { ...S.muted, marginTop: T.space.s3, lineHeight: 1.7 } }, '建一个，把一类工作固化成角色。之后一句话就能叫它出来干活。'),
              h('div', { style: { marginTop: T.space.s5 } },
                h(Btn, { kind: 'primary', icon: 'plus', onClick: () => startCreate(null, null) }, '建第一个智能体')))
          : h('div', { style: { ...S.empty, maxWidth: 440, margin: '0 auto' } },
              /* 没搜也没筛到东西，和「搜了但没命中」是两回事，自救灾不相同：
               * 前者要改筛选范围，后者要清搜索。原来一律说「『』没有命中」
               * 并给一个点了没用的「清空搜索」（2026-11-21 复查 A-4）。 */
              h('div', { style: { fontSize: T.font.h2, fontWeight: 500, color: 'var(--dsw-alias-label-secondary)' } },
                query !== '' ? '没有匹配的智能体' : '这个范围还没有智能体'),
              h('div', { style: { ...S.muted, marginTop: T.space.s3, lineHeight: 1.7 } },
                query !== ''
                  ? `「${query}」没有命中任何一个${scopeFilter === 'all' ? '' : `（当前只看${scopeFilter === 'user' ? '用户级' : '项目级'}）`}。`
                  : `当前只看${scopeFilter === 'user' ? '用户级' : '项目级'}，还没有建在这个范围里的。`),
              h('div', { style: { marginTop: T.space.s5, display: 'flex', gap: T.space.s3, justifyContent: 'center', flexWrap: 'wrap' } },
                query !== '' ? h(Btn, { onClick: () => setQuery('') }, '清空搜索') : null,
                scopeFilter !== 'all'
                  ? h(Btn, { kind: query === '' ? 'primary' : undefined, onClick: () => setScopeFilter('all') }, '切回「全部」')
                  : null))

      const cardStyle = {
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fill, minmax(${T.cardMin}px, 1fr))`,
        gap: T.space.s6,
        maxWidth: 1040,
        margin: '0 auto',
      }
      const renderCard = (agent) => {
        const index = ordered.findIndex((item) => item.name === agent.name && item.scope === agent.scope)
        // 焦点还没有落点时，第一张（视觉上的第一张）占 Tab 站位；之后跟着 focusIndex 跑。
        const tabbable = focusIndex < 0 ? index === 0 : focusIndex === index
        return h(AgentCard, {
          key: `${agent.scope}:${agent.name}`,
          agent,
          cardRef: rememberCard(agent.name),
          selected: selectedName === agent.name && screen === 'detail',
          tabbable,
          onFocus: () => setFocusIndex(index),
          onOpen: () => openDetail(agent),
          onDelete: () => { void remove(agent) },
        })
      }
      const addCard = h('button', {
        type: 'button',
        className: 'am-card am-add-card',
        onClick: () => startCreate(null, null),
        style: { ...S.card, minHeight: 244, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', color: 'var(--am-muted)' },
      },
        h('span', { style: { fontFamily: 'var(--am-sans)', fontSize: 30, fontWeight: 300, lineHeight: 1 } }, '+'),
        h('span', { style: { fontSize: T.font.meta, marginTop: 4 } }, '创建一个新角色'))

      /* 用户级与项目级混排时，30+ 条就是一片没法看的卡海：卡片底栏那行小字
         （复查 B-5）。默认「全部」下按作用范围分组，分组标题克制地放在网格上方；
         筛选到单一范围时不分组，避免标题重复。 */
      const sections = scopeFilter === 'all' && agents.some((agent) => agent.scope === 'project') && agents.some((agent) => agent.scope === 'user')
        ? [
            { key: 'user', title: '用户级', items: filtered.filter((agent) => agent.scope === 'user') },
            { key: 'project', title: '项目级', items: filtered.filter((agent) => agent.scope === 'project') },
          ].filter((section) => section.items.length > 0)
        : [{ key: 'all', title: '', items: filtered }]

      /* 渲染顺序 = 屏幕顺序：分组后 DOM 先用户级后项目级，而 filtered 还是按名字排的。
         roving 站位与方向键都以这份「实际渲染顺序」为准。 */
      const ordered = sections.flatMap((section) => section.items)

      const cardGrid = h('div', { style: { maxWidth: 1040, margin: '0 auto' } },
        sections.map((section, index) => h('div', { key: section.key, 'data-am-scope': section.key },
          section.title === ''
            ? null
            : h('h2', {
                style: {
                  margin: `${index === 0 ? 0 : T.space.s7}px 0 ${T.space.s3}px`,
                  fontFamily: 'var(--am-sans)', fontSize: 11, fontWeight: 500,
                  letterSpacing: '.14em', textTransform: 'uppercase', textAlign: 'center',
                  color: 'var(--am-muted)',
                },
              }, section.title),
          h('div', { style: cardStyle },
            section.items.map(renderCard),
            index === sections.length - 1 ? addCard : null))))

      /* 首页：上段＝我的智能体，下段＝快速开始。Q1 的「合并成一页」。 */
      const homePage = h('div', null,
        h('div', { className: 'am-agents-head', style: { display: 'flex' } },
          h('div', { className: 'am-kicker' }, 'Agent Manager'),
          h('h1', { className: 'am-agents-title' }, '智能体'),
          h('p', { className: 'am-agents-sub' }, loading ? '正在读取…' : '把擅长的工作，交给专门的角色'),
          h('div', { className: 'am-agents-tools' },
            h('div', { className: 'am-search', style: { position: 'relative', display: 'flex', alignItems: 'center', width: 300 } },
              h(Icon, { name: 'search', size: 15, style: { position: 'absolute', left: T.space.s4, color: 'var(--am-muted)', pointerEvents: 'none' } }),
              h('input', {
                ref: searchRef,
                className: 'am-input',
                'aria-label': '搜索智能体',
                style: { ...S.input, width: '100%', paddingLeft: 36, paddingRight: 42, minHeight: 38, borderRadius: 999, background: 'var(--am-surface-raised)', borderColor: 'var(--am-line-strong)' },
                value: query,
                placeholder: '搜索名字或用途',
                onChange: (event) => { setQuery(event.target.value); setFocusIndex(-1) },
              }),
              h('kbd', { style: { position: 'absolute', right: 12, color: 'var(--am-muted)', fontSize: 11, fontFamily: 'inherit', pointerEvents: 'none' } }, '/')),
            h(Btn, { kind: 'primary', icon: 'plus', onClick: () => startCreate(null, null), style: { minHeight: 38, borderRadius: 999 } }, '新建智能体'))),

        h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: T.space.s5, margin: '10px auto ' + T.space.s6 + 'px', flexWrap: 'wrap', maxWidth: 1040 } },
          h('div', { className: 'am-segment', role: 'group', 'aria-label': '按作用范围筛选' },
            [['all', '全部'], ['user', '用户级'], ['project', '项目级']].map(([key, label]) => h('button', {
              key, type: 'button', 'aria-pressed': scopeFilter === key,
              onClick: () => { setScopeFilter(key); setFocusIndex(-1) },
            }, label))),
          // 头部已不再写总数，这里就要区分「全部」与「筛选后」：两处都写 9 时
          // 看不出筛选有没有生效（C-1）。
          h('span', { style: S.faint, 'aria-live': 'polite' }, filtered.length === agents.length ? `${agents.length} 个` : `显示 ${filtered.length} / ${agents.length}`),
          h(Btn, { kind: 'ghost', icon: 'edit', onClick: () => { void load() }, disabled: loading, title: '重新读取定义', 'aria-label': '刷新智能体列表' }, loading ? '刷新中' : '刷新')),

        /* 未完成的草稿：不静默丢，也不显示内部代号（用户不认识 agent-xxx）。 */
        draft !== null && draftMode === 'create'
          ? h('div', { className: 'am-resume' },
              h('span', null, '有一个没建完的：',
                h('b', null, draft.title.trim() === '' ? '未命名智能体' : draft.title)),
              h('span', { style: { opacity: .45 } }, '/'),
              h('button', { type: 'button', onClick: () => setScreen('edit') }, '继续编辑'),
              h('button', { type: 'button', onClick: discardDraft }, '放弃'))
          : null,

        loading || failure !== '' || filtered.length === 0
          ? emptyState
          : cardGrid,

        /* 下段：快速开始。领域卡保留「悬停反色」的既有定案，但不再是独立整页。 */
        h('div', { className: 'am-quick' },
          h('div', { className: 'am-quick-rule' }),
          h('div', { className: 'am-quick-head', style: { marginTop: T.space.s7 } },
            h('h2', { className: 'am-quick-title' }, '快速开始'),
            h('span', { className: 'am-quick-note' }, '选一个领域，工具与提示词起点已经替你填好')),
          h(DomainHome, {
            groups: TEMPLATE_GROUPS,
            templatesById,
            // pickDomain 现在是同步的（模板已在 Panel 里），不再点一次等一次网络。
            onPick: (group) => pickDomain(group),
          }),
          h('div', { className: 'am-quick-foot' },
            // 数字原来是把 TEMPLATE_GROUPS 里写死的 id 数相加得出的常量，
            // 模板加载失败时照样显示 12。改成「全部模板」，不假装知道数量。
            h('button', { type: 'button', onClick: () => { setTplOrigin('home'); setScreen('templates') } }, '更多模板 · 全部'),
            h('span', { style: { opacity: .5 } }, '/'),
            h('button', { type: 'button', onClick: () => startCreate(null, null) }, '什么都不用，从空白写'))),

        /* 项目能力不删，收进可展开的上下文设置，默认不干扰浏览。 */
        h('div', { style: { maxWidth: 1040, margin: '0 auto', padding: `${T.space.s7}px ${T.space.s6}px 0` } },
          h('details', {
            className: 'am-project-details',
            open: showProject || Boolean(cwd),
            onToggle: (event) => setShowProject(event.currentTarget.open),
          },
            h('summary', null,
              h(Icon, { name: 'chevronDown', size: 13, className: 'am-chevron-down', style: { transition: `transform ${T.dur.hover} ${T.ease}` } }),
              cwd ? '项目定义与信任' : '项目路径与信任策略',
              cwd ? h('span', { style: { maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--dsw-alias-label-caption)' } }, `· ${cwd}`) : null),
            h('div', { style: { padding: `${T.space.s3}px 0 ${T.space.s5}px 22px` } },
              h('div', { style: { ...S.row, gap: T.space.s3 } },
                h('input', {
                  ref: cwdRef,
                  className: 'am-input',
                  'aria-label': '项目绝对路径',
                  style: { ...S.input, flex: '1 1 280px', maxWidth: 520, minHeight: T.hit, fontSize: T.font.meta },
                  value: cwd,
                  placeholder: '项目绝对路径，例如 /Users/you/project',
                  onChange: (event) => setCwd(event.target.value),
                }),
                h(Btn, { onClick: () => { void load() }, disabled: loading }, loading ? '加载中…' : '应用'),
                cwd ? h(Btn, { kind: 'ghost', onClick: () => setCwd('') }, '清除项目') : null),
              h('div', { style: { ...S.hint, marginTop: T.space.s3 } }, '可同时查看用户级与项目级定义；项目定义默认停用，信任策略仅保存在本机。'),
              cwdError !== '' ? h('div', { role: 'alert', style: { ...S.err, marginTop: T.space.s3 } }, cwdError) : null,
              cwd
                ? h('label', { style: { display: 'flex', alignItems: 'center', gap: T.space.s2, marginTop: T.space.s4, fontSize: T.font.meta, color: 'var(--dsw-alias-label-secondary)' } },
                    h('input', { type: 'checkbox', checked: policy.trustProject === true, style: { accentColor: 'var(--dsw-alias-brand-primary)' }, onChange: (event) => { void patchPolicy({ trustProject: event.target.checked }) } }),
                    h('span', null, '信任此项目的定义（仅对当前项目生效）'))
                : null))))

      return h('div', { ref: bodyRef, 'data-am-root': '', 'data-am-dark': useDarkTheme() ? 'true' : undefined, style: S.root },
        /* 操作提示：一行就够，不影响列表渲染。 */
        notice !== ''
          ? h('div', {
              style: {
                display: 'flex', alignItems: 'center', gap: T.space.s3,
                margin: `0 ${T.space.s7}px ${T.space.s4}px`,
                padding: `${T.space.s3}px ${T.space.s4}px`,
                borderRadius: T.radius.md,
                background: 'var(--am-surface-sunken, var(--dsw-alias-bg-layer-1))',
                fontSize: T.font.meta, color: 'var(--dsw-alias-label-secondary)',
              },
            },
              h(Icon, { name: 'spark', size: 14, style: { color: 'var(--dsw-alias-label-caption)' } }),
              h('span', { style: { flex: 1 }, role: 'status', 'aria-live': 'polite' }, notice),
              noticeAction !== null
                ? h(Btn, { kind: 'primary', onClick: () => { void noticeAction.run() }, style: { minHeight: 26 } }, noticeAction.label)
                : null,
              h(Btn, { kind: 'ghost', onClick: () => { setNotice(''); setNoticeAction(null) }, style: { minHeight: 24, padding: '0 6px' } }, '知道了'))
          : null,
        /* 动作失败（开新会话/启停/删除）单独一条：不替换列表，可关闭。
           读取失败仍然走 emptyState，两者语义不同，别合并。 */
        actionError !== ''
          ? h('div', {
              role: 'alert',
              style: {
                display: 'flex', alignItems: 'flex-start', gap: T.space.s3,
                margin: `0 ${T.space.s7}px ${T.space.s4}px`,
                padding: `${T.space.s3}px ${T.space.s4}px`,
                borderRadius: T.radius.md,
                border: '1px solid var(--dsw-alias-state-error-primary)',
                background: 'var(--am-surface-raised, var(--dsw-alias-bg-base))',
                fontSize: T.font.meta, color: 'var(--dsw-alias-state-error-primary)',
                lineHeight: 1.55, wordBreak: 'break-word',
              },
            },
              h('span', { style: { flex: 1, minWidth: 0 } }, actionError),
              h(Btn, { kind: 'ghost', onClick: () => setActionError(''), style: { minHeight: 24, padding: '0 6px' } }, '知道了'))
          : null,
        /* 读取失败的红字只在主区显示一次（emptyState 里），这里不重复；
           解析错误是另一类问题（部分文件坏了但列表可用），单独提示。 */
        parseErrors.length > 0
          ? h('details', { style: { padding: `0 ${T.space.s7}px ${T.space.s3}px` } },
              h('summary', {
                style: { cursor: 'pointer', fontSize: T.font.meta, color: 'var(--dsw-alias-state-error-primary)' },
              }, `${parseErrors.length} 个定义文件解析失败`),
              // 只列前两条：长路径一次性铺开会把顶栏撑成两三行文本墙。
              h('ul', { style: { margin: `${T.space.s2}px 0 0`, paddingLeft: 18, fontSize: T.font.caption, color: 'var(--dsw-alias-state-error-primary)', lineHeight: 1.7 } },
                parseErrors.slice(0, 2).map((item) => h('li', { key: item.path }, item.path)),
                parseErrors.length > 2
                  ? h('li', { style: { opacity: .72 } }, `等 ${parseErrors.length} 个文件`)
                  : null))
          : null,

        h('div', { className: 'am-body', ref: scrollRef, style: { ...S.body, paddingTop: 8 } },
          h('div', { className: 'am-page-content' },
          screen === 'home'
            ? homePage
            : screen === 'detail' && current !== null
              ? h(AgentDetail, {
                  // key：详情页的 tab、长提示词展开态都是组件内 state，
                  // 不换 key 会跟着用户走到下一个智能体身上（在 A 看了知识库，
                  // 打开 B 也停在知识库）。
                  key: current.name,
                  agent: current,
                  groups,
                  tab: detailTab,
                  onTabChange: setDetailTab,
                  busy: policyBusy,
                  canToggle: Boolean(cwd),
                  onToggle: () => { void toggle(current) },
                  onEdit: () => openEdit(current),
                  onBack: back,
                  onRun: () => { void openRun(current) },
                  onDelete: () => { void remove(current) },
                  onReload: () => { void load() },
                })
              : screen === 'edit' && draft !== null
                ? h(AgentForm, {
                    // key 里不放草稿内容，否则每敲一个字都会重建表单、丢焦点。
                    key: draftMode === 'create' ? 'create-editor' : `edit:${selectedName ?? 'new'}`,
                    initial: draftMode === 'edit' ? current : undefined,
                    draft,
                    baseline: draftBaseline,
                    setDraft,
                    creating: draftMode === 'create',
                    cwd,
                    defaultScope: cwd ? 'project' : 'user',
                    groups, models,
                    // 草稿带着模板声明就照它办；没有声明时，编辑态看这份智能体
                    // 是否已经绑了风格（绑了就还得能改），创建态留 null 按显示处理。
                    modules: draft.modules ?? (current?.style !== undefined && current?.style !== '' ? ['style', 'knowledge'] : null),
                    onCancel: back,
                    onPickTemplate: draftMode === 'create' ? () => { setTplOrigin('edit'); setScreen('templates') } : undefined,
                    draftNeed,
                    toolReason: draftMode === 'create' ? toolReasonFor(draftTemplate) : null,
                    // 存为模板前要查重（A-14）；起点名让 rail 能写「起点：代码审查」（B-3）。
                    templateIds: new Set(templates.map((item) => item.id)),
                    templateLabel: draftTemplate === null || draftTemplate === undefined ? undefined : draftTemplate.label,
                    onDirtyChange: setDirty,
                    onBusyChange: setFormBusy,
                    onReloadLatest: async () => { await load({ silent: true }) },
                    onSave: save,
                  })
                : screen === 'templates'
                  ? h(TemplateGallery, {
                      // 只有「本来就在编辑器里」才按覆盖处理；从首页进来一律新建，
                      // 否则会把首页那份草稿当成编辑器内容覆盖掉。
                      mode: draft !== null && draftMode === 'create' && tplOrigin === 'edit' ? 'replace' : 'new',
                      templates,
                      failure: templatesError,
                      onRetry: () => { void reloadTemplates() },
                      currentId: draft !== null && draftMode === 'create' ? draftTemplateId : undefined,
                      onPick: pickTemplate,
                      onBack: back,
                    })
                  : homePage)))
    }

    return {
      // 供预览夹具渲染头像总览；生产运行不依赖这两个导出。
      __Avatar: Avatar,
      __LEGACY__: LEGACY_AVATARS,
      __slugFor: slugFor,
      inject: ['slots', 'uiWorkspace'],
      apply(ctx) {
        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register({ name: 'sidebar.panellist', id: 'agent-manager', order: 5, label: () => '智能体' }, PanelIcon))

        // 面板里的「开新会话」需要客户端跳转能力：用 slot 的 inject 传进去，
        // 与徽章同一套写法，不挂 window 全局。
        // 跳转回调同时存一份到闭包：main slot 若不支持 inject（老版本），
        // 面板仍能靠闭包拿到它，不会出现「点了没反应」。
        openSessionRef = (sessionId) => openCreatedSession(ctx, (id) => ctx.uiWorkspace.openSession(id), sessionId)
        const panelProps = () => ({ openSession: openSessionRef })
        ctx.slots.inject('main', () =>
          ctx.slots.register({ name: 'main', key: 'agent-manager', inject: panelProps }, Panel))

        // 徽章：hero（新会话）与会话头部（会话中）都能开绑定智能体的会话。
        // 徽章与详情页走同一条路：只按名字开，归属用当前项目（cwd 由面板传入）。
        const openWorkspace = async (name) => {
          // 与面板同一份项目路径：不带 cwd 时 Host 只扫用户目录，
          // 项目级智能体会「找不到」，会话也开在错误的目录下。
          let cwd = ''
          try { cwd = localStorage.getItem('am.cwd') || '' } catch { /* 忽略 */ }
          const result = await api('/agent-manager/open-session', {
            method: 'POST',
            body: JSON.stringify({ name, cwd: cwd !== '' ? cwd : undefined }),
          })
          const sessionId = result?.sessionId
          if (typeof sessionId !== 'string' || sessionId === '') throw new Error('Host 未返回会话 id')
          await openCreatedSession(ctx, (id) => ctx.uiWorkspace.openSession(id), sessionId)
        }
        const agentProps = () => ({ openWorkspace })
        ctx.slots.inject('conversation.hero.options', () =>
          ctx.slots.register({ name: 'conversation.hero.options', id: 'agent-manager-agent', order: 5, inject: agentProps }, AgentBadge))
        ctx.slots.inject('conversation.session.header.utilities', () =>
          ctx.slots.register({ name: 'conversation.session.header.utilities', id: 'agent-manager-agent', order: 90, inject: agentProps }, AgentBadge))
      },
    }
  },
})
